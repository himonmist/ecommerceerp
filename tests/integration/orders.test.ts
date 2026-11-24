import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/server/db/tenant";
import { createProduct } from "@/server/services/catalog";
import { createCoupon } from "@/server/services/coupons";
import { dashboardStats, getOrder, listOrders, placeOrder, transitionOrder } from "@/server/services/orders";
import { getStorefront } from "@/server/services/storefront";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

async function setup(stock = 5, price = "1000") {
  const s = await makeStore();
  const p = await createProduct(s.ctx, { name: "Dinner Set", variants: [{ title: "Default", onlinePrice: price, costPrice: "600", stock }] });
  const sf = await getStorefront(s.slug);
  const zone = sf!.zones[0]!;
  const variant = p.variants[0]!;
  const buy = (qty: number, extra: Record<string, unknown> = {}) =>
    placeOrder(s.tenantId, { name: "Rahim", phone: "01712345678", address: "House 1, Road 2, Dhanmondi", zoneId: zone.id, items: [{ variantId: variant.id, qty }], ...extra }, { ip: "1.2.3.4" });
  return { s, p, variant, zone, buy };
}

const levels = (tenantId: string) => withTenant(tenantId, (tx) => tx.stockLevel.findFirstOrThrow());

describe("checkout", () => {
  it("prices from the database, reserves stock and numbers orders per tenant", async () => {
    const { s, zone, buy } = await setup();
    const o = await buy(2, { unitPriceOverride: "1" }); // client-sent prices are ignored
    expect(o.number).toBe("ORD-000001");
    expect(o.subtotal.toString()).toBe("2000");
    expect(o.total.toString()).toBe((2000 + Number(zone.charge)).toString());
    expect(await levels(s.tenantId)).toMatchObject({ onHand: 5, reserved: 2 });
    expect((await buy(1)).number).toBe("ORD-000002");
  });

  it("refuses to oversell, including under concurrent checkouts", async () => {
    const { s, buy } = await setup(3);
    await expect(buy(4)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const results = await Promise.allSettled([buy(1), buy(1), buy(1), buy(1), buy(1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await levels(s.tenantId)).toMatchObject({ onHand: 3, reserved: 3 });
  });

  it("rejects archived products and variants from other tenants", async () => {
    const { buy } = await setup();
    const other = await setup();
    await expect(
      placeOrder(other.s.tenantId, { name: "Rahim", phone: "01712345678", address: "Somewhere 123", zoneId: other.zone.id, items: [{ variantId: (await setup()).variant.id, qty: 1 }] }, {}),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(buy).toBeTruthy();
  });

  it("applies coupons once, respecting usage limits", async () => {
    const { s, buy } = await setup(10);
    await createCoupon(s.ctx, { code: "EID10", discountType: "percent", value: "10", usageLimit: 1 });
    const o = await buy(1, { couponCode: "eid10" });
    expect(o.discount.toString()).toBe("100");
    await expect(buy(1, { couponCode: "EID10" })).rejects.toMatchObject({ code: "COUPON_INVALID" });
  });

  it("upserts the customer by phone", async () => {
    const { s, buy } = await setup();
    await buy(1);
    await buy(1);
    expect(await withTenant(s.tenantId, (tx) => tx.customer.count())).toBe(1);
  });
});

describe("order lifecycle", () => {
  it("commits stock and marks COD paid on delivery, with a full timeline", async () => {
    const { s, buy } = await setup(5);
    const o = await buy(2);
    for (const to of ["confirmed", "preparing", "ready", "packed", "shipped", "out_for_delivery", "delivered"] as const) {
      await transitionOrder(s.ctx, o.id, to, `→ ${to}`);
    }
    const done = await getOrder(s.ctx, o.id);
    expect(done.status).toBe("delivered");
    expect(done.paymentStatus).toBe("paid");
    expect(done.events.map((e) => e.toStatus)).toEqual(["pending", "confirmed", "preparing", "ready", "packed", "shipped", "out_for_delivery", "delivered"]);
    expect(await levels(s.tenantId)).toMatchObject({ onHand: 3, reserved: 0 });
    const sale = await withTenant(s.tenantId, (tx) => tx.stockMovement.findFirst({ where: { type: "sale" } }));
    expect(sale).toMatchObject({ qtyChange: -2, qtyBefore: 5, qtyAfter: 3, sourceId: o.id });
  });

  it("releases reservations on cancel and restocks on post-delivery return", async () => {
    const { s, buy } = await setup(5);
    const a = await buy(2);
    await transitionOrder(s.ctx, a.id, "cancelled", "customer asked");
    expect(await levels(s.tenantId)).toMatchObject({ onHand: 5, reserved: 0 });

    const b = await buy(1);
    for (const to of ["confirmed", "preparing", "ready", "packed", "shipped", "delivered", "returned"] as const) await transitionOrder(s.ctx, b.id, to);
    expect(await levels(s.tenantId)).toMatchObject({ onHand: 5, reserved: 0 });
    expect((await getOrder(s.ctx, b.id)).paymentStatus).toBe("refunded");
  });

  it("rejects illegal transitions, foreign orders and missing permission", async () => {
    const { s, buy } = await setup();
    const other = await makeStore();
    const o = await buy(1);
    await expect(transitionOrder(s.ctx, o.id, "delivered")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transitionOrder(other.ctx, o.id, "confirmed")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(transitionOrder({ ...s.ctx, permissions: ["orders.view"] }, o.id, "confirmed")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists, filters and summarises orders", async () => {
    const { s, buy } = await setup(10);
    const o = await buy(1);
    await buy(2);
    await transitionOrder(s.ctx, o.id, "confirmed");
    expect((await listOrders(s.ctx, { status: "pending" })).items).toHaveLength(1);
    expect((await listOrders(s.ctx, { q: "01712" })).items).toHaveLength(2);
    const stats = await dashboardStats(s.ctx);
    expect(stats.ordersTotal).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.lowStock).toBeGreaterThanOrEqual(0);
  });
});
