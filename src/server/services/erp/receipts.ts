import "server-only";
import { postReceipt } from "../accounting/posting";
import { reverseSource } from "../accounting/ledger";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { receiptSchema } from "@/lib/validation-erp";
import { allocateFIFO, paymentStatus } from "@/lib/erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, lockIds, money } from "./common";
import type { z } from "zod";

const OPENING = "__opening__";

/** Money in from a customer: settles opening balance, then oldest invoices (or explicit allocations); excess → advance. */
export async function recordReceipt(ctx: Ctx, raw: z.input<typeof receiptSchema>) {
  authorize(ctx, "sales.manage");
  const p = receiptSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const r = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "customers", [r.customerId]);
    const customer = await tx.customer.findUnique({ where: { id: r.customerId } });
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found.");
    const open = await tx.salesInvoice.findMany({ where: { customerId: customer.id, status: "posted", paymentStatus: { not: "paid" } }, orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }] });
    await lockIds(tx, "sales_invoices", open.map((i) => i.id));
    const dueOf = new Map(open.map((i) => [i.id, D(i.total).minus(D(i.paid)).minus(D(i.returned))]));

    let allocations: { id: string; amount: string }[];
    let remainder: string;
    if (r.allocations?.length) {
      let sum = D(0);
      for (const a of r.allocations) {
        const due = dueOf.get(a.invoiceId);
        if (!due) throw new AppError("NOT_FOUND", "An allocated invoice was not found or is already paid.");
        if (D(a.amount).greaterThan(due)) throw new AppError("VALIDATION", "An allocation is larger than the invoice due.");
        sum = sum.plus(D(a.amount));
      }
      if (sum.greaterThan(D(r.amount))) throw new AppError("VALIDATION", "Allocations are more than the amount received.");
      allocations = r.allocations.filter((a) => D(a.amount).greaterThan(0)).map((a) => ({ id: a.invoiceId, amount: money(D(a.amount)) }));
      remainder = money(D(r.amount).minus(sum));
    } else {
      ({ allocations, remainder } = allocateFIFO(r.amount, [{ id: OPENING, due: customer.openingDue }, ...open.map((i) => ({ id: i.id, due: dueOf.get(i.id)! }))]));
    }

    const receipt = await tx.customerReceipt.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "receipt"), customerId: customer.id, date: asDate(r.date),
        method: r.method, reference: r.reference ?? null, amount: r.amount, toAdvance: remainder, notes: r.notes ?? null, createdBy: ctx.userId,
        allocations: { create: allocations.map((a) => ({ tenantId: ctx.tenantId, invoiceId: a.id === OPENING ? null : a.id, amount: a.amount })) },
      },
    });
    for (const a of allocations) {
      if (a.id === OPENING) continue;
      const inv = open.find((i) => i.id === a.id)!;
      const paid = D(inv.paid).plus(D(a.amount));
      await tx.salesInvoice.update({ where: { id: a.id }, data: { paid: money(paid), paymentStatus: paymentStatus(inv.total, paid, inv.returned) } });
    }
    const toOpening = allocations.find((a) => a.id === OPENING)?.amount ?? "0";
    await tx.customer.update({ where: { id: customer.id }, data: { openingDue: { decrement: toOpening }, advanceBalance: { increment: remainder } } });
    await postReceipt(tx, ctx, receipt.id);
    await audit(tx, ctx, "receipt.recorded", "customer_receipt", receipt.id, undefined, { number: receipt.number, amount: r.amount, toAdvance: remainder });
    return receipt;
  });
}

export async function voidReceipt(ctx: Ctx, id: string) {
  authorize(ctx, "sales.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    const rec = await tx.customerReceipt.findUnique({ where: { id }, include: { allocations: true } });
    if (!rec) throw new AppError("NOT_FOUND", "Receipt not found.");
    if (rec.status !== "posted") throw new AppError("VALIDATION", "This receipt is already void.");
    if (rec.customerId) await lockIds(tx, "customers", [rec.customerId]);
    const customer = rec.customerId ? await tx.customer.findUniqueOrThrow({ where: { id: rec.customerId } }) : null;
    if (customer && D(rec.toAdvance).greaterThan(D(customer.advanceBalance))) {
      throw new AppError("VALIDATION", "The advance from this receipt has already been used. Void the invoices that used it first.");
    }
    const invIds = rec.allocations.flatMap((a) => (a.invoiceId ? [a.invoiceId] : []));
    await lockIds(tx, "sales_invoices", invIds);
    let toOpening = D(0);
    for (const a of rec.allocations) {
      if (!a.invoiceId) { toOpening = toOpening.plus(D(a.amount)); continue; }
      const inv = await tx.salesInvoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
      const paid = D(inv.paid).minus(D(a.amount));
      await tx.salesInvoice.update({ where: { id: inv.id }, data: { paid: money(paid), paymentStatus: paymentStatus(inv.total, paid, inv.returned) } });
    }
    if (customer) {
      await tx.customer.update({ where: { id: customer.id }, data: {
        openingDue: { increment: money(toOpening) },
        advanceBalance: { increment: money(D(rec.fromAdvance).minus(D(rec.toAdvance))) },
      } });
    }
    await reverseSource(tx, ctx, "customer_receipt", id, "Receipt voided");
    const updated = await tx.customerReceipt.update({ where: { id }, data: { status: "void" } });
    await audit(tx, ctx, "receipt.voided", "customer_receipt", id, { status: "posted" }, { status: "void" });
    return updated;
  });
}

export async function listReceipts(ctx: Ctx, opts: { page?: number } = {}) {
  authorize(ctx, "sales.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.customerReceipt.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { customer: { select: { name: true } }, _count: { select: { allocations: true } } } });
    const total = await tx.customerReceipt.count();
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}
