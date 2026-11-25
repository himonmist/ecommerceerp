import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { createProduct } from "@/server/services/catalog";
import { adjustStock } from "@/server/services/inventory";
import { getStorefront } from "@/server/services/storefront";
import { placeOrder, transitionOrder } from "@/server/services/orders";
import { createCustomer } from "@/server/services/erp/customers";
import { createInvoice, getInvoice, voidInvoice } from "@/server/services/erp/invoices";
import { recordReceipt, voidReceipt } from "@/server/services/erp/receipts";
import { createSalesReturn } from "@/server/services/erp/sales-returns";
import { createSupplier } from "@/server/services/erp/suppliers";
import { createPurchaseOrder, getPurchaseOrder, receiveGoods } from "@/server/services/erp/purchase-orders";
import { createBillFromGrn, createDirectBill, getBill } from "@/server/services/erp/bills";
import { recordSupplierPayment } from "@/server/services/erp/supplier-payments";
import { createPurchaseReturn } from "@/server/services/erp/purchase-returns";
import { initializeLedger, ledgerStatus } from "@/server/services/accounting/ledger";
import { balancesByKey, balanceSheet, generalLedger, profitAndLoss, trialBalance, vatSummary, dayBook, cashBook } from "@/server/services/accounting/reports";
import { approveVoucher, cancelVoucher, createVoucher, verifyVoucher, getJournal, listJournals } from "@/server/services/accounting/vouchers";
import { createAccount, listAccounts, setPeriodLock } from "@/server/services/accounting/accounts";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);
const today = new Date().toISOString().slice(0, 10);

async function setup(stock = 10, cost = "600") {
  const s = await makeStore();
  const p = await createProduct(s.ctx, { name: "Dinner Set", variants: [{ title: "Default", onlinePrice: "1000", costPrice: cost, stock }] });
  return { s, v: p.variants[0]! };
}
const bal = async (s: { ctx: Parameters<typeof balancesByKey>[0] }) => balancesByKey(s.ctx);

describe("ledger setup", () => {
  it("seeds a chart of accounts for new stores and posts opening stock", async () => {
    const { s } = await setup(10, "600");
    expect((await ledgerStatus(s.ctx)).active).toBe(true);
    const accounts = await listAccounts(s.ctx);
    expect(accounts.find((a) => a.systemKey === "ar")?.code).toBe("1100");
    expect(accounts.length).toBeGreaterThan(25);
    const b = await bal(s);
    expect(b.inventory).toBe("6000.00");          // 10 × 600 at cost
    expect(b.opening_equity).toBe("-6000.00");    // credit balance
  });

  it("builds an opening-balance journal for a store that existed before accounting", async () => {
    const s = await makeStore();
    await withTenant(s.tenantId, (tx) => tx.ledgerSettings.deleteMany()); // simulate a pre-Phase-3 store
    const p = await createProduct(s.ctx, { name: "Old Stock", variants: [{ title: "Default", onlinePrice: "500", costPrice: "200", stock: 5 }] });
    const c = await createCustomer(s.ctx, { name: "Old Debtor", phone: "01511111111", openingBalance: "700" });
    await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: p.variants[0]!.id, qty: 1, unitPrice: "500" }] });
    const sup = await createSupplier(s.ctx, { name: "Old Creditor", openingBalance: "300" });
    expect(await withTenant(s.tenantId, (tx) => tx.journal.count())).toBe(0); // nothing posted while inactive
    await initializeLedger(s.ctx);
    const b = await bal(s);
    expect(b.inventory).toBe("800.00");   // 4 left × 200
    expect(b.ar).toBe("1200.00");         // 700 opening + 500 invoice
    expect(b.ap).toBe("-300.00");
    expect(b.opening_equity).toBe("-1700.00");
    await expect(initializeLedger(s.ctx)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(sup).toBeTruthy();
  });
});

