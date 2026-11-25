import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { returnSchema } from "@/lib/validation-erp";
import { paymentStatus } from "@/lib/erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, lockIds, money, stockOut } from "./common";
import type { z } from "zod";

/** Return goods to a supplier (debit note): stock goes out, payable falls; any excess becomes a supplier advance. */
export async function createPurchaseReturn(ctx: Ctx, billId: string, raw: z.input<typeof returnSchema>) {
  authorize(ctx, "purchase.manage");
  const p = returnSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const r = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "purchase_bills", [billId]);
    const bill = await tx.purchaseBill.findUnique({ where: { id: billId }, include: { items: true } });
    if (!bill) throw new AppError("NOT_FOUND", "Bill not found.");
    if (bill.status !== "posted") throw new AppError("VALIDATION", "You can only return items from a posted bill.");
    const lines = r.items.filter((i) => i.qty > 0).map((i) => {
      const it = bill.items.find((x) => x.id === i.itemId);
      if (!it) throw new AppError("NOT_FOUND", "Bill line not found.");
      if (i.qty > it.qty - it.returnedQty) throw new AppError("VALIDATION", `You can return at most ${it.qty - it.returnedQty} of "${it.description}".`);
      return { it, qty: i.qty, amount: D(it.lineTotal).dividedBy(it.qty).times(i.qty) };
    });
    if (lines.length === 0) throw new AppError("VALIDATION", "Enter a quantity to return.");
    const amount = D(money(lines.reduce((a, l) => a.plus(l.amount), D(0))));
    const due = D(bill.total).minus(D(bill.paid)).minus(D(bill.returned));
    const reduceDue = amount.lessThan(due) ? amount : due;
    const toAdvance = amount.minus(reduceDue);
    const ret = await tx.purchaseReturn.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "purchase_return"), billId, supplierId: bill.supplierId, date: asDate(r.date),
        amount: money(amount), reduceDue: money(reduceDue), toAdvance: money(toAdvance), reason: r.reason, createdBy: ctx.userId,
        items: { create: lines.map((l) => ({ tenantId: ctx.tenantId, billItemId: l.it.id, qty: l.qty, amount: money(l.amount) })) },
      },
    });
    for (const l of lines) {
      await tx.purchaseBillItem.update({ where: { id: l.it.id }, data: { returnedQty: { increment: l.qty } } });
      await stockOut(tx, ctx, { variantId: l.it.variantId, warehouseId: bill.warehouseId, qty: l.qty, type: "purchase_return", sourceType: "purchase_return", sourceId: ret.id, reference: ret.number, notes: r.reason.slice(0, 200) }, l.it.description);
    }
    const returned = D(bill.returned).plus(reduceDue);
    await tx.purchaseBill.update({ where: { id: billId }, data: { returned: money(returned), paymentStatus: paymentStatus(bill.total, bill.paid, returned) } });
    if (toAdvance.greaterThan(0)) await tx.supplier.update({ where: { id: bill.supplierId }, data: { advanceBalance: { increment: money(toAdvance) } } });
    await audit(tx, ctx, "purchase_return.created", "purchase_return", ret.id, undefined, { number: ret.number, bill: bill.number, amount: money(amount) });
    return ret;
  });
}

export async function listPurchaseReturns(ctx: Ctx) {
  authorize(ctx, "purchase.view", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.purchaseReturn.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { bill: { select: { number: true } }, supplier: { select: { name: true } } } }));
}
