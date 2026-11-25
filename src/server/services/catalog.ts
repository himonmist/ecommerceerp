import "server-only";
import { postOpening } from "./accounting/posting";
import { withTenant, type Tx } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { categorySchema, productSchema, productUpdateSchema, slugify, type ProductInput, type ProductUpdateInput } from "@/lib/validation";
import { audit } from "./audit";
import type { z } from "zod";

export const PAGE_SIZE = 20;

async function uniqueSlug(tx: Tx, table: "product" | "category", base: string, excludeId?: string) {
  const root = base || "item";
  const rows = table === "product"
    ? await tx.product.findMany({ where: { slug: { startsWith: root } }, select: { slug: true, id: true } })
    : await tx.category.findMany({ where: { slug: { startsWith: root } }, select: { slug: true, id: true } });
  const taken = new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
}

async function defaultWarehouseId(tx: Tx) {
  const wh = await tx.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } });
  if (!wh) throw new Error("Tenant has no default warehouse");
  return wh.id;
}

async function assertPlanAllowsProduct(tx: Tx) {
  const sub = await tx.subscription.findFirst({ where: { status: { in: ["trialing", "active"] } }, include: { plan: true }, orderBy: { currentPeriodStart: "desc" } });
  const max = sub?.plan.maxProducts;
  if (max == null) return;
  const count = await tx.product.count({ where: { status: { not: "archived" } } });
  if (count >= max) throw new AppError("PLAN_LIMIT", `Your plan allows ${max} products. Upgrade to add more.`);
}

async function resolveBrand(tx: Tx, tenantId: string, name?: string) {
  if (!name) return null;
  const b = await tx.brand.upsert({ where: { tenantId_name: { tenantId, name } }, create: { tenantId, name }, update: {} });
  return b.id;
}

type VariantIn = z.output<typeof productSchema>["variants"][number];
const variantData = (v: Omit<VariantIn, "stock">) => ({
  title: v.title, sku: v.sku ?? null, barcode: v.barcode ?? null,
  onlinePrice: v.onlinePrice, offlinePrice: v.offlinePrice ?? null, compareAtPrice: v.compareAtPrice ?? null,
  costPrice: v.costPrice ?? "0", lowStockThreshold: v.lowStockThreshold,
});

export async function createProduct(ctx: Ctx, raw: ProductInput) {
  authorize(ctx, "catalog.manage");
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      await assertPlanAllowsProduct(tx);
      if (input.categoryId && !(await tx.category.findUnique({ where: { id: input.categoryId } }))) {
        throw new AppError("NOT_FOUND", "Category not found.");
      }
      const warehouseId = await defaultWarehouseId(tx);
      const product = await tx.product.create({
        data: {
          tenantId: ctx.tenantId, name: input.name, slug: await uniqueSlug(tx, "product", slugify(input.name)),
          categoryId: input.categoryId ?? null, brandId: await resolveBrand(tx, ctx.tenantId, input.brandName),
          channel: input.channel, shortDescription: input.shortDescription ?? null, description: input.description ?? null,
          status: input.status, isFeatured: input.isFeatured,
          images: input.imageUrl ? { create: [{ tenantId: ctx.tenantId, url: input.imageUrl }] } : undefined,
        },
      });
      const variants = [];
      for (const [i, v] of input.variants.entries()) {
        const variant = await tx.productVariant.create({
          data: { tenantId: ctx.tenantId, productId: product.id, isDefault: i === 0, ...variantData(v) },
        });
        await tx.stockLevel.create({ data: { tenantId: ctx.tenantId, variantId: variant.id, warehouseId, onHand: v.stock } });
        if (v.stock > 0) {
          await tx.stockMovement.create({
            data: { tenantId: ctx.tenantId, variantId: variant.id, warehouseId, type: "opening", qtyChange: v.stock, qtyBefore: 0, qtyAfter: v.stock,
              sourceType: "product", sourceId: product.id, createdBy: ctx.userId, notes: "Opening stock" },
          });
        }
        variants.push(variant);
      }
      const openingValue = input.variants.reduce((s, v) => s + Number(v.costPrice ?? 0) * v.stock, 0);
      await postOpening(tx, ctx, { kind: "stock", sourceId: product.id, amount: openingValue.toFixed(2), label: `stock of ${product.name}` });
      await audit(tx, ctx, "product.created", "product", product.id, undefined, { name: product.name, variants: variants.length });
      return { ...product, variants };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A variant with that SKU or barcode already exists.");
    throw e;
  }
}

