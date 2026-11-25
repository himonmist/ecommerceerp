import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { invoiceSchema, quotationSchema } from "@/lib/validation-erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { asDate, buildLines, loadVariants, lockIds } from "./common";
import { createInvoiceTx } from "./invoices";
import type { z } from "zod";

export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "converted"] as const;

export async function createQuotation(ctx: Ctx, raw: z.input<typeof quotationSchema>) {
  authorize(ctx, "sales.manage");
  const p = quotationSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const q = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    if (!(await tx.customer.findUnique({ where: { id: q.customerId } }))) throw new AppError("NOT_FOUND", "Customer not found.");
    const variants = await loadVariants(tx, q.items.map((i) => i.variantId));
    const { doc, rows } = buildLines(q.items, variants, q);
    const quotation = await tx.quotation.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "quotation"), customerId: q.customerId, date: asDate(q.date),
        validUntil: q.validUntil ? asDate(q.validUntil) : null, subtotal: doc.subtotal, vatTotal: doc.vatTotal, discount: doc.discount,
        additionalCharge: doc.additionalCharge, total: doc.total, terms: q.terms ?? null, createdBy: ctx.userId,
        items: { create: rows.map((r) => ({ tenantId: ctx.tenantId, variantId: r.variantId, description: r.description, qty: r.qty, unitPrice: r.unitPrice, discount: r.discount, vatPct: r.vatPct, lineTotal: r.lineTotal })) },
      },
    });
    await audit(tx, ctx, "quotation.created", "quotation", quotation.id, undefined, { number: quotation.number, total: doc.total });
    return quotation;
  });
}

export async function setQuotationStatus(ctx: Ctx, id: string, status: "draft" | "sent" | "accepted" | "rejected") {
  authorize(ctx, "sales.manage");
  if (!["draft", "sent", "accepted", "rejected"].includes(status)) throw new AppError("VALIDATION", "Unknown status.");
  return withTenant(ctx.tenantId, async (tx) => {
    const q = await tx.quotation.findUnique({ where: { id } });
    if (!q) throw new AppError("NOT_FOUND", "Quotation not found.");
    if (q.status === "converted") throw new AppError("VALIDATION", "This quotation has already been converted to an invoice.");
    const updated = await tx.quotation.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "quotation.status_changed", "quotation", id, { status: q.status }, { status });
    return updated;
  });
}

/** Turn a quotation into an invoice (stock is deducted then). Each quotation converts at most once. */
export async function convertQuotation(ctx: Ctx, id: string, opts: { invoiceDate: string | Date; dueDate?: string; payments?: z.input<typeof invoiceSchema>["payments"] }) {
  authorize(ctx, "sales.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "quotations", [id]);
    const q = await tx.quotation.findUnique({ where: { id }, include: { items: true } });
    if (!q) throw new AppError("NOT_FOUND", "Quotation not found.");
    if (q.status === "converted" || q.status === "rejected") throw new AppError("VALIDATION", `A ${q.status} quotation can't be converted.`);
    const parsed = invoiceSchema.safeParse({
      customerId: q.customerId, invoiceDate: opts.invoiceDate, dueDate: opts.dueDate, payments: opts.payments ?? [],
      discount: q.discount.toString(), additionalCharge: q.additionalCharge.toString(), notes: `From quotation ${q.number}`,
      items: q.items.map((i) => ({ variantId: i.variantId, qty: i.qty, unitPrice: i.unitPrice.toString(), discount: i.discount.toString(), vatPct: i.vatPct.toString() })),
    });
    if (!parsed.success) throw fromZod(parsed.error);
    const invoice = await createInvoiceTx(tx, ctx, { ...parsed.data, quotationId: q.id });
    await tx.quotation.update({ where: { id }, data: { status: "converted", convertedInvoiceId: invoice.id } });
    await audit(tx, ctx, "quotation.converted", "quotation", id, { status: q.status }, { status: "converted", invoice: invoice.number });
    return invoice;
  });
}

export async function getQuotation(ctx: Ctx, id: string) {
  authorize(ctx, "sales.view", { write: false });
  const q = await withTenant(ctx.tenantId, (tx) => tx.quotation.findUnique({ where: { id }, include: { items: true, customer: true } }));
  if (!q) throw new AppError("NOT_FOUND", "Quotation not found.");
  return q;
}

export async function listQuotations(ctx: Ctx, opts: { status?: string; page?: number } = {}) {
  authorize(ctx, "sales.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const where = opts.status && (QUOTATION_STATUSES as readonly string[]).includes(opts.status) ? { status: opts.status } : {};
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.quotation.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { customer: { select: { name: true } }, _count: { select: { items: true } } } });
    const total = await tx.quotation.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}
