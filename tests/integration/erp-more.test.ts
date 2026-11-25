import { beforeAll, describe, expect, it } from "vitest";
import { createProduct } from "@/server/services/catalog";
import { createCustomer, createCustomerType, getCustomer, listCustomerTypes } from "@/server/services/erp/customers";
import { convertQuotation, createQuotation, getQuotation, listQuotations, setQuotationStatus } from "@/server/services/erp/quotations";
import { createInvoice, getInvoice, voidInvoice } from "@/server/services/erp/invoices";
import { listReceipts, recordReceipt, voidReceipt } from "@/server/services/erp/receipts";
import { createSalesReturn, listSalesReturns } from "@/server/services/erp/sales-returns";
import { createSupplier, createSupplierType, listSupplierTypes } from "@/server/services/erp/suppliers";
import { createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, listUnbilledReceipts, receiveGoods } from "@/server/services/erp/purchase-orders";
import { createBillFromGrn, createDirectBill, getBill, listBills } from "@/server/services/erp/bills";
import { listSupplierPayments, recordSupplierPayment, voidSupplierPayment } from "@/server/services/erp/supplier-payments";
import { createPurchaseReturn, listPurchaseReturns } from "@/server/services/erp/purchase-returns";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);
const today = new Date().toISOString().slice(0, 10);
const ZERO = "0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a";

async function setup() {
  const s = await makeStore();
  const p = await createProduct(s.ctx, { name: "Mug", variants: [{ title: "Default", onlinePrice: "300", costPrice: "100", stock: 50 }] });
  return { s, v: p.variants[0]! };
}

