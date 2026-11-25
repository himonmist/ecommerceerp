import "server-only";
import { postInvoice, postReceipt } from "../accounting/posting";
import { reverseSource } from "../accounting/ledger";
import { withTenant, type Tx } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { invoiceSchema } from "@/lib/validation-erp";
import { paymentStatus } from "@/lib/erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, buildLines, defaultWarehouseId, loadVariants, lockIds, money, stockIn, stockOut } from "./common";
import type { z } from "zod";

export type InvoiceInput = z.input<typeof invoiceSchema>;
type ParsedInvoice = z.output<typeof invoiceSchema> & { quotationId?: string };

/** Outstanding receivable for a customer: remaining opening + unpaid posted invoices. */
export async function customerOutstanding(tx: Tx, customerId: string, openingDue: { toString(): string }) {
  const rows = await tx.$queryRaw<{ due: string | null }[]>`
    SELECT sum(total - paid - returned)::text AS due FROM sales_invoices WHERE status = 'posted' AND customer_id = ${customerId}::uuid`;
  return D(openingDue).plus(D(rows[0]?.due));
}

/** Core invoice creation, reusable inside an existing tenant transaction (e.g. quotation conversion). */
export async function createInvoiceTx(tx: Tx, ctx: Ctx, input: ParsedInvoice) {
  if (!input.customerId && !input.walkInName) throw new AppError("VALIDATION", "Choose a customer or enter a walk-in name.", { customerId: "Required" });
  let customer = null;
  if (input.customerId) {
    await lockIds(tx, "customers", [input.customerId]);
    customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found.");
  }
  const variants = await loadVariants(tx, input.items.map((i) => i.variantId));
  const { doc, rows } = buildLines(input.items, variants, input);
  const total = D(doc.total);
  const paidCash = input.payments.reduce((a, p) => a.plus(D(p.amount)), D(0));
  if (paidCash.greaterThan(total)) throw new AppError("VALIDATION", "Payments are more than the invoice total.", { payments: "Too much" });
  const advanceUsed = customer && input.useAdvance ? Math.min(Number(customer.advanceBalance), Number(total.minus(paidCash))) : 0;
  const paid = paidCash.plus(advanceUsed);
  const due = total.minus(paid);
  if (!customer && due.greaterThan(0)) throw new AppError("VALIDATION", "Walk-in sales must be paid in full. Choose a customer to sell on credit.", { payments: "Pay in full" });
  if (customer && due.greaterThan(0) && D(customer.creditLimit).greaterThan(0)) {
    const outstanding = await customerOutstanding(tx, customer.id, customer.openingDue);
    if (outstanding.plus(due).greaterThan(D(customer.creditLimit))) {
      throw new AppError("CREDIT_LIMIT", `This sale would exceed ${customer.name}'s credit limit (৳${money(D(customer.creditLimit))}; currently owes ৳${money(outstanding)}).`);
    }
  }

  const warehouseId = await defaultWarehouseId(tx);
  const number = await nextNumber(tx, ctx.tenantId, "invoice");
  const invoice = await tx.salesInvoice.create({
    data: {
      tenantId: ctx.tenantId, number, customerId: customer?.id ?? null, customerName: customer?.name ?? input.walkInName!,
      warehouseId, quotationId: input.quotationId ?? null, invoiceDate: asDate(input.invoiceDate), dueDate: input.dueDate ? asDate(input.dueDate) : null,
      subtotal: doc.subtotal, vatTotal: doc.vatTotal, discount: doc.discount, additionalCharge: doc.additionalCharge, total: doc.total,
      paid: money(paid), paymentStatus: paymentStatus(total, paid), notes: input.notes ?? null, createdBy: ctx.userId,
      items: { create: rows.map((r) => ({ tenantId: ctx.tenantId, variantId: r.variantId, description: r.description, qty: r.qty, unitPrice: r.unitPrice,
        discount: r.discount, vatPct: r.vatPct, lineTotal: r.lineTotal, unitCost: variants.get(r.variantId)!.costPrice })) },
    },
  });
  for (const r of rows) {
    await stockOut(tx, ctx, { variantId: r.variantId, warehouseId, qty: r.qty, type: "sale", sourceType: "sales_invoice", sourceId: invoice.id, reference: number }, r.description);
  }
  await postInvoice(tx, ctx, invoice.id);
  const date = asDate(input.invoiceDate);
  const receiptIds: string[] = [];
  for (const p of input.payments) {
    const rc = await tx.customerReceipt.create({
      data: { tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "receipt"), customerId: customer?.id ?? null, date, method: p.method,
        reference: p.reference ?? null, amount: p.amount, createdBy: ctx.userId, notes: `Paid with ${number}`,
        allocations: { create: [{ tenantId: ctx.tenantId, invoiceId: invoice.id, amount: p.amount }] } },
    });
    receiptIds.push(rc.id);
  }
  if (advanceUsed > 0 && customer) {
    const amt = money(D(advanceUsed));
    const adv = await tx.customerReceipt.create({
      data: { tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "receipt"), customerId: customer.id, date, method: "advance", amount: amt, fromAdvance: amt,
        createdBy: ctx.userId, notes: `Advance applied to ${number}`, allocations: { create: [{ tenantId: ctx.tenantId, invoiceId: invoice.id, amount: amt }] } },
    });
    receiptIds.push(adv.id);
    await tx.customer.update({ where: { id: customer.id }, data: { advanceBalance: { decrement: amt } } });
  }
  for (const id of receiptIds) await postReceipt(tx, ctx, id);
  await audit(tx, ctx, "invoice.created", "sales_invoice", invoice.id, undefined, { number, total: doc.total, paid: money(paid) });
  return invoice;
}