describe("automatic postings — sales", () => {
  it("posts invoices, receipts and returns so receivable matches customer balances", async () => {
    const { s, v } = await setup(20, "600");
    const c = await createCustomer(s.ctx, { name: "Rahim", phone: "01722222222", openingBalance: "500" });
    // 3 × 1000, line discount 300, VAT 5% (135), doc discount 35, charge 100 → total 2900
    const inv = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 3, unitPrice: "1000", discount: "300", vatPct: "5" }], discount: "35", additionalCharge: "100", payments: [{ method: "bkash", amount: "900" }] });
    let b = await bal(s);
    expect(b.ar).toBe("2500.00");           // 500 opening + 2900 − 900
    expect(b.sales).toBe("-2700.00");
    expect(b.vat_out).toBe("-135.00");
    expect(b.sales_discount).toBe("35.00");
    expect(b.other_income).toBe("-100.00");
    expect(b.bkash).toBe("900.00");
    expect(b.cogs).toBe("1800.00");         // 3 × 600
    expect(b.inventory).toBe(String((20 - 3) * 600) + ".00");
    expect((await getInvoice(s.ctx, inv.id)).journalId).toBeTruthy();

    await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "cash", amount: "3000" });
    b = await bal(s);
    expect(b.ar).toBe("0.00");
    expect(b.customer_advance).toBe("-500.00");
    expect(b.cash).toBe("3000.00");

    const item = (await getInvoice(s.ctx, inv.id)).items[0]!;
    await createSalesReturn(s.ctx, inv.id, { date: today, items: [{ itemId: item.id, qty: 1 }], restock: true, reason: "Broken plate" });
    b = await bal(s);
    // 1/3 of line total 2835 = 945 → net 900 + VAT 45; invoice already paid → advance
    expect(b.sales_returns).toBe("900.00");
    expect(b.vat_out).toBe("-90.00");
    expect(b.customer_advance).toBe("-1445.00");
    expect(b.cogs).toBe("1200.00");
    expect((await trialBalance(s.ctx)).balanced).toBe(true);
  });

  it("reverses voided invoices and receipts exactly", async () => {
    const { s, v } = await setup(10, "600");
    const c = await createCustomer(s.ctx, { name: "Void Co", phone: "01733333333" });
    const before = await bal(s);
    const inv = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 2, unitPrice: "1000" }] });
    await voidInvoice(s.ctx, inv.id, "duplicate");
    expect(await bal(s)).toEqual(before);
    const inv2 = await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "1000" }] });
    const r = await recordReceipt(s.ctx, { customerId: c.id, date: today, method: "nagad", amount: "400" });
    await voidReceipt(s.ctx, r.id);
    const b = await bal(s);
    expect(b.nagad ?? "0.00").toBe("0.00");
    expect(b.ar).toBe("1000.00");
    const js = await withTenant(s.tenantId, (tx) => tx.journal.findMany({ where: { sourceId: r.id }, orderBy: { createdAt: "asc" } }));
    expect(js.map((j) => j.status)).toEqual(["cancelled", "approved"]);
    expect(js[0]!.reversedById).toBe(js[1]!.id);
    expect(inv2).toBeTruthy();
  });

  it("posts online COD orders on delivery and reverses on return", async () => {
    const { s, v } = await setup(5, "600");
    const sf = await getStorefront(s.slug);
    const o = await placeOrder(s.tenantId, { name: "Shopper", phone: "01744444444", address: "House 1, Road 2, Dhanmondi", zoneId: sf!.zones[0]!.id, items: [{ variantId: v.id, qty: 2 }] }, {});
    expect((await bal(s)).cogs ?? "0.00").toBe("0.00"); // nothing until delivered
    for (const to of ["confirmed", "preparing", "ready", "packed", "shipped", "delivered"] as const) await transitionOrder(s.ctx, o.id, to);
    let b = await bal(s);
    expect(b.cod).toBe("2070.00");          // 2000 + 70 delivery
    expect(b.sales).toBe("-2000.00");
    expect(b.other_income).toBe("-70.00");
    expect(b.cogs).toBe("1200.00");
    await transitionOrder(s.ctx, o.id, "returned");
    b = await bal(s);
    expect(b.cod).toBe("0.00");
    expect(b.cogs).toBe("0.00");
    expect(b.inventory).toBe("3000.00");
  });

  it("posts stock adjustments at cost", async () => {
    const { s, v } = await setup(10, "100");
    await adjustStock(s.ctx, { variantId: v.id, change: -3, reason: "Breakage" });
    await adjustStock(s.ctx, { variantId: v.id, change: 1, reason: "Found in count" });
    const b = await bal(s);
    expect(b.shrinkage).toBe("300.00");
    expect(b.inventory_gain).toBe("-100.00");
    expect(b.inventory).toBe("800.00");
  });
});

