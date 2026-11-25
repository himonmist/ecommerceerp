import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/server/db/tenant";
import { createProduct } from "@/server/services/catalog";
import {
  createCustomer, createCustomerType, customerAging, customerStatement, listCustomers,
} from "@/server/services/erp/customers";
import { convertQuotation, createQuotation, setQuotationStatus } from "@/server/services/erp/quotations";
import { createInvoice, getInvoice, listInvoices, voidInvoice } from "@/server/services/erp/invoices";
import { recordReceipt, voidReceipt } from "@/server/services/erp/receipts";
import { createSalesReturn } from "@/server/services/erp/sales-returns";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

const today = new Date().toISOString().slice(0, 10);

async function setup(stock = 20) {
  const s = await makeStore();
  const p = await createProduct(s.ctx, { name: "Dinner Set", variants: [{ title: "Default", onlinePrice: "1200", offlinePrice: "1000", costPrice: "600", stock }] });
  const v = p.variants[0]!;
  const line = (qty: number, extra: Record<string, string> = {}) => ({ variantId: v.id, qty, unitPrice: "1000", ...extra });
  const level = () => withTenant(s.tenantId, (tx) => tx.stockLevel.findFirstOrThrow());
  return { s, v, line, level };
}

describe("customers", () => {
  it("creates typed customers with membership ids, credit limit and opening balance", async () => {
    const { s } = await setup();
    const t = await createCustomerType(s.ctx, { name: "Wholesaler", code: "WS", discountPct: "5", creditDays: 30 });
    const c = await createCustomer(s.ctx, { name: "Acme Crockeries", phone: "01711111111", customerTypeId: t.id, creditLimit: "50000", openingBalance: "2500" });
    expect(c.membershipId).toMatch(/^CMID-\d{4}-\d{6}$/);
    expect(c.openingDue.toString()).toBe("2500");
    const list = await listCustomers(s.ctx, { q: "acme" });
    expect(list.items[0]).toMatchObject({ name: "Acme Crockeries", outstanding: "2500.00" });
    await expect(createCustomer(s.ctx, { name: "Dup", phone: "01711111111" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("direct invoices", () => {
  it("prices lines with discount and VAT, deducts stock and records split payments", async () => {
    const { s, line, level } = await setup();
    const c = await createCustomer(s.ctx, { name: "Rahim Traders", phone: "01722222222" });
    const inv = await createInvoice(s.ctx, {
      customerId: c.id, invoiceDate: today,
      items: [line(3, { discount: "300", vatPct: "5" })], discount: "35", additionalCharge: "100",
      payments: [{ method: "cash", amount: "1000" }, { method: "bkash", amount: "500", reference: "TX123" }],
    });
    // net 2700, VAT 135, total 2700+135-35+100 = 2900
    expect(inv.number).toBe("INV-000001");
    expect(inv.total.toString()).toBe("2900");
    expect(inv.paid.toString()).toBe("1500");
    expect(inv.paymentStatus).toBe("partial");
    expect(await level()).toMatchObject({ onHand: 17, reserved: 0 });
    const full = await getInvoice(s.ctx, inv.id);
    expect(full.allocations).toHaveLength(2);
    const move = await withTenant(s.tenantId, (tx) => tx.stockMovement.findFirst({ where: { type: "sale" } }));
    expect(move).toMatchObject({ qtyChange: -3, sourceType: "sales_invoice", sourceId: inv.id });
  });

  it("requires walk-in invoices to be fully paid and rejects overpayment", async () => {
    const { s, line } = await setup();
    await expect(createInvoice(s.ctx, { walkInName: "Counter sale", invoiceDate: today, items: [line(1)], payments: [{ method: "cash", amount: "500" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createInvoice(s.ctx, { walkInName: "Counter sale", invoiceDate: today, items: [line(1)], payments: [{ method: "cash", amount: "1500" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await createInvoice(s.ctx, { walkInName: "Counter sale", invoiceDate: today, items: [line(1)], payments: [{ method: "cash", amount: "1000" }] });
    expect(ok.paymentStatus).toBe("paid");
    expect(ok.customerName).toBe("Counter sale");
  });

  it("enforces the customer's credit limit (0 = no limit)", async () => {
    const { s, line } = await setup();
    const limited = await createCustomer(s.ctx, { name: "Tight Co", phone: "01733333333", creditLimit: "1500", openingBalance: "1000" });
    await expect(createInvoice(s.ctx, { customerId: limited.id, invoiceDate: today, items: [line(1)] }))
      .rejects.toMatchObject({ code: "CREDIT_LIMIT" }); // 1000 opening + 1000 new > 1500
    await expect(createInvoice(s.ctx, { customerId: limited.id, invoiceDate: today, items: [line(1)], payments: [{ method: "cash", amount: "600" }] }))
      .resolves.toBeTruthy(); // 1000 + 400 ≤ 1500
    const open = await createCustomer(s.ctx, { name: "Open Co", phone: "01744444444" });
    await expect(createInvoice(s.ctx, { customerId: open.id, invoiceDate: today, items: [line(5)] })).resolves.toBeTruthy();
  });

  it("refuses to sell more than available stock and leaves stock untouched", async () => {
    const { s, line, level } = await setup(2);
    const c = await createCustomer(s.ctx, { name: "Big Buyer", phone: "01755555555" });
    await expect(createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(3)] })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await level()).toMatchObject({ onHand: 2 });
  });

  it("voids an unpaid invoice and restocks; blocks voiding once paid", async () => {
    const { s, line, level } = await setup();
    const c = await createCustomer(s.ctx, { name: "Void Co", phone: "01766666666" });
    const a = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(4)] });
    await voidInvoice(s.ctx, a.id, "Entered twice");
    expect(await level()).toMatchObject({ onHand: 20 });
    expect((await getInvoice(s.ctx, a.id)).status).toBe("void");
    const b = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(1)], payments: [{ method: "cash", amount: "100" }] });
    await expect(voidInvoice(s.ctx, b.id, "x")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("enforces sales permissions and tenant isolation", async () => {
    const { s, line } = await setup();
    const other = await makeStore();
    const c = await createCustomer(s.ctx, { name: "Perm Co", phone: "01777777777" });
    await expect(createInvoice({ ...s.ctx, permissions: ["sales.view"] }, { customerId: c.id, invoiceDate: today, items: [line(1)] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createInvoice(other.ctx, { customerId: c.id, invoiceDate: today, items: [line(1)] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("receipts", () => {
  it("settles the opening balance, then the oldest invoices, with the excess as advance", async () => {
    const { s, line } = await setup();
    const c = await createCustomer(s.ctx, { name: "FIFO Ltd", phone: "01788888888", openingBalance: "500" });
    const i1 = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(1)] });
    const i2 = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(2)] });
    const r = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "bank", amount: "2000", reference: "DBBL-55" });
    expect(r.number).toBe("MR-000001");
    expect(r.toAdvance.toString()).toBe("0");
    expect((await getInvoice(s.ctx, i1.id)).paymentStatus).toBe("paid"); // 500 opening + 1000 i1
    expect((await getInvoice(s.ctx, i2.id)).paid.toString()).toBe("500");
    const over = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "2000" });
    expect(over.toAdvance.toString()).toBe("500");
    const list = await listCustomers(s.ctx, { q: "fifo" });
    expect(list.items[0]).toMatchObject({ outstanding: "0.00", advance: "500.00" });
  });

  it("uses customer advance on a new invoice and reverses a voided receipt", async () => {
    const { s, line } = await setup();
    const c = await createCustomer(s.ctx, { name: "Advance Co", phone: "01799999999" });
    const r = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "1500" });
    expect(r.toAdvance.toString()).toBe("1500");
    const inv = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(1)], useAdvance: true });
    expect(inv.paymentStatus).toBe("paid");
    // Advance now 500; voiding the 1500 receipt would need 1500 of advance → refused
    await expect(voidReceipt(s.ctx, r.id)).rejects.toMatchObject({ code: "VALIDATION" });

    const i2 = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(1)] });
    const r2 = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "300" });
    await voidReceipt(s.ctx, r2.id);
    expect((await getInvoice(s.ctx, i2.id)).paid.toString()).toBe("0"); // the 300 allocation is reversed
  });
});