describe("sales edge cases", () => {
  it("allocates a receipt to chosen invoices, validating each allocation", async () => {
    const { s, v } = await setup();
    const c = await createCustomer(s.ctx, { name: "Pick Co", phone: "01611111111", openingBalance: "100" });
    const a = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "300" }] });
    const b = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "300" }] });
    await expect(recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "500", allocations: [{ invoiceId: b.id, amount: "400" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "100", allocations: [{ invoiceId: b.id, amount: "200" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "100", allocations: [{ invoiceId: ZERO, amount: "50" }] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    const r = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "nagad", amount: "350", allocations: [{ invoiceId: b.id, amount: "300" }] });
    expect(r.toAdvance.toString()).toBe("50"); // opening and invoice a untouched
    expect((await getInvoice(s.ctx, b.id)).paymentStatus).toBe("paid");
    expect((await getInvoice(s.ctx, a.id)).paymentStatus).toBe("unpaid");
    await voidReceipt(s.ctx, r.id);
    await expect(voidReceipt(s.ctx, r.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(voidReceipt(s.ctx, ZERO)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A receipt that touched the opening balance restores it when voided
    const r2 = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "100" });
    await voidReceipt(s.ctx, r2.id);
    expect((await getCustomer(s.ctx, c.id)).openingDue.toString()).toBe("100");
    expect((await listReceipts(s.ctx)).items.length).toBeGreaterThanOrEqual(2);
    await expect(recordReceipt(s.ctx, { customerId: ZERO, date: today, method: "cash", amount: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refunds walk-in returns in cash and blocks returns on void invoices", async () => {
    const { s, v } = await setup();
    const inv = await createInvoice(s.ctx, { walkInName: "Walk-in", invoiceDate: today, items: [{ variantId: v.id, qty: 2, unitPrice: "300" }], payments: [{ method: "cash", amount: "600" }] });
    const it = (await getInvoice(s.ctx, inv.id)).items[0]!;
    const ret = await createSalesReturn(s.ctx, inv.id, { date: today, items: [{ itemId: it.id, qty: 1 }], restock: false, reason: "Wrong colour" });
    expect(ret).toMatchObject({ toAdvance: expect.anything() });
    expect(ret.refundAmount.toString()).toBe("300");
    expect((await listSalesReturns(s.ctx)).length).toBe(1);
    await expect(createSalesReturn(s.ctx, inv.id, { date: today, items: [{ itemId: it.id, qty: 0 }], restock: true, reason: "nothing" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createSalesReturn(s.ctx, inv.id, { date: today, items: [{ itemId: ZERO, qty: 1 }], restock: true, reason: "ghost" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const c = await createCustomer(s.ctx, { name: "Void Return", phone: "01622222222" });
    const v2 = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "300" }] });
    await voidInvoice(s.ctx, v2.id, "mistake");
    await expect(voidInvoice(s.ctx, v2.id, "again")).rejects.toMatchObject({ code: "VALIDATION" });
    const vit = (await getInvoice(s.ctx, v2.id)).items[0]!;
    await expect(createSalesReturn(s.ctx, v2.id, { date: today, items: [{ itemId: vit.id, qty: 1 }], restock: true, reason: "void" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(getInvoice(s.ctx, ZERO)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createInvoice(s.ctx, { invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "1" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "10", discount: "20" }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("manages quotation statuses and refuses to convert rejected ones", async () => {
    const { s, v } = await setup();
    const t = await createCustomerType(s.ctx, { name: "Retailer" });
    await expect(createCustomerType(s.ctx, { name: "Retailer" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await listCustomerTypes(s.ctx))[0]?.name).toBe("Retailer");
    const c = await createCustomer(s.ctx, { name: "Quote Two", phone: "01633333333", customerTypeId: t.id });
    await expect(createCustomer(s.ctx, { name: "Bad Type", phone: "01633333334", customerTypeId: ZERO })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const q = await createQuotation(s.ctx, { customerId: c.id, date: today, items: [{ variantId: v.id, qty: 3, unitPrice: "300" }] });
    await setQuotationStatus(s.ctx, q.id, "sent");
    await setQuotationStatus(s.ctx, q.id, "rejected");
    await expect(convertQuotation(s.ctx, q.id, { invoiceDate: today })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listQuotations(s.ctx, { status: "rejected" })).items).toHaveLength(1);
    expect((await getQuotation(s.ctx, q.id)).items).toHaveLength(1);
    await expect(getQuotation(s.ctx, ZERO)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setQuotationStatus(s.ctx, ZERO, "sent")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createQuotation(s.ctx, { customerId: ZERO, date: today, items: [{ variantId: v.id, qty: 1, unitPrice: "1" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const q2 = await createQuotation(s.ctx, { customerId: c.id, date: today, items: [{ variantId: v.id, qty: 1, unitPrice: "300" }] });
    await convertQuotation(s.ctx, q2.id, { invoiceDate: today, payments: [{ method: "cash", amount: "300" }] });
    await expect(setQuotationStatus(s.ctx, q2.id, "draft")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(convertQuotation(s.ctx, ZERO, { invoiceDate: today })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("purchase edge cases", () => {
  it("pays chosen bills, voids payments and lists everything", async () => {
    const { s, v } = await setup();
    const t = await createSupplierType(s.ctx, { name: "Importer" });
    await expect(createSupplierType(s.ctx, { name: "Importer" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await listSupplierTypes(s.ctx))).toHaveLength(1);
    const sup = await createSupplier(s.ctx, { name: "Star Import", supplierTypeId: t.id, openingBalance: "200" });
    await expect(createSupplier(s.ctx, { name: "Bad", supplierTypeId: ZERO })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const b1 = await createDirectBill(s.ctx, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 2, unitPrice: "100" }] });
    await expect(recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "bank", amount: "50", allocations: [{ billId: b1.id, amount: "100" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "bank", amount: "500", allocations: [{ billId: b1.id, amount: "300" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "bank", amount: "50", allocations: [{ billId: ZERO, amount: "10" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const pay = await recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "bank", amount: "250", allocations: [{ billId: b1.id, amount: "200" }] });
    expect(pay.toAdvance.toString()).toBe("50");
    expect((await getBill(s.ctx, b1.id)).paymentStatus).toBe("paid");
    await voidSupplierPayment(s.ctx, pay.id);
    expect((await getBill(s.ctx, b1.id)).paymentStatus).toBe("unpaid");
    await expect(voidSupplierPayment(s.ctx, pay.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(voidSupplierPayment(s.ctx, ZERO)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const p2 = await recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "cash", amount: "100" });
    await voidSupplierPayment(s.ctx, p2.id); // restores opening payable
    expect((await listSupplierPayments(s.ctx)).items.length).toBeGreaterThanOrEqual(2);
    expect((await listBills(s.ctx, { status: "unpaid", q: "BILL" })).items).toHaveLength(1);
    await expect(recordSupplierPayment(s.ctx, { supplierId: ZERO, date: today, method: "cash", amount: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createDirectBill(s.ctx, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "10" }], payments: [{ method: "cash", amount: "20" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createDirectBill(s.ctx, { supplierId: ZERO, billDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "10" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getBill(s.ctx, ZERO)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("bills a receipt with prorated line discounts and returns more than due to supplier advance", async () => {
    const { s, v } = await setup();
    const sup = await createSupplier(s.ctx, { name: "Discount Supplier" });
    const po = await createPurchaseOrder(s.ctx, { supplierId: sup.id, orderDate: today, items: [{ variantId: v.id, qty: 10, unitPrice: "100", discount: "100", vatPct: "10" }] });
    const item = (await getPurchaseOrder(s.ctx, po.id)).items[0]!;
    const grn = await receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: item.id, qty: 5 }] });
    expect((await listUnbilledReceipts(s.ctx))).toHaveLength(1);
    const bill = await createBillFromGrn(s.ctx, grn.id, { billDate: today });
    expect(bill.total.toString()).toBe("495"); // 5×100 − 50 discount = 450 + 10% VAT
    expect((await listPurchaseOrders(s.ctx, { status: "partially_received" })).items).toHaveLength(1);
    await recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "cash", amount: "495" });
    const bi = (await getBill(s.ctx, bill.id)).items[0]!;
    const ret = await createPurchaseReturn(s.ctx, bill.id, { date: today, items: [{ itemId: bi.id, qty: 1 }], restock: true, reason: "Broken handle" });
    expect(ret.toAdvance.toString()).toBe("99");
    expect((await listPurchaseReturns(s.ctx))).toHaveLength(1);
    await expect(createPurchaseReturn(s.ctx, bill.id, { date: today, items: [{ itemId: bi.id, qty: 0 }], restock: true, reason: "none" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPurchaseReturn(s.ctx, bill.id, { date: today, items: [{ itemId: ZERO, qty: 1 }], restock: true, reason: "ghost" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPurchaseReturn(s.ctx, ZERO, { date: today, items: [{ itemId: bi.id, qty: 1 }], restock: true, reason: "ghost" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createBillFromGrn(s.ctx, ZERO, { billDate: today })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: item.id, qty: 0 }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: ZERO, qty: 1 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(receiveGoods(s.ctx, ZERO, { receivedDate: today, items: [{ poItemId: item.id, qty: 1 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPurchaseOrder(s.ctx, ZERO)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPurchaseOrder(s.ctx, { supplierId: ZERO, orderDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "1" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
