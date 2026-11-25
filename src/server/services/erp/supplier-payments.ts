import "server-only";
import { postSupplierPayment } from "../accounting/posting";
import { reverseSource } from "../accounting/ledger";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { supplierPaymentSchema } from "@/lib/validation-erp";
import { allocateFIFO, paymentStatus } from "@/lib/erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, lockIds, money } from "./common";
import type { z } from "zod";

const OPENING = "__opening__";

/** Money out to a supplier: opening payable first, then oldest bills (or explicit allocations); excess → supplier advance. */
export async function recordSupplierPayment(ctx: Ctx, raw: z.input<typeof supplierPaymentSchema>) {
  authorize(ctx, "purchase.manage");
  const p = supplierPaymentSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const r = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "suppliers", [r.supplierId]);
    const sup = await tx.supplier.findUnique({ where: { id: r.supplierId } });
    if (!sup) throw new AppError("NOT_FOUND", "Supplier not found.");
    const open = await tx.purchaseBill.findMany({ where: { supplierId: sup.id, status: "posted", paymentStatus: { not: "paid" } }, orderBy: [{ billDate: "asc" }, { createdAt: "asc" }] });
    await lockIds(tx, "purchase_bills", open.map((b) => b.id));
    const dueOf = new Map(open.map((b) => [b.id, D(b.total).minus(D(b.paid)).minus(D(b.returned))]));
    let allocations: { id: string; amount: string }[];
    let remainder: string;
    if (r.allocations?.length) {
      let sum = D(0);
      for (const a of r.allocations) {
        const due = dueOf.get(a.billId);
        if (!due) throw new AppError("NOT_FOUND", "An allocated bill was not found or is already paid.");
        if (D(a.amount).greaterThan(due)) throw new AppError("VALIDATION", "An allocation is larger than the bill due.");
        sum = sum.plus(D(a.amount));
      }
      if (sum.greaterThan(D(r.amount))) throw new AppError("VALIDATION", "Allocations are more than the amount paid.");
      allocations = r.allocations.filter((a) => D(a.amount).greaterThan(0)).map((a) => ({ id: a.billId, amount: money(D(a.amount)) }));
      remainder = money(D(r.amount).minus(sum));
    } else {
      ({ allocations, remainder } = allocateFIFO(r.amount, [{ id: OPENING, due: sup.openingDue }, ...open.map((b) => ({ id: b.id, due: dueOf.get(b.id)! }))]));
    }
    const pay = await tx.supplierPayment.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "supplier_payment"), supplierId: sup.id, date: asDate(r.date), method: r.method,
        reference: r.reference ?? null, amount: r.amount, toAdvance: remainder, notes: r.notes ?? null, createdBy: ctx.userId,
        allocations: { create: allocations.map((a) => ({ tenantId: ctx.tenantId, billId: a.id === OPENING ? null : a.id, amount: a.amount })) },
      },
    });
    for (const a of allocations) {
      if (a.id === OPENING) continue;
      const b = open.find((x) => x.id === a.id)!;
      const paid = D(b.paid).plus(D(a.amount));
      await tx.purchaseBill.update({ where: { id: b.id }, data: { paid: money(paid), paymentStatus: paymentStatus(b.total, paid, b.returned) } });
    }
    const toOpening = allocations.find((a) => a.id === OPENING)?.amount ?? "0";
    await tx.supplier.update({ where: { id: sup.id }, data: { openingDue: { decrement: toOpening }, advanceBalance: { increment: remainder } } });
    await postSupplierPayment(tx, ctx, pay.id);
    await audit(tx, ctx, "supplier_payment.recorded", "supplier_payment", pay.id, undefined, { number: pay.number, amount: r.amount, toAdvance: remainder });
    return pay;
  });
}

export async function voidSupplierPayment(ctx: Ctx, id: string) {
  authorize(ctx, "purchase.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    const pay = await tx.supplierPayment.findUnique({ where: { id }, include: { allocations: true } });
    if (!pay) throw new AppError("NOT_FOUND", "Payment not found.");
    if (pay.status !== "posted") throw new AppError("VALIDATION", "This payment is already void.");
    await lockIds(tx, "suppliers", [pay.supplierId]);
    const sup = await tx.supplier.findUniqueOrThrow({ where: { id: pay.supplierId } });
    if (D(pay.toAdvance).greaterThan(D(sup.advanceBalance))) throw new AppError("VALIDATION", "The advance from this payment has already been used.");
    await lockIds(tx, "purchase_bills", pay.allocations.flatMap((a) => (a.billId ? [a.billId] : [])));
    let toOpening = D(0);
    for (const a of pay.allocations) {
      if (!a.billId) { toOpening = toOpening.plus(D(a.amount)); continue; }
      const b = await tx.purchaseBill.findUniqueOrThrow({ where: { id: a.billId } });
      const paid = D(b.paid).minus(D(a.amount));
      await tx.purchaseBill.update({ where: { id: b.id }, data: { paid: money(paid), paymentStatus: paymentStatus(b.total, paid, b.returned) } });
    }
    await tx.supplier.update({ where: { id: sup.id }, data: { openingDue: { increment: money(toOpening) }, advanceBalance: { increment: money(D(pay.fromAdvance).minus(D(pay.toAdvance))) } } });
    await reverseSource(tx, ctx, "supplier_payment", id, "Payment voided");
    const updated = await tx.supplierPayment.update({ where: { id }, data: { status: "void" } });
    await audit(tx, ctx, "supplier_payment.voided", "supplier_payment", id, { status: "posted" }, { status: "void" });
    return updated;
  });
}

export async function listSupplierPayments(ctx: Ctx, opts: { page?: number } = {}) {
  authorize(ctx, "purchase.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.supplierPayment.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { supplier: { select: { name: true } } } });
    const total = await tx.supplierPayment.count();
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}
