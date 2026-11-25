import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { transferSchema, warehouseSchema } from "@/lib/validation-erp";
import { audit } from "./audit";
import { nextNumber } from "./sequences";
import { loadVariants, stockIn, stockOut } from "./erp/common";
import type { z } from "zod";

export async function createWarehouse(ctx: Ctx, raw: z.input<typeof warehouseSchema>) {
  authorize(ctx, "inventory.manage");
  const p = warehouseSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      const w = await tx.warehouse.create({ data: { tenantId: ctx.tenantId, name: p.data.name, type: p.data.type, address: p.data.address ?? null } });
      await audit(tx, ctx, "warehouse.created", "warehouse", w.id, undefined, { name: w.name });
      return w;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A location with that name already exists.");
    throw e;
  }
}

/** Locations with units on hand and stock value at moving-average cost. */
export async function listWarehouses(ctx: Ctx) {
  authorize(ctx, "catalog.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
    const sums = await tx.$queryRaw<{ warehouse_id: string; units: bigint; value: string }[]>`
      SELECT sl.warehouse_id, sum(sl.on_hand)::bigint AS units, sum(sl.on_hand * pv.cost_price)::text AS value
      FROM stock_levels sl JOIN product_variants pv ON pv.id = sl.variant_id GROUP BY sl.warehouse_id`;
    const by = new Map(sums.map((s) => [s.warehouse_id, s]));
    return rows.map((w) => ({ ...w, units: Number(by.get(w.id)?.units ?? 0), value: Number(by.get(w.id)?.value ?? 0).toFixed(2) }));
  });
}

/** Product × location quantity matrix. */
export async function stockMatrix(ctx: Ctx, opts: { q?: string; page?: number }) {
  authorize(ctx, "catalog.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  return withTenant(ctx.tenantId, async (tx) => {
    const warehouses = await tx.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
    const where = { product: { status: { not: "archived" }, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) } };
    const variants = await tx.productVariant.findMany({ where, include: { product: { select: { name: true } }, stockLevels: true }, orderBy: { product: { name: "asc" } }, skip: (page - 1) * 50, take: 50 });
    const total = await tx.productVariant.count({ where });
    const rows = variants.map((v) => ({
      id: v.id, label: v.title === "Default" ? v.product.name : `${v.product.name} · ${v.title}`, sku: v.sku,
      byWarehouse: Object.fromEntries(v.stockLevels.map((l) => [l.warehouseId, l.onHand])),
      total: v.stockLevels.reduce((a, l) => a + l.onHand, 0),
    }));
    return { warehouses, rows, total, page, pages: Math.max(1, Math.ceil(total / 50)) };
  });
}

/** Move stock between two locations (issued and received at once). Value is unchanged, so no ledger entry. */
export async function createTransfer(ctx: Ctx, raw: z.input<typeof transferSchema>) {
  authorize(ctx, "inventory.manage");
  const p = transferSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const t = p.data;
  if (t.fromWarehouseId === t.toWarehouseId) throw new AppError("VALIDATION", "Choose two different locations.");
  return withTenant(ctx.tenantId, async (tx) => {
    const locs = await tx.warehouse.findMany({ where: { id: { in: [t.fromWarehouseId, t.toWarehouseId] } } });
    if (locs.length !== 2) throw new AppError("NOT_FOUND", "Location not found.");
    const variants = await loadVariants(tx, t.items.map((i) => i.variantId));
    const transfer = await tx.stockTransfer.create({
      data: { tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "transfer"), fromWarehouseId: t.fromWarehouseId, toWarehouseId: t.toWarehouseId,
        date: new Date(t.date), carrier: t.carrier ?? null, notes: t.notes ?? null, createdBy: ctx.userId,
        items: { create: t.items.map((i) => ({ tenantId: ctx.tenantId, variantId: i.variantId, qty: i.qty })) } },
    });
    for (const i of t.items) {
      const name = variants.get(i.variantId)!.product.name;
      await stockOut(tx, ctx, { variantId: i.variantId, warehouseId: t.fromWarehouseId, qty: i.qty, type: "transfer_out", sourceType: "stock_transfer", sourceId: transfer.id, reference: transfer.number }, name);
      await stockIn(tx, ctx, { variantId: i.variantId, warehouseId: t.toWarehouseId, qty: i.qty, type: "transfer_in", sourceType: "stock_transfer", sourceId: transfer.id, reference: transfer.number });
    }
    await audit(tx, ctx, "transfer.created", "stock_transfer", transfer.id, undefined, { number: transfer.number, lines: t.items.length });
    return transfer;
  });
}

export async function listTransfers(ctx: Ctx, opts: { page?: number } = {}) {
  authorize(ctx, "catalog.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.stockTransfer.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25, include: { items: true } });
    const total = await tx.stockTransfer.count();
    const locs = new Map((await tx.warehouse.findMany()).map((w) => [w.id, w.name]));
    return { items: items.map((t) => ({ ...t, from: locs.get(t.fromWarehouseId) ?? "—", to: locs.get(t.toWarehouseId) ?? "—", units: t.items.reduce((a, i) => a + i.qty, 0) })), total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}
