import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/server/db/tenant";
import { createProduct } from "@/server/services/catalog";
import { createCustomer } from "@/server/services/erp/customers";
import { recordReceipt } from "@/server/services/erp/receipts";
import { getInvoice } from "@/server/services/erp/invoices";
import { balancesByKey } from "@/server/services/accounting/reports";
import { createTransfer, createWarehouse, listTransfers, listWarehouses, stockMatrix } from "@/server/services/warehouses";
import {
  closeShift, createRegister, currentShift, listRegisters, openShift, posSale, recordCashMovement, shiftSummary, listShifts, posCatalog,
} from "@/server/services/pos";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

async function setup(stock = 20) {
  const s = await makeStore();
  const p = await createProduct(s.ctx, { name: "Coffee Mug", variants: [{ title: "Default", sku: "MUG-1", barcode: "8901234567890", onlinePrice: "300", offlinePrice: "250", costPrice: "100", stock }] });
  const v = p.variants[0]!;
  const showroom = await createWarehouse(s.ctx, { name: "Banani Showroom", type: "showroom", address: "Road 11, Banani" });
  const main = (await listWarehouses(s.ctx)).find((w) => w.isDefault)!;
  const level = (warehouseId: string) => withTenant(s.tenantId, (tx) => tx.stockLevel.findFirst({ where: { variantId: v.id, warehouseId } }));
  return { s, v, showroom, main, level };
}

