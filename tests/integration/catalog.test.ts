import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { archiveProduct, createCategory, createProduct, listProducts, updateProduct } from "@/server/services/catalog";
import { adjustStock } from "@/server/services/inventory";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

describe("catalogue", () => {
  it("creates a product with variants, opening stock movements and an audit entry", async () => {
    const s = await makeStore();
    const cat = await createCategory(s.ctx, { name: "Dinnerware" });
    const p = await createProduct(s.ctx, {
      name: "Akij 32 Pcs Dinner Set", categoryId: cat.id,
      variants: [
        { title: "White", sku: "AK-32-W", onlinePrice: "5000", offlinePrice: "4800", costPrice: "3900", stock: 7 },
        { title: "Blue", sku: "AK-32-B", onlinePrice: "5200", stock: 0 },
      ],
    });
    expect(p.slug).toBe("akij-32-pcs-dinner-set");
    const out = await withTenant(s.tenantId, async (tx) => ({
      levels: await tx.stockLevel.findMany(),
      moves: await tx.stockMovement.findMany(),
      audit: await tx.auditLog.findMany({ where: { action: "product.created" } }),
    }));
    expect(out.levels.map((l) => l.onHand).sort()).toEqual([0, 7]);
    expect(out.moves).toHaveLength(1); // only non-zero opening stock is recorded
    expect(out.moves[0]).toMatchObject({ type: "opening", qtyChange: 7, qtyBefore: 0, qtyAfter: 7 });
    expect(out.audit).toHaveLength(1);
  });

  it("de-duplicates slugs and rejects duplicate SKUs within a tenant only", async () => {
    const a = await makeStore();
    const b = await makeStore();
    const p1 = await createProduct(a.ctx, { name: "Mug", variants: [{ title: "Default", sku: "MUG-1", onlinePrice: "250", stock: 1 }] });
    const p2 = await createProduct(a.ctx, { name: "Mug", variants: [{ title: "Default", sku: "MUG-2", onlinePrice: "250", stock: 1 }] });
    expect(p2.slug).not.toBe(p1.slug);
    await expect(createProduct(a.ctx, { name: "Cup", variants: [{ title: "Default", sku: "MUG-1", onlinePrice: "1", stock: 0 }] }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createProduct(b.ctx, { name: "Cup", variants: [{ title: "Default", sku: "MUG-1", onlinePrice: "1", stock: 0 }] }))
      .resolves.toBeTruthy();
  });

  it("enforces RBAC on catalogue writes", async () => {
    const s = await makeStore();
    const viewer = { ...s.ctx, permissions: ["catalog.view"] };
    await expect(createProduct(viewer, { name: "X", variants: [{ title: "D", onlinePrice: "1", stock: 0 }] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces the plan product limit", async () => {
    const s = await makeStore();
    await prisma.plan.update({ where: { code: "launch" }, data: { maxProducts: 1 } });
    try {
      await createProduct(s.ctx, { name: "One", variants: [{ title: "D", onlinePrice: "1", stock: 0 }] });
      await expect(createProduct(s.ctx, { name: "Two", variants: [{ title: "D", onlinePrice: "1", stock: 0 }] }))
        .rejects.toMatchObject({ code: "PLAN_LIMIT" });
    } finally {
      await prisma.plan.update({ where: { code: "launch" }, data: { maxProducts: null } });
    }
  });

  it("updates, searches, archives and keeps another tenant's product unreachable", async () => {
    const a = await makeStore();
    const b = await makeStore();
    const p = await createProduct(a.ctx, { name: "Tea Set", variants: [{ title: "D", onlinePrice: "1850", stock: 3 }] });
    await updateProduct(a.ctx, p.id, { name: "Fine Tea Set", status: "active" });
    expect((await listProducts(a.ctx, { q: "fine" })).items[0]?.name).toBe("Fine Tea Set");
    await expect(updateProduct(b.ctx, p.id, { name: "hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await archiveProduct(a.ctx, p.id);
    expect((await listProducts(a.ctx, {})).items.find((x) => x.id === p.id)?.status).toBe("archived");
  });

  it("adjusts stock with an immutable movement trail and blocks negative stock", async () => {
    const s = await makeStore();
    const p = await createProduct(s.ctx, { name: "Jug", variants: [{ title: "D", onlinePrice: "100", stock: 2 }] });
    const v = p.variants[0]!;
    await adjustStock(s.ctx, { variantId: v.id, change: 5, reason: "Purchase intake" });
    await expect(adjustStock(s.ctx, { variantId: v.id, change: -10, reason: "Broken" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const moves = await withTenant(s.tenantId, (tx) => tx.stockMovement.findMany({ orderBy: { createdAt: "asc" } }));
    expect(moves.map((m) => m.qtyAfter)).toEqual([2, 7]);
    await expect(withTenant(s.tenantId, (tx) => tx.stockMovement.deleteMany())).rejects.toThrow(/append-only/);
  });
});
