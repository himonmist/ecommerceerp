import "server-only";
import { postGoodsReceipt } from "../accounting/posting";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { grnSchema, purchaseOrderSchema } from "@/lib/validation-erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, asDate, buildLines, defaultWarehouseId, loadVariants, lockIds, stockIn } from "./common";
import type { z } from "zod";

export async function createPurchaseOrder(ctx: Ctx, raw: z.input<typeof purchaseOrderSchema>) {
  authorize(ctx, "purchase.manage");
  const p = purchaseOrderSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const o = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    if (!(await tx.supplier.findUnique({ where: { id: o.supplierId } }))) throw new AppError("NOT_FOUND", "Supplier not found.");
    const variants = await loadVariants(tx, o.items.map((i) => i.variantId));
    const { doc, rows } = buildLines(o.items, variants, o);
    const po = await tx.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "purchase_order"), supplierId: o.supplierId, warehouseId: await defaultWarehouseId(tx),
        orderDate: asDate(o.orderDate), expectedDate: o.expectedDate ? asDate(o.expectedDate) : null, subtotal: doc.subtotal, vatTotal: doc.vatTotal,
        discount: doc.discount, additionalCharge: doc.additionalCharge, total: doc.total, terms: o.terms ?? null, createdBy: ctx.userId,
        items: { create: rows.map((r) => ({ tenantId: ctx.tenantId, variantId: r.variantId, description: r.description, qty: r.qty, unitCost: r.unitPrice, discount: r.discount, vatPct: r.vatPct, lineTotal: r.lineTotal })) },
      },
    });
    await audit(tx, ctx, "purchase_order.created", "purchase_order", po.id, undefined, { number: po.number, total: doc.total });
    return po;
  });
}

export async function getPurchaseOrder(ctx: Ctx, id: string) {
  authorize(ctx, "purchase.view", { write: false });
  const po = await withTenant(ctx.tenantId, (tx) => tx.purchaseOrder.findUnique({ where: { id }, include: { items: true, supplier: true, receipts: { include: { items: true }, orderBy: { createdAt: "asc" } } } }));
  if (!po) throw new AppError("NOT_FOUND", "Purchase order not found.");
  return po;
}

export async function listPurchaseOrders(ctx: Ctx, opts: { status?: string; page?: number } = {}) {
  authorize(ctx, "purchase.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const where = opts.status && ["issued", "partially_received", "received", "cancelled"].includes(opts.status) ? { status: opts.status } : {};
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.purchaseOrder.findMany({ where, orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { supplier: { select: { name: true } } } });
    const total = await tx.purchaseOrder.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}

/** Goods receipt note: stock comes in at the PO's net unit cost, which updates moving-average cost. */
export async function receiveGoods(ctx: Ctx, poId: string, raw: z.input<typeof grnSchema>) {
  authorize(ctx, "purchase.manage");
  const p = grnSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const g = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "purchase_orders", [poId]);
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
    if (!po) throw new AppError("NOT_FOUND", "Purchase order not found.");
    if (!["issued", "partially_received"].includes(po.status)) throw new AppError("VALIDATION", `This purchase order is ${po.status.replace("_", " ")}.`);
    const lines = g.items.filter((i) => i.qty > 0).map((i) => {
      const it = po.items.find((x) => x.id === i.poItemId);
      if (!it) throw new AppError("NOT_FOUND", "Purchase order line not found.");
      if (i.qty > it.qty - it.receivedQty) throw new AppError("VALIDATION", `Only ${it.qty - it.receivedQty} of "${it.description}" are still to be received.`);
      const unitNet = D(it.unitCost).times(it.qty).minus(D(it.discount)).dividedBy(it.qty);
      return { it, qty: i.qty, unitNet };
    });
    if (lines.length === 0) throw new AppError("VALIDATION", "Enter a quantity received.");
    const grn = await tx.goodsReceipt.create({
      data: { tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "grn"), poId, supplierId: po.supplierId, receivedDate: asDate(g.receivedDate),
        notes: g.notes ?? null, createdBy: ctx.userId,
        items: { create: lines.map((l) => ({ tenantId: ctx.tenantId, poItemId: l.it.id, variantId: l.it.variantId, qty: l.qty, unitCost: l.unitNet.toDecimalPlaces(2).toFixed(2) })) } },
    });
    for (const l of lines) {
      await tx.purchaseOrderItem.update({ where: { id: l.it.id }, data: { receivedQty: { increment: l.qty } } });
      await stockIn(tx, ctx, { variantId: l.it.variantId, warehouseId: po.warehouseId, qty: l.qty, type: "purchase", sourceType: "goods_receipt", sourceId: grn.id, reference: grn.number, unitCost: l.unitNet });
    }
    const after = await tx.purchaseOrderItem.findMany({ where: { poId } });
    const status = after.every((i) => i.receivedQty >= i.qty) ? "received" : "partially_received";
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status } });
    await postGoodsReceipt(tx, ctx, grn.id);
    await audit(tx, ctx, "goods_receipt.created", "goods_receipt", grn.id, undefined, { number: grn.number, po: po.number });
    return grn;
  });
}

export async function cancelPurchaseOrder(ctx: Ctx, id: string) {
  authorize(ctx, "purchase.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    await lockIds(tx, "purchase_orders", [id]);
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw new AppError("NOT_FOUND", "Purchase order not found.");
    if (po.status !== "issued" || po.items.some((i) => i.receivedQty > 0)) throw new AppError("VALIDATION", "Only purchase orders with nothing received can be cancelled.");
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
    await audit(tx, ctx, "purchase_order.cancelled", "purchase_order", id, { status: po.status }, { status: "cancelled" });
    return updated;
  });
}

export async function listUnbilledReceipts(ctx: Ctx) {
  authorize(ctx, "purchase.view", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.goodsReceipt.findMany({ where: { billId: null }, orderBy: { createdAt: "desc" }, include: { supplier: { select: { name: true } }, po: { select: { number: true } }, items: true } }));
}
