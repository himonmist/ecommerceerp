import "server-only";
import { postBill, postSupplierPayment } from "../accounting/posting";
import { withTenant, type Tx } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { billFromGrnSchema, directBillSchema } from "@/lib/validation-erp";
import { paymentStatus } from "@/lib/erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, buildLines, defaultWarehouseId, loadVariants, money, stockIn } from "./common";
import type { z } from "zod";

async function recordBillPayments(tx: Tx, ctx: Ctx, bill: { id: string; number: string; supplierId: string }, date: Date, payments: { method: string; amount: string; reference?: string }[]) {
  for (const p of payments) {
    const pay = await tx.supplierPayment.create({
      data: { tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "supplier_payment"), supplierId: bill.supplierId, date, method: p.method,
        reference: p.reference ?? null, amount: p.amount, createdBy: ctx.userId, notes: `Paid with ${bill.number}`,
        allocations: { create: [{ tenantId: ctx.tenantId, billId: bill.id, amount: p.amount }] } },
    });
    await postSupplierPayment(tx, ctx, pay.id);
  }
}

/** Direct vendor bill (stock in): stock rises immediately at the line's net unit cost. */
export async function createDirectBill(ctx: Ctx, raw: z.input<typeof directBillSchema>) {
  authorize(ctx, "purchase.manage");
  const p = directBillSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const b = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    if (!(await tx.supplier.findUnique({ where: { id: b.supplierId } }))) throw new AppError("NOT_FOUND", "Supplier not found.");
    const variants = await loadVariants(tx, b.items.map((i) => i.variantId));
    const { doc, rows } = buildLines(b.items, variants, b);
    const paid = b.payments.reduce((a, x) => a.plus(D(x.amount)), D(0));
    if (paid.greaterThan(D(doc.total))) throw new AppError("VALIDATION", "Payments are more than the bill total.", { payments: "Too much" });
    const warehouseId = await defaultWarehouseId(tx);
    const number = await nextNumber(tx, ctx.tenantId, "bill");
    const bill = await tx.purchaseBill.create({
      data: {
        tenantId: ctx.tenantId, number, supplierBillNo: b.supplierBillNo ?? null, supplierId: b.supplierId, warehouseId,
        billDate: asDate(b.billDate), dueDate: b.dueDate ? asDate(b.dueDate) : null, subtotal: doc.subtotal, vatTotal: doc.vatTotal,
        discount: doc.discount, additionalCharge: doc.additionalCharge, total: doc.total, paid: money(paid), paymentStatus: paymentStatus(doc.total, paid),
        notes: b.notes ?? null, createdBy: ctx.userId,
        items: { create: rows.map((r) => ({ tenantId: ctx.tenantId, variantId: r.variantId, description: r.description, qty: r.qty, unitCost: r.unitPrice, discount: r.discount, vatPct: r.vatPct, lineTotal: r.lineTotal })) },
      },
    });
    for (const r of rows) {
      await stockIn(tx, ctx, { variantId: r.variantId, warehouseId, qty: r.qty, type: "purchase", sourceType: "purchase_bill", sourceId: bill.id, reference: number, unitCost: D(r.net).dividedBy(r.qty) });
    }
    await postBill(tx, ctx, bill.id);
    await recordBillPayments(tx, ctx, bill, asDate(b.billDate), b.payments);
    await audit(tx, ctx, "bill.created", "purchase_bill", bill.id, undefined, { number, total: doc.total, direct: true });
    return bill;
  });
}

/** Bill a goods receipt at the PO's prices. Stock was already received, so it is not touched. */
export async function createBillFromGrn(ctx: Ctx, grnId: string, raw: z.input<typeof billFromGrnSchema>) {
  authorize(ctx, "purchase.manage");
  const p = billFromGrnSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const b = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM goods_receipts WHERE id = ${grnId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new AppError("NOT_FOUND", "Goods receipt not found.");
    const grn = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: grnId }, include: { items: true, po: { include: { items: true } } } });
    if (grn.billId) throw new AppError("VALIDATION", "This goods receipt has already been billed.");
    const lines = grn.items.map((gi) => {
      const pi = grn.po.items.find((x) => x.id === gi.poItemId)!;
      return { variantId: gi.variantId, qty: gi.qty, unitPrice: pi.unitCost.toString(), discount: money(D(pi.discount).times(gi.qty).dividedBy(pi.qty)), vatPct: pi.vatPct.toString() };
    });
    const variants = await loadVariants(tx, lines.map((l) => l.variantId));
    const { doc, rows: built } = buildLines(lines, variants, b);
    const bill = await tx.purchaseBill.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "bill"), supplierBillNo: b.supplierBillNo ?? null, supplierId: grn.supplierId,
        warehouseId: grn.po.warehouseId, grnId: grn.id, billDate: asDate(b.billDate), dueDate: b.dueDate ? asDate(b.dueDate) : null,
        subtotal: doc.subtotal, vatTotal: doc.vatTotal, discount: doc.discount, additionalCharge: doc.additionalCharge, total: doc.total, createdBy: ctx.userId,
        items: { create: built.map((r) => ({ tenantId: ctx.tenantId, variantId: r.variantId, description: r.description, qty: r.qty, unitCost: r.unitPrice, discount: r.discount, vatPct: r.vatPct, lineTotal: r.lineTotal })) },
      },
    });
    await tx.goodsReceipt.update({ where: { id: grnId }, data: { billId: bill.id } });
    await postBill(tx, ctx, bill.id);
    await audit(tx, ctx, "bill.created", "purchase_bill", bill.id, undefined, { number: bill.number, grn: grn.number, total: doc.total });
    return bill;
  });
}

export async function getBill(ctx: Ctx, id: string) {
  authorize(ctx, "purchase.view", { write: false });
  const bill = await withTenant(ctx.tenantId, (tx) => tx.purchaseBill.findUnique({
    where: { id }, include: { items: true, supplier: true, allocations: { include: { payment: true }, where: { payment: { status: "posted" } } }, returns: true },
  }));
  if (!bill) throw new AppError("NOT_FOUND", "Bill not found.");
  return bill;
}

export async function listBills(ctx: Ctx, opts: { status?: string; q?: string; page?: number } = {}) {
  authorize(ctx, "purchase.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = {
    ...(opts.status && ["unpaid", "partial", "paid"].includes(opts.status) ? { status: "posted", paymentStatus: opts.status } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" as const } }, { supplierBillNo: { contains: q, mode: "insensitive" as const } }, { supplier: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
  };
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.purchaseBill.findMany({ where, orderBy: [{ billDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { supplier: { select: { name: true } } } });
    const total = await tx.purchaseBill.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}
