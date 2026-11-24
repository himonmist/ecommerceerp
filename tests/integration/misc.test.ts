import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { rateLimit, enforceRateLimit } from "@/server/security/rate-limit";
import { createCategory, createProduct, getProduct, listCategories } from "@/server/services/catalog";
import { listMovements } from "@/server/services/inventory";
import { createCoupon, listCoupons, setCouponActive } from "@/server/services/coupons";
import { getStorefront, getStorefrontProduct, listStorefrontProducts } from "@/server/services/storefront";
import { getSessionContext } from "@/server/services/auth";
import { listPlans } from "@/server/services/plans";
import { authorize } from "@/server/security/permissions";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

describe("rate limiting", () => {
  it("allows up to the limit within a window, then blocks", async () => {
    const key = `t:${Date.now()}`;
    for (let i = 0; i < 3; i++) expect((await rateLimit(key, 3, 60)).ok).toBe(true);
    expect((await rateLimit(key, 3, 60)).ok).toBe(false);
    await expect(enforceRateLimit(key, 3, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("resets after the window passes", async () => {
    const key = `w:${Date.now()}`;
    await rateLimit(key, 1, 60);
    await prisma.rateLimit.update({ where: { key }, data: { windowStart: new Date(Date.now() - 120_000) } });
    expect((await rateLimit(key, 1, 60)).ok).toBe(true);
  });
});

describe("storefront reads", () => {
  it("shows only active online/omni products with available stock, by category and search", async () => {
    const s = await makeStore();
    const cat = await createCategory(s.ctx, { name: "Tea & Coffee" });
    await createProduct(s.ctx, { name: "Coffee Mug", categoryId: cat.id, variants: [{ title: "Black", onlinePrice: "251", compareAtPrice: "300", stock: 4 }] });
    await createProduct(s.ctx, { name: "Showroom Only Vase", channel: "offline", variants: [{ title: "D", onlinePrice: "999", stock: 1 }] });
    await createProduct(s.ctx, { name: "Draft Bowl", status: "draft", variants: [{ title: "D", onlinePrice: "10", stock: 1 }] });
    const all = await listStorefrontProducts(s.tenantId);
    expect(all.map((p) => p.name)).toEqual(["Coffee Mug"]);
    expect(all[0]!.variants[0]).toMatchObject({ price: "251", compareAt: "300", available: 4 });
    expect(await listStorefrontProducts(s.tenantId, { category: cat.slug })).toHaveLength(1);
    expect(await listStorefrontProducts(s.tenantId, { q: "vase" })).toHaveLength(0);
    expect((await getStorefrontProduct(s.tenantId, "coffee-mug"))?.name).toBe("Coffee Mug");
    expect(await getStorefrontProduct(s.tenantId, "showroom-only-vase")).toBeNull();
    const sf = await getStorefront(s.slug);
    expect(sf?.categories.map((c) => c.name)).toEqual(["Tea & Coffee"]);
  });

  it("returns null for unknown, malformed or suspended stores", async () => {
    expect(await getStorefront("does-not-exist")).toBeNull();
    expect(await getStorefront("../../etc")).toBeNull();
    const s = await makeStore();
    await prisma.tenant.update({ where: { id: s.tenantId }, data: { status: "suspended" } });
    expect(await getStorefront(s.slug)).toBeNull();
    expect(await getSessionContext(s.token)).toBeNull();
  });
});

describe("coupons, categories, movements, plans", () => {
  it("manages coupons and validates percent caps and duplicates", async () => {
    const s = await makeStore();
    const c = await createCoupon(s.ctx, { code: "save50", discountType: "fixed", value: "50" });
    expect(c.code).toBe("SAVE50");
    await expect(createCoupon(s.ctx, { code: "SAVE50", discountType: "fixed", value: "50" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createCoupon(s.ctx, { code: "BIG", discountType: "percent", value: "150" })).rejects.toMatchObject({ code: "VALIDATION" });
    await setCouponActive(s.ctx, c.id, false);
    expect((await listCoupons(s.ctx))[0]?.isActive).toBe(false);
    await expect(setCouponActive(s.ctx, "0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists categories with counts, product detail and stock movements", async () => {
    const s = await makeStore();
    const cat = await createCategory(s.ctx, { name: "Cutlery" });
    const p = await createProduct(s.ctx, { name: "Tea Spoon", categoryId: cat.id, variants: [{ title: "6pcs", onlinePrice: "311", stock: 6 }] });
    expect((await listCategories(s.ctx))[0]?._count.products).toBe(1);
    expect((await getProduct(s.ctx, p.id)).variants[0]?.stockLevels[0]?.onHand).toBe(6);
    await expect(getProduct(s.ctx, "0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listMovements(s.ctx))[0]).toMatchObject({ productName: "Tea Spoon", type: "opening" });
    await expect(createProduct(s.ctx, { name: "Bad Cat", categoryId: "0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a", variants: [{ title: "D", onlinePrice: "1", stock: 0 }] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks writes when the trial is over but still allows reads", async () => {
    const s = await makeStore();
    await prisma.tenant.update({ where: { id: s.tenantId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const ctx = (await getSessionContext(s.token))!;
    expect(ctx.readOnly).toBe(true);
    await expect(createCategory(ctx, { name: "Nope" })).rejects.toMatchObject({ code: "TRIAL_EXPIRED" });
    await expect(listCategories(ctx)).resolves.toEqual([]);
    expect(() => authorize(ctx, "catalog.view", { write: false })).not.toThrow();
  });

  it("lists plans in order", async () => {
    expect((await listPlans(prisma)).map((p) => p.code)).toEqual(["launch", "build", "dominate"]);
  });
});