describe("returns, quotations, statement and aging", () => {
  it("returns part of an invoice: restocks, reduces due, then credits advance", async () => {
    const { s, line, level } = await setup();
    const c = await createCustomer(s.ctx, { name: "Return Co", phone: "01811111111" });
    const inv = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(4)], payments: [{ method: "cash", amount: "3500" }] });
    const item = (await getInvoice(s.ctx, inv.id)).items[0]!;
    const ret = await createSalesReturn(s.ctx, inv.id, { date: today, items: [{ itemId: item.id, qty: 2 }], restock: true, reason: "Two plates broken in transit" });
    expect(ret.amount.toString()).toBe("2000");
    expect(ret.reduceDue.toString()).toBe("500");
    expect(ret.toAdvance.toString()).toBe("1500");
    expect(await level()).toMatchObject({ onHand: 18 });
    await expect(createSalesReturn(s.ctx, inv.id, { date: today, items: [{ itemId: item.id, qty: 3 }], restock: true, reason: "too many" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("converts an accepted quotation into an invoice exactly once", async () => {
    const { s, line, level } = await setup();
    const c = await createCustomer(s.ctx, { name: "Quote Co", phone: "01822222222" });
    const q = await createQuotation(s.ctx, { customerId: c.id, date: today, items: [line(2, { vatPct: "5" })], terms: "50% advance" });
    expect(q.number).toBe("QT-000001");
    expect(q.total.toString()).toBe("2100");
    await setQuotationStatus(s.ctx, q.id, "accepted");
    const inv = await convertQuotation(s.ctx, q.id, { invoiceDate: today });
    expect(inv.total.toString()).toBe("2100");
    expect(await level()).toMatchObject({ onHand: 18 });
    await expect(convertQuotation(s.ctx, q.id, { invoiceDate: today })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("produces a running-balance statement and an aging schedule", async () => {
    const { s, line } = await setup();
    const c = await createCustomer(s.ctx, { name: "Ledger Co", phone: "01833333333", openingBalance: "100" });
    await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [line(1)] });
    await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "400" });
    const st = await customerStatement(s.ctx, c.id);
    expect(st.rows.map((r) => r.balance)).toEqual(["100.00", "1100.00", "700.00"]);
    const aging = await customerAging(s.ctx);
    const row = aging.rows.find((r) => r.customerId === c.id)!;
    expect(row).toMatchObject({ current: "700.00", opening: "0.00", total: "700.00" }); // receipt cleared opening 100 first
    expect((await listInvoices(s.ctx, { status: "unpaid" })).items.length + (await listInvoices(s.ctx, { status: "partial" })).items.length).toBe(1);
  });
});
