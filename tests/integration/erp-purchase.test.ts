import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/server/db/tenant";
import { createProduct } from "@/server/services/catalog";
import { createSupplier, createSupplierType, listSuppliers, supplierAging } from "@/server/services/erp/suppliers";
import { cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrder, receiveGoods } from "@/server/services/erp/purchase-orders";
import { createBillFromGrn, createDirectBill, getBill } from "@/server/services/erp/bills";
import { recordSupplierPayment } from "@/server/services/erp/supplier-payments";
import { createPurchaseReturn } from "@/server/services/erp/purchase-returns";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);
const today = new Date().toISOString().slice(0, 10);

async function setup(stock = 10, cost = "500") {
  const s = await makeStore();
  const p = await createProduct(s.ctx, { name: "Tea Set", variants: [{ title: "Default", onlinePrice: "1500", costPrice: cost, stock }] });
  const v = p.variants[0]!;
  const sup = await createSupplier(s.ctx, { name: "Protik Ceramics", phone: "01911111111" });
  const level = () => withTenant(s.tenantId, (tx) => tx.stockLevel.findFirstOrThrow());
  const variant = () => withTenant(s.tenantId, (tx) => tx.productVariant.findUniqueOrThrow({ where: { id: v.id } }));
  return { s, v, sup, level, variant };
}

describe("suppliers", () => {
  it("creates typed suppliers with opening payable and rejects duplicates", async () => {
    const { s } = await setup();
    const t = await createSupplierType(s.ctx, { name: "Manufacturer", code: "MFR" });
    await createSupplier(s.ctx, { name: "Monno Ceramic", supplierTypeId: t.id, openingBalance: "12000" });
    const list = await listSuppliers(s.ctx, { q: "monno" });
    expect(list.items[0]).toMatchObject({ name: "Monno Ceramic", payable: "12000.00" });
    await expect(createSupplier(s.ctx, { name: "Monno Ceramic" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("purchase order → goods receipt → bill", () => {
  it("receives in parts, updates stock and moving-average cost, then bills the receipt", async () => {
    const { s, v, sup, level, variant } = await setup(10, "500");
    const po = await createPurchaseOrder(s.ctx, { supplierId: sup.id, orderDate: today, items: [{ variantId: v.id, qty: 10, unitPrice: "800" }] });
    expect(po.number).toBe("PO-000001");
    expect(po.total.toString()).toBe("8000");
    const item = (await getPurchaseOrder(s.ctx, po.id)).items[0]!;

    const g1 = await receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: item.id, qty: 4 }] });
    expect(g1.number).toBe("GRN-000001");
    expect((await getPurchaseOrder(s.ctx, po.id)).status).toBe("partially_received");
    expect(await level()).toMatchObject({ onHand: 14 });
    // (10×500 + 4×800) / 14 = 585.71
    expect((await variant()).costPrice.toString()).toBe("585.71");

    await expect(receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: item.id, qty: 7 }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: item.id, qty: 6 }] });
    expect((await getPurchaseOrder(s.ctx, po.id)).status).toBe("received");
    expect(await level()).toMatchObject({ onHand: 20 });

    const bill = await createBillFromGrn(s.ctx, g1.id, { billDate: today, supplierBillNo: "PC-8841" });
    expect(bill.total.toString()).toBe("3200");
    expect(await level()).toMatchObject({ onHand: 20 }); // billing a receipt never double-counts stock
    await expect(createBillFromGrn(s.ctx, g1.id, { billDate: today })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(cancelPurchaseOrder(s.ctx, po.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("cancels a PO with nothing received", async () => {
    const { s, v, sup } = await setup();
    const po = await createPurchaseOrder(s.ctx, { supplierId: sup.id, orderDate: today, items: [{ variantId: v.id, qty: 2, unitPrice: "100" }] });
    await cancelPurchaseOrder(s.ctx, po.id);
    expect((await getPurchaseOrder(s.ctx, po.id)).status).toBe("cancelled");
    const item = (await getPurchaseOrder(s.ctx, po.id)).items[0]!;
    await expect(receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: item.id, qty: 1 }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("direct bills, payments and returns", () => {
  it("stocks in on a direct bill and records payment at the counter", async () => {
    const { s, v, sup, level } = await setup(0, "0");
    const bill = await createDirectBill(s.ctx, {
      supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 5, unitPrice: "400", vatPct: "10" }],
      payments: [{ method: "cash", amount: "1000" }],
    });
    expect(bill.number).toBe("BILL-000001");
    expect(bill.total.toString()).toBe("2200");
    expect(bill.paymentStatus).toBe("partial");
    expect(await level()).toMatchObject({ onHand: 5 });
    const mv = await withTenant(s.tenantId, (tx) => tx.stockMovement.findFirst({ where: { type: "purchase" } }));
    expect(mv).toMatchObject({ qtyChange: 5, sourceType: "purchase_bill" });
  });

  it("pays opening payable then oldest bills, with the excess as supplier advance", async () => {
    const { s, v } = await setup();
    const sup = await createSupplier(s.ctx, { name: "Akij Ceramics", openingBalance: "1000" });
    const b1 = await createDirectBill(s.ctx, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 2, unitPrice: "1000" }] });
    const pay = await recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "cheque", amount: "3500", reference: "CHQ-1" });
    expect(pay.number).toBe("SP-000001");
    expect(pay.toAdvance.toString()).toBe("500");
    expect((await getBill(s.ctx, b1.id)).paymentStatus).toBe("paid");
    expect((await listSuppliers(s.ctx, { q: "akij" })).items[0]).toMatchObject({ payable: "0.00", advance: "500.00" });
  });

  it("returns goods to the supplier: stock out, reduces payable, refuses more than billed or in stock", async () => {
    const { s, v, sup, level } = await setup(0, "0");
    const bill = await createDirectBill(s.ctx, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 5, unitPrice: "400" }] });
    const item = (await getBill(s.ctx, bill.id)).items[0]!;
    const ret = await createPurchaseReturn(s.ctx, bill.id, { date: today, items: [{ itemId: item.id, qty: 2 }], restock: true, reason: "Cracked glaze" });
    expect(ret.number).toBe("PR-000001");
    expect(ret.amount.toString()).toBe("800");
    expect(ret.reduceDue.toString()).toBe("800");
    expect(await level()).toMatchObject({ onHand: 3 });
    expect((await getBill(s.ctx, bill.id)).returned.toString()).toBe("800");
    await expect(createPurchaseReturn(s.ctx, bill.id, { date: today, items: [{ itemId: item.id, qty: 4 }], restock: true, reason: "more" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("builds the supplier aging schedule and enforces purchase permissions", async () => {
    const { s, v, sup } = await setup();
    await createDirectBill(s.ctx, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "750" }] });
    const row = (await supplierAging(s.ctx)).rows.find((r) => r.supplierId === sup.id)!;
    expect(row).toMatchObject({ current: "750.00", total: "750.00" });
    await expect(createDirectBill({ ...s.ctx, permissions: ["purchase.view"] }, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "1" }] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