describe("automatic postings — purchase", () => {
  it("clears GRNI when a goods receipt is billed and AP matches supplier payable", async () => {
    const { s, v } = await setup(0, "0");
    const sup = await createSupplier(s.ctx, { name: "Protik", openingBalance: "1000" });
    expect((await bal(s)).ap).toBe("-1000.00");
    const po = await createPurchaseOrder(s.ctx, { supplierId: sup.id, orderDate: today, items: [{ variantId: v.id, qty: 10, unitPrice: "100", vatPct: "10" }] });
    const it = (await getPurchaseOrder(s.ctx, po.id)).items[0]!;
    const grn = await receiveGoods(s.ctx, po.id, { receivedDate: today, items: [{ poItemId: it.id, qty: 10 }] });
    let b = await bal(s);
    expect(b.inventory).toBe("1000.00");
    expect(b.grni).toBe("-1000.00");
    const bill = await createBillFromGrn(s.ctx, grn.id, { billDate: today, additionalCharge: "50" });
    b = await bal(s);
    expect(b.grni).toBe("0.00");
    expect(b.vat_in).toBe("100.00");
    expect(b.purchase_charges).toBe("50.00");
    expect(b.ap).toBe("-2150.00");          // 1000 opening + 1150 bill
    await recordSupplierPayment(s.ctx, { supplierId: sup.id, date: today, method: "bank", amount: "2500" });
    b = await bal(s);
    expect(b.ap).toBe("0.00");
    expect(b.supplier_advance).toBe("350.00");
    expect(b.bank).toBe("-2500.00");
    const bi = (await getBill(s.ctx, bill.id)).items[0]!;
    await createPurchaseReturn(s.ctx, bill.id, { date: today, items: [{ itemId: bi.id, qty: 2 }], restock: true, reason: "Cracked" });
    b = await bal(s);
    expect(b.inventory).toBe("800.00");
    expect(b.vat_in).toBe("80.00");
    expect(b.supplier_advance).toBe("570.00");
    expect((await trialBalance(s.ctx)).balanced).toBe(true);
  });

  it("posts direct bills with counter payments", async () => {
    const { s, v } = await setup(0, "0");
    const sup = await createSupplier(s.ctx, { name: "Akij" });
    await createDirectBill(s.ctx, { supplierId: sup.id, billDate: today, items: [{ variantId: v.id, qty: 4, unitPrice: "250" }], discount: "100", payments: [{ method: "cash", amount: "400" }] });
    const b = await bal(s);
    expect(b.inventory).toBe("1000.00");
    expect(b.purchase_discount).toBe("-100.00");
    expect(b.ap).toBe("-500.00");
    expect(b.cash).toBe("-400.00");
  });
});