export async function updateProduct(ctx: Ctx, id: string, raw: ProductUpdateInput) {
  authorize(ctx, "catalog.manage");
  const parsed = productUpdateSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      const before = await tx.product.findUnique({ where: { id }, include: { variants: true } });
      if (!before) throw new AppError("NOT_FOUND", "Product not found.");
      const product = await tx.product.update({
        where: { id },
        data: {
          name: input.name, channel: input.channel, status: input.status, isFeatured: input.isFeatured,
          shortDescription: input.shortDescription, description: input.description,
          categoryId: input.categoryId,
          brandId: input.brandName !== undefined ? await resolveBrand(tx, ctx.tenantId, input.brandName) : undefined,
          slug: input.name && input.name !== before.name ? await uniqueSlug(tx, "product", slugify(input.name), id) : undefined,
        },
      });
      if (input.imageUrl) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.create({ data: { tenantId: ctx.tenantId, productId: id, url: input.imageUrl } });
      }
      if (input.variants) {
        const warehouseId = await defaultWarehouseId(tx);
        for (const v of input.variants) {
          if (v.id) {
            if (!before.variants.some((x) => x.id === v.id)) throw new AppError("NOT_FOUND", "Variant not found.");
            await tx.productVariant.update({ where: { id: v.id }, data: variantData(v) });
          } else {
            const nv = await tx.productVariant.create({ data: { tenantId: ctx.tenantId, productId: id, isDefault: false, ...variantData(v) } });
            await tx.stockLevel.create({ data: { tenantId: ctx.tenantId, variantId: nv.id, warehouseId, onHand: 0 } });
          }
        }
      }
      await audit(tx, ctx, "product.updated", "product", id, { name: before.name, status: before.status }, { name: product.name, status: product.status });
      return product;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A variant with that SKU or barcode already exists.");
    throw e;
  }
}

export async function archiveProduct(ctx: Ctx, id: string) {
  return updateProduct(ctx, id, { status: "archived" });
}

export async function getProduct(ctx: Ctx, id: string) {
  authorize(ctx, "catalog.view", { write: false });
  const p = await withTenant(ctx.tenantId, (tx) =>
    tx.product.findUnique({ where: { id }, include: { variants: { include: { stockLevels: true }, orderBy: { isDefault: "desc" } }, images: true, category: true, brand: true } }));
  if (!p) throw new AppError("NOT_FOUND", "Product not found.");
  return p;
}

export async function listProducts(ctx: Ctx, opts: { q?: string; status?: string; page?: number }) {
  authorize(ctx, "catalog.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { variants: { some: { sku: { contains: q, mode: "insensitive" as const } } } }] } : {}),
  };
  return withTenant(ctx.tenantId, async (tx) => {
    // Sequential: queries inside one transaction share a single connection.
    const items = await tx.product.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: { variants: { include: { stockLevels: true } }, category: true, images: { take: 1 } },
    });
    const total = await tx.product.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function createCategory(ctx: Ctx, raw: z.input<typeof categorySchema>) {
  authorize(ctx, "catalog.manage");
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  return withTenant(ctx.tenantId, async (tx) => {
    const c = await tx.category.create({
      data: { tenantId: ctx.tenantId, name: input.name, slug: await uniqueSlug(tx, "category", slugify(input.name)),
        parentId: input.parentId ?? null, description: input.description ?? null, sortOrder: input.sortOrder },
    });
    await audit(tx, ctx, "category.created", "category", c.id, undefined, { name: c.name });
    return c;
  });
}

export async function listCategories(ctx: Ctx) {
  authorize(ctx, "catalog.view", { write: false });
  return withTenant(ctx.tenantId, (tx) =>
    tx.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }));
}
