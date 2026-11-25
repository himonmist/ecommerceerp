import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { returnSchema } from "@/lib/validation-erp";
import { paymentStatus } from "@/lib/erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, lockIds, money, stockIn } from "./common";
import type { z } from "zod";

/** Customer returns goods from an invoice: optional restock, then reduce due; excess → advance (or cash refund for walk-ins). */
export async function createSalesReturn(ctx: Ctx, invoiceId: string, raw: z.input<typeof returnSchema>) {
  authorize(ctx, "sales.manage");
  const p = returnSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const r = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "sales_invoices", [invoiceId]);
    const inv = await tx.salesInvoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
    if (!inv) throw new AppError("NOT_FOUND", "Invoice not found.");
    if (inv.status !== "posted") throw new AppError("VALIDATION", "You can only return items from a posted invoice.");
    const lines = r.items.filter((i) => i.qty > 0).map((i) => {
      const it = inv.items.find((x) => x.id === i.itemId);
      if (!it) throw new AppError("NOT_FOUND", "Invoice line not found.");
      if (i.qty > it.qty - it.returnedQty) throw new AppError("VALIDATION", `You can return at most ${it.qty - it.returnedQty} of "${it.description}".`);
      return { it, qty: i.qty, amount: D(it.lineTotal).dividedBy(it.qty).times(i.qty) };
    });
    if (lines.length === 0) throw new AppError("VALIDATION", "Enter a quantity to return.");
    const amount = D(money(lines.reduce((a, l) => a.plus(l.amount), D(0))));
    const due = D(inv.total).minus(D(inv.paid)).minus(D(inv.returned));
    const reduceDue = amount.lessThan(due) ? amount : due;
    const excess = amount.minus(reduceDue);
    const toAdvance = inv.customerId ? excess : D(0);
    const refund = inv.customerId ? D(0) : excess;

    const ret = await tx.salesReturn.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "sales_return"), invoiceId, customerId: inv.customerId,
        date: asDate(r.date), amount: money(amount), reduceDue: money(reduceDue), toAdvance: money(toAdvance), refundAmount: money(refund),
        restock: r.restock, reason: r.reason, createdBy: ctx.userId,
        items: { create: lines.map((l) => ({ tenantId: ctx.tenantId, invoiceItemId: l.it.id, qty: l.qty, amount: money(l.amount) })) },
      },
    });
    for (const l of lines) {
      await tx.salesInvoiceItem.update({ where: { id: l.it.id }, data: { returnedQty: { increment: l.qty } } });
      if (r.restock) {
        await stockIn(tx, ctx, { variantId: l.it.variantId, warehouseId: inv.warehouseId, qty: l.qty, type: "sales_return", sourceType: "sales_return", sourceId: ret.id, reference: ret.number, notes: r.reason.slice(0, 200) });
      }
    }
    const returned = D(inv.returned).plus(reduceDue);
    await tx.salesInvoice.update({ where: { id: invoiceId }, data: { returned: money(returned), paymentStatus: paymentStatus(inv.total, inv.paid, returned) } });
    if (inv.customerId && toAdvance.greaterThan(0)) await tx.customer.update({ where: { id: inv.customerId }, data: { advanceBalance: { increment: money(toAdvance) } } });
    await audit(tx, ctx, "sales_return.created", "sales_return", ret.id, undefined, { number: ret.number, invoice: inv.number, amount: money(amount) });
    return ret;
  });
}

export async function listSalesReturns(ctx: Ctx) {
  authorize(ctx, "sales.view", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.salesReturn.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { invoice: { select: { number: true, customerName: true } } } }));
}