describe("locations & transfers", () => {
  it("creates locations and moves stock between them with an audit trail", async () => {
    const { s, v, showroom, main, level } = await setup(20);
    await expect(createWarehouse(s.ctx, { name: "Banani Showroom" })).rejects.toMatchObject({ code: "CONFLICT" });
    const before = await balancesByKey(s.ctx);
    const t = await createTransfer(s.ctx, { fromWarehouseId: main.id, toWarehouseId: showroom.id, date: new Date().toISOString().slice(0, 10), items: [{ variantId: v.id, qty: 8 }], carrier: "Van #2" });
    expect(t.number).toBe("TRN-000001");
    expect((await level(main.id))?.onHand).toBe(12);
    expect((await level(showroom.id))?.onHand).toBe(8);
    const moves = await withTenant(s.tenantId, (tx) => tx.stockMovement.findMany({ where: { sourceId: t.id }, orderBy: { qtyChange: "asc" } }));
    expect(moves.map((m) => [m.type, m.qtyChange])).toEqual([["transfer_out", -8], ["transfer_in", 8]]);
    expect(await balancesByKey(s.ctx)).toEqual(before); // moving stock doesn't change its value
    await expect(createTransfer(s.ctx, { fromWarehouseId: showroom.id, toWarehouseId: main.id, date: "2026-11-25", items: [{ variantId: v.id, qty: 9 }] })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(createTransfer(s.ctx, { fromWarehouseId: main.id, toWarehouseId: main.id, date: "2026-11-25", items: [{ variantId: v.id, qty: 1 }] })).rejects.toMatchObject({ code: "VALIDATION" });
    const matrix = await stockMatrix(s.ctx, {});
    expect(matrix.rows[0]!.byWarehouse).toMatchObject({ [main.id]: 12, [showroom.id]: 8 });
    const list = await listWarehouses(s.ctx);
    expect(list.find((w) => w.id === showroom.id)).toMatchObject({ units: 8, value: "800.00" });
    expect((await listTransfers(s.ctx)).items).toHaveLength(1);
    await expect(createTransfer({ ...s.ctx, permissions: ["catalog.view"] }, { fromWarehouseId: main.id, toWarehouseId: showroom.id, date: "2026-11-25", items: [{ variantId: v.id, qty: 1 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("POS shifts and sales", () => {
  async function pos() {
    const base = await setup(20);
    await createTransfer(base.s.ctx, { fromWarehouseId: base.main.id, toWarehouseId: base.showroom.id, date: new Date().toISOString().slice(0, 10), items: [{ variantId: base.v.id, qty: 10 }] });
    const reg = await createRegister(base.s.ctx, { name: "Counter 1", warehouseId: base.showroom.id });
    return { ...base, reg };
  }

  it("allows one open shift per register", async () => {
    const { s, reg } = await pos();
    const sh = await openShift(s.ctx, reg.id, { openingFloat: "2000" });
    expect(sh.number).toBe("SH-000001");
    await expect(openShift(s.ctx, reg.id, { openingFloat: "0" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await currentShift(s.ctx, reg.id))?.id).toBe(sh.id);
    expect((await listRegisters(s.ctx))[0]).toMatchObject({ name: "Counter 1", openShift: expect.objectContaining({ id: sh.id }) });
  });

  it("sells from the register's location with split tenders and cash change, posting to the ledger", async () => {
    const { s, v, reg, showroom, main, level } = await pos();
    const sh = await openShift(s.ctx, reg.id, { openingFloat: "1000" });
    // 4 × 250 = 1000, cart discount 50 → 950; card 400, cash 600 tendered → 50 change
    const sale = await posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 4 }], discount: "50", tenders: [{ method: "card", amount: "400", reference: "VISA-4242" }, { method: "cash", amount: "600" }] });
    expect(sale.invoice.number).toBe("INV-000001");
    expect(sale.invoice.channel).toBe("pos");
    expect(sale.invoice.total.toString()).toBe("950");
    expect(sale.change).toBe("50.00");
    expect((await level(showroom.id))?.onHand).toBe(6);
    expect((await level(main.id))?.onHand).toBe(10); // the main warehouse is untouched
    const inv = await getInvoice(s.ctx, sale.invoice.id);
    expect(inv.paymentStatus).toBe("paid");
    expect(inv.allocations.map((a) => [a.receipt.method, a.amount.toString()]).sort()).toEqual([["card", "400"], ["cash", "550"]]);
    const b = await balancesByKey(s.ctx);
    expect(b.cash).toBe("550.00");
    expect(b.card).toBe("400.00");
    expect(b.sales).toBe("-1000.00");
    expect(b.sales_discount).toBe("50.00");
  });

  it("refuses short payment, non-cash overpayment, sales on closed shifts and missing permission", async () => {
    const { s, v, reg } = await pos();
    const sh = await openShift(s.ctx, reg.id, { openingFloat: "0" });
    await expect(posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 1 }], tenders: [{ method: "cash", amount: "200" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 1 }], tenders: [{ method: "bkash", amount: "300" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 11 }], tenders: [{ method: "cash", amount: "5000" }] })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(posSale({ ...s.ctx, permissions: ["sales.view"] }, sh.id, { items: [{ variantId: v.id, qty: 1 }], tenders: [{ method: "cash", amount: "250" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await closeShift(s.ctx, sh.id, { countedCash: "0" });
    await expect(posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 1 }], tenders: [{ method: "cash", amount: "250" }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lets a known customer pay with store credit (advance)", async () => {
    const { s, v, reg } = await pos();
    const c = await createCustomer(s.ctx, { name: "Regular Buyer", phone: "01811111111" });
    await recordReceipt(s.ctx, { customerId: c.id, date: new Date().toISOString().slice(0, 10), method: "cash", amount: "300" }); // all advance
    const sh = await openShift(s.ctx, reg.id, { openingFloat: "0" });
    const sale = await posSale(s.ctx, sh.id, { customerId: c.id, useAdvance: true, items: [{ variantId: v.id, qty: 2 }], tenders: [{ method: "cash", amount: "200" }] });
    expect(sale.change).toBe("0.00");
    expect((await getInvoice(s.ctx, sale.invoice.id)).allocations.map((a) => a.receipt.method).sort()).toEqual(["advance", "cash"]);
  });

  it("tracks drawer cash, posts drops and pay-outs, and books the closing variance", async () => {
    const { s, v, reg } = await pos();
    const sh = await openShift(s.ctx, reg.id, { openingFloat: "1000" });
    await posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 2 }], tenders: [{ method: "cash", amount: "1000" }] }); // 500 cash, 500 change
    await posSale(s.ctx, sh.id, { items: [{ variantId: v.id, qty: 1 }], tenders: [{ method: "bkash", amount: "250", reference: "TX9" }] });
    await recordCashMovement(s.ctx, sh.id, { type: "cash_drop", amount: "800", reason: "Midday deposit" });
    await recordCashMovement(s.ctx, sh.id, { type: "pay_out", amount: "60", reason: "Tea for staff" });
    await recordCashMovement(s.ctx, sh.id, { type: "pay_in", amount: "100", reason: "Float top-up" });
    let sum = await shiftSummary(s.ctx, sh.id);
    expect(sum.expectedCash).toBe("740.00"); // 1000 + 500 − 800 − 60 + 100
    expect(sum.salesCount).toBe(2);
    expect(sum.byMethod).toMatchObject({ cash: "500.00", bkash: "250.00" });
    expect(sum.grossSales).toBe("750.00");
    await expect(recordCashMovement(s.ctx, sh.id, { type: "cash_drop", amount: "5000", reason: "too much" })).rejects.toMatchObject({ code: "VALIDATION" });

    const closed = await closeShift(s.ctx, sh.id, { countedCash: "720", notes: "Short by 20" });
    expect(closed.variance?.toString()).toBe("-20");
    await expect(closeShift(s.ctx, sh.id, { countedCash: "720" })).rejects.toMatchObject({ code: "VALIDATION" });
    sum = await shiftSummary(s.ctx, sh.id);
    expect(sum.shift.status).toBe("closed");
    const b = await balancesByKey(s.ctx);
    expect(b.cash).toBe("-280.00");      // +500 sale − 800 drop − 60 pay-out + 100 pay-in − 20 short (float isn't new money)
    expect(b.bank).toBe("800.00");
    expect(b.misc_expense).toBe("60.00");
    expect(b.cash_short).toBe("20.00");
    expect((await listShifts(s.ctx, reg.id))[0]?.status).toBe("closed");
  });

  it("serves the POS catalogue with availability at the register's location", async () => {
    const { s, v, reg } = await pos();
    const cat = await posCatalog(s.ctx, reg.id);
    expect(cat.find((c) => c.id === v.id)).toMatchObject({ barcode: "8901234567890", price: "250", available: 10 });
  });
});

describe("POS customer lookup", () => {
  it("finds customers by phone in any common format", async () => {
    const { lookupCustomerByPhone } = await import("@/server/services/erp/customers");
    const s = await makeStore();
    await createCustomer(s.ctx, { name: "Phone Person", phone: "01911111111" });
    expect((await lookupCustomerByPhone(s.ctx, "+880 1911-111111"))?.name).toBe("Phone Person");
    expect(await lookupCustomerByPhone(s.ctx, "01922222222")).toBeNull();
    expect(await lookupCustomerByPhone(s.ctx, "nope")).toBeNull();
  });
});