export async function createInvoice(ctx: Ctx, raw: InvoiceInput) {
  authorize(ctx, "sales.manage");
  const p = invoiceSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  return withTenant(ctx.tenantId, (tx) => createInvoiceTx(tx, ctx, p.data));
}

export async function getInvoice(ctx: Ctx, id: string) {
  authorize(ctx, "sales.view", { write: false });
  const inv = await withTenant(ctx.tenantId, (tx) => tx.salesInvoice.findUnique({
    where: { id },
    include: { items: true, customer: true, allocations: { include: { receipt: true }, where: { receipt: { status: "posted" } } }, returns: { orderBy: { createdAt: "asc" } } },
  }));
  if (!inv) throw new AppError("NOT_FOUND", "Invoice not found.");
  return inv;
}

export async function listInvoices(ctx: Ctx, opts: { status?: string; q?: string; customerId?: string; page?: number } = {}) {
  authorize(ctx, "sales.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = {
    ...(opts.status === "void" ? { status: "void" } : opts.status && ["unpaid", "partial", "paid"].includes(opts.status) ? { status: "posted", paymentStatus: opts.status } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" as const } }, { customerName: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.salesInvoice.findMany({ where, orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25 });
    const total = await tx.salesInvoice.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}

export async function voidInvoice(ctx: Ctx, id: string, reason: string) {
  authorize(ctx, "sales.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "sales_invoices", [id]);
    const inv = await tx.salesInvoice.findUnique({ where: { id }, include: { items: true, returns: true } });
    if (!inv) throw new AppError("NOT_FOUND", "Invoice not found.");
    if (inv.status !== "posted") throw new AppError("VALIDATION", "This invoice is already void.");
    if (D(inv.paid).greaterThan(0) || inv.returns.length > 0) {
      throw new AppError("VALIDATION", "Void the receipts and returns on this invoice first — paid invoices can't be voided.");
    }
    for (const it of inv.items) {
      await stockIn(tx, ctx, { variantId: it.variantId, warehouseId: inv.warehouseId, qty: it.qty, type: "invoice_void", sourceType: "sales_invoice", sourceId: inv.id, reference: inv.number, notes: reason.slice(0, 200) });
    }
    await reverseSource(tx, ctx, "sales_invoice", id, `Invoice voided: ${reason.slice(0, 100)}`);
    const updated = await tx.salesInvoice.update({ where: { id }, data: { status: "void" } });
    await audit(tx, ctx, "invoice.voided", "sales_invoice", id, { status: "posted" }, { status: "void", reason: reason.slice(0, 200) });
    return updated;
  });
}