describe("manual vouchers", () => {
  it("records expenses (DV), incomes (CV), journals (JV) and transfers (TM) with verify and cancel", async () => {
    const { s } = await setup(0, "0");
    const accounts = await listAccounts(s.ctx);
    const id = (k: string) => accounts.find((a) => a.systemKey === k)!.id;
    const rent = accounts.find((a) => a.name === "Rent")!.id;
    const capital = await createVoucher(s.ctx, { type: "CV", date: today, description: "Owner capital", moneyAccountId: id("bank"), lines: [{ accountId: id("capital"), amount: "50000" }] });
    expect(capital.number).toBe("CV-000001");
    const dv = await createVoucher(s.ctx, { type: "DV", date: today, description: "November rent", moneyAccountId: id("cash"), lines: [{ accountId: rent, amount: "12000", memo: "Showroom" }], status: "draft" });
    expect((await balancesByKey(s.ctx)).cash ?? "0.00").toBe("0.00"); // drafts don't count
    await approveVoucher(s.ctx, dv.id);
    await verifyVoucher(s.ctx, dv.id);
    expect((await getJournal(s.ctx, dv.id)).status).toBe("verified");
    await createVoucher(s.ctx, { type: "TM", date: today, description: "Cash deposit", fromAccountId: id("bank"), toAccountId: id("cash"), amount: "20000" });
    await expect(createVoucher(s.ctx, { type: "JV", date: today, description: "Bad", lines: [{ accountId: rent, debit: "10" }, { accountId: id("capital"), credit: "9" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const jv = await createVoucher(s.ctx, { type: "JV", date: today, description: "Reclass", lines: [{ accountId: rent, debit: "500" }, { accountId: id("capital"), credit: "500" }] });
    await cancelVoucher(s.ctx, jv.id, "Wrong account");
    const b = await balancesByKey(s.ctx);
    expect(b.bank).toBe("30000.00");
    expect(b.cash).toBe("8000.00");
    expect(b.capital).toBe("-50000.00");
    const pl = await profitAndLoss(s.ctx, { from: today, to: today });
    expect(pl.netProfit).toBe("-12000.00");
    expect((await listJournals(s.ctx, { type: "DV" })).items).toHaveLength(1);
    await expect(verifyVoucher({ ...s.ctx, permissions: ["accounting.view", "accounting.manage"] }, capital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates custom accounts and refuses to cancel system postings manually", async () => {
    const { s } = await setup(5, "100");
    const acc = await createAccount(s.ctx, { name: "Dutch Bangla Bank", nature: "asset", kind: "bank" });
    expect(acc.code).toMatch(/^10\d\d$/);
    await expect(createAccount(s.ctx, { name: "Dutch Bangla Bank", nature: "asset" })).rejects.toMatchObject({ code: "CONFLICT" });
    const sys = (await listJournals(s.ctx, { type: "SYS" })).items[0]!;
    await expect(cancelVoucher(s.ctx, sys.id, "nope")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("database guarantees", () => {
  it("rejects unbalanced journals, edits to posted lines and other tenants' accounts", async () => {
    const { s } = await setup(5, "100");
    const other = await makeStore();
    const accounts = await listAccounts(s.ctx);
    const [a, b2] = [accounts[0]!, accounts[1]!];
    await expect(withTenant(s.tenantId, async (tx) => {
      const j = await tx.journal.create({ data: { tenantId: s.tenantId, number: "X-1", voucherType: "JV", date: new Date(), description: "raw", amount: "10" } });
      await tx.journalLine.createMany({ data: [{ tenantId: s.tenantId, journalId: j.id, accountId: a.id, debit: "10" }, { tenantId: s.tenantId, journalId: j.id, accountId: b2.id, credit: "9" }] });
    })).rejects.toThrow(/unbalanced/);
    await expect(withTenant(s.tenantId, (tx) => tx.journalLine.updateMany({ data: { memo: "tamper" } }))).rejects.toThrow(/immutable/);
    await expect(withTenant(s.tenantId, (tx) => tx.journal.deleteMany())).rejects.toThrow(/cannot be deleted/);
    expect(await withTenant(other.tenantId, (tx) => tx.journalLine.count({ where: { accountId: a.id } }))).toBe(0);
  });

  it("locks closed periods for automatic and manual postings", async () => {
    const { s, v } = await setup(10, "100");
    const c = await createCustomer(s.ctx, { name: "Lock Co", phone: "01755555555" });
    await setPeriodLock(s.ctx, today);
    await expect(createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 1, unitPrice: "1" }] })).rejects.toMatchObject({ code: "PERIOD_LOCKED" });
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    await expect(createInvoice(s.ctx, { customerId: c.id, invoiceDate: tomorrow, items: [{ variantId: v.id, qty: 1, unitPrice: "1" }] })).resolves.toBeTruthy();
    await setPeriodLock(s.ctx, null);
    expect((await ledgerStatus(s.ctx)).lockedThrough).toBeNull();
  });
});

describe("reports", () => {
  it("balances the trial balance and the balance sheet; P&L, GL, VAT, day book and cash book agree", async () => {
    const { s, v } = await setup(10, "600");
    const c = await createCustomer(s.ctx, { name: "Report Co", phone: "01766666666" });
    await createInvoice(s.ctx, { customerId: c.id, invoiceDate: today, items: [{ variantId: v.id, qty: 2, unitPrice: "1000", vatPct: "15" }], payments: [{ method: "cash", amount: "2300" }] });
    const tb = await trialBalance(s.ctx);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    const pl = await profitAndLoss(s.ctx, { from: today, to: today });
    expect(pl.revenue).toBe("2000.00");
    expect(pl.cogs).toBe("1200.00");
    expect(pl.netProfit).toBe("800.00");
    const bs = await balanceSheet(s.ctx);
    expect(bs.balanced).toBe(true);
    expect(bs.currentEarnings).toBe("800.00");
    const cashId = (await listAccounts(s.ctx)).find((a) => a.systemKey === "cash")!.id;
    const gl = await generalLedger(s.ctx, cashId, { from: today, to: today });
    expect(gl.closing).toBe("2300.00");
    expect(gl.rows.at(-1)?.balance).toBe("2300.00");
    const vat = await vatSummary(s.ctx, new Date().getFullYear());
    expect(vat.months.find((m) => m.output !== "0.00")?.output).toBe("300.00");
    expect((await dayBook(s.ctx, today)).journals.length).toBeGreaterThanOrEqual(3);
    expect((await cashBook(s.ctx)).find((a) => a.systemKey === "cash")?.balance).toBe("2300.00");
    await expect(trialBalance({ ...s.ctx, permissions: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma).toBeTruthy();
  });
});
