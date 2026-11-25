import "server-only";
import Decimal from "decimal.js";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { cashMovementSchema, closeShiftSchema, openShiftSchema, posSaleSchema, registerSchema } from "@/lib/validation-erp";
import { computeDocument } from "@/lib/erp";
import { audit } from "./audit";
import { nextNumber } from "./sequences";
import { createInvoiceTx } from "./erp/invoices";
import { loadVariants } from "./erp/common";
import { post } from "./accounting/ledger";
import type { z } from "zod";

const D = (v: { toString(): string } | string | number | null | undefined) => new Decimal(v == null ? 0 : v.toString());
const f = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

export async function createRegister(ctx: Ctx, raw: z.input<typeof registerSchema>) {
  authorize(ctx, "pos.manage");
  const p = registerSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      if (!(await tx.warehouse.findUnique({ where: { id: p.data.warehouseId } }))) throw new AppError("NOT_FOUND", "Location not found.");
      const r = await tx.posRegister.create({ data: { tenantId: ctx.tenantId, name: p.data.name, warehouseId: p.data.warehouseId } });
      await audit(tx, ctx, "register.created", "pos_register", r.id, undefined, { name: r.name });
      return r;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A register with that name already exists.");
    throw e;
  }
}

export async function listRegisters(ctx: Ctx) {
  authorize(ctx, "pos.use", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const regs = await tx.posRegister.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { shifts: { where: { status: "open" }, take: 1 } } });
    const locs = new Map((await tx.warehouse.findMany()).map((w) => [w.id, w.name]));
    return regs.map((r) => ({ id: r.id, name: r.name, warehouseId: r.warehouseId, location: locs.get(r.warehouseId) ?? "—", openShift: r.shifts[0] ?? null }));
  });
}

export async function currentShift(ctx: Ctx, registerId: string) {
  authorize(ctx, "pos.use", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.posShift.findFirst({ where: { registerId, status: "open" } }));
}

export async function openShift(ctx: Ctx, registerId: string, raw: z.input<typeof openShiftSchema>) {
  authorize(ctx, "pos.use");
  const p = openShiftSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      const reg = await tx.posRegister.findUnique({ where: { id: registerId } });
      if (!reg || !reg.isActive) throw new AppError("NOT_FOUND", "Register not found.");
      const sh = await tx.posShift.create({ data: { tenantId: ctx.tenantId, number: await nextNumber(tx, ctx.tenantId, "shift"), registerId, openingFloat: p.data.openingFloat, openedBy: ctx.userId } });
      await audit(tx, ctx, "shift.opened", "pos_shift", sh.id, undefined, { number: sh.number, float: p.data.openingFloat });
      return sh;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "This register already has an open shift.");
    throw e;
  }
}

async function openShiftOrThrow(tx: Parameters<Parameters<typeof withTenant>[1]>[0], shiftId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM pos_shifts WHERE id = ${shiftId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new AppError("NOT_FOUND", "Shift not found.");
  const sh = await tx.posShift.findUniqueOrThrow({ where: { id: shiftId }, include: { register: true } });
  if (sh.status !== "open") throw new AppError("VALIDATION", "This shift is closed. Open a new shift to keep selling.");
  return sh;
}

/**
 * Counter sale. Prices come from the catalogue (offline/POS price), stock leaves the register's location,
 * and tenders must cover the total. Cash may be over-tendered (change is returned); other methods may not.
 */
export async function posSale(ctx: Ctx, shiftId: string, raw: z.input<typeof posSaleSchema>) {
  authorize(ctx, "pos.use");
  const p = posSaleSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const s = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    const sh = await openShiftOrThrow(tx, shiftId);
    const variants = await loadVariants(tx, s.items.map((i) => i.variantId));
    const items = s.items.map((i) => {
      const v = variants.get(i.variantId)!;
      return { variantId: i.variantId, qty: i.qty, unitPrice: (v.offlinePrice ?? v.onlinePrice).toString(), discount: i.discount };
    });
    let doc;
    try { doc = computeDocument(items, { discount: s.discount }); } catch (e) { throw new AppError("VALIDATION", (e as Error).message); }
    const total = D(doc.total);

    let advance = new Decimal(0);
    if (s.customerId) {
      const c = await tx.customer.findUnique({ where: { id: s.customerId } });
      if (!c) throw new AppError("NOT_FOUND", "Customer not found.");
      if (s.useAdvance) advance = Decimal.min(D(c.advanceBalance), total);
    }
    const nonCash = s.tenders.filter((t) => t.method !== "cash");
    const nonCashSum = nonCash.reduce((a, t) => a.plus(D(t.amount)), new Decimal(0));
    const cashTendered = s.tenders.filter((t) => t.method === "cash").reduce((a, t) => a.plus(D(t.amount)), new Decimal(0));
    const dueAfterAdvance = total.minus(advance);
    if (nonCashSum.greaterThan(dueAfterAdvance)) throw new AppError("VALIDATION", "Card and wallet payments can't be more than the amount due.");
    const cashApplied = dueAfterAdvance.minus(nonCashSum);
    if (cashTendered.lessThan(cashApplied)) throw new AppError("VALIDATION", `Payment is short by ৳${f(cashApplied.minus(cashTendered))}.`);
    const change = cashTendered.minus(cashApplied);

    const payments = [
      ...nonCash.filter((t) => D(t.amount).greaterThan(0)).map((t) => ({ method: t.method, amount: f(D(t.amount)), reference: t.reference })),
      ...(cashApplied.greaterThan(0) ? [{ method: "cash" as const, amount: f(cashApplied), reference: undefined }] : []),
    ];
    const invoice = await createInvoiceTx(tx, ctx, {
      customerId: s.customerId, walkInName: s.customerId ? undefined : "Walk-in customer", invoiceDate: new Date(), dueDate: undefined,
      items, payments, useAdvance: advance.greaterThan(0), notes: `POS ${sh.register.name} · ${sh.number}`, discount: s.discount, additionalCharge: undefined,
      warehouseId: sh.register.warehouseId, channel: "pos", shiftId: sh.id,
    });
    return { invoice, change: f(change) };
  });
}

/** Drawer cash expected now: float + cash sales + pay-ins − drops − pay-outs. */
async function expectedCashTx(tx: Parameters<Parameters<typeof withTenant>[1]>[0], sh: { id: string; openingFloat: { toString(): string } }) {
  const [cash] = await tx.$queryRaw<{ v: string | null }[]>`
    SELECT sum(ra.amount)::text AS v FROM receipt_allocations ra
    JOIN customer_receipts r ON r.id = ra.receipt_id AND r.status = 'posted' AND r.method = 'cash'
    JOIN sales_invoices i ON i.id = ra.invoice_id AND i.shift_id = ${sh.id}::uuid`;
  const moves = await tx.posCashMovement.findMany({ where: { shiftId: sh.id } });
  const m = (t: string) => moves.filter((x) => x.type === t).reduce((a, x) => a.plus(D(x.amount)), new Decimal(0));
  return D(sh.openingFloat).plus(D(cash?.v)).plus(m("pay_in")).minus(m("cash_drop")).minus(m("pay_out"));
}

/** Cash drop (to bank/safe), pay-in (float top-up from owner) or pay-out (petty expense), each posted to the ledger. */
export async function recordCashMovement(ctx: Ctx, shiftId: string, raw: z.input<typeof cashMovementSchema>) {
  authorize(ctx, "pos.use");
  const p = cashMovementSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const mv = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    const sh = await openShiftOrThrow(tx, shiftId);
    if (mv.type !== "pay_in" && D(mv.amount).greaterThan(await expectedCashTx(tx, sh))) throw new AppError("VALIDATION", "There isn't that much cash in the drawer.");
    const row = await tx.posCashMovement.create({ data: { tenantId: ctx.tenantId, shiftId, type: mv.type, amount: mv.amount, reason: mv.reason, createdBy: ctx.userId } });
    const lines = mv.type === "cash_drop" ? [{ key: "bank", debit: mv.amount }, { key: "cash", credit: mv.amount }]
      : mv.type === "pay_out" ? [{ key: "misc_expense", debit: mv.amount, memo: mv.reason }, { key: "cash", credit: mv.amount }]
      : [{ key: "cash", debit: mv.amount }, { key: "capital", credit: mv.amount, memo: mv.reason }];
    await post(tx, ctx, { date: new Date(), description: `${sh.register.name} ${sh.number}: ${mv.type.replace("_", " ")} — ${mv.reason}`, sourceType: "pos_cash_movement", sourceId: row.id, lines });
    await audit(tx, ctx, `shift.${mv.type}`, "pos_shift", shiftId, undefined, { amount: mv.amount, reason: mv.reason });
    return row;
  });
}

/** Close the shift with a physical cash count; any difference is booked to Cash Over / Short. */
export async function closeShift(ctx: Ctx, shiftId: string, raw: z.input<typeof closeShiftSchema>) {
  authorize(ctx, "pos.use");
  const p = closeShiftSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  return withTenant(ctx.tenantId, async (tx) => {
    const sh = await openShiftOrThrow(tx, shiftId);
    const expected = await expectedCashTx(tx, sh);
    const variance = D(p.data.countedCash).minus(expected);
    const closed = await tx.posShift.update({
      where: { id: shiftId },
      data: { status: "closed", expectedCash: f(expected), countedCash: p.data.countedCash, variance: f(variance), closedBy: ctx.userId, closedAt: new Date(), notes: p.data.notes ?? null },
    });
    if (!variance.isZero()) {
      await post(tx, ctx, { date: new Date(), description: `${sh.register.name} ${sh.number}: cash ${variance.isPositive() ? "over" : "short"} at close`, sourceType: "pos_shift", sourceId: sh.id,
        lines: [{ key: "cash", debit: variance }, { key: "cash_short", credit: variance }] });
    }
    await audit(tx, ctx, "shift.closed", "pos_shift", shiftId, { status: "open" }, { status: "closed", expected: f(expected), counted: p.data.countedCash, variance: f(variance) });
    return closed;
  });
}

/** Z-report: sales by tender, cash movements, expected vs counted. */
export async function shiftSummary(ctx: Ctx, shiftId: string) {
  authorize(ctx, "pos.use", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const shift = await tx.posShift.findUnique({ where: { id: shiftId }, include: { register: true, movements: { orderBy: { createdAt: "asc" } } } });
    if (!shift) throw new AppError("NOT_FOUND", "Shift not found.");
    const invoices = await tx.salesInvoice.findMany({ where: { shiftId, status: "posted" }, orderBy: { createdAt: "asc" } });
    const byMethodRows = await tx.$queryRaw<{ method: string; v: string }[]>`
      SELECT r.method, sum(ra.amount)::text AS v FROM receipt_allocations ra
      JOIN customer_receipts r ON r.id = ra.receipt_id AND r.status = 'posted'
      JOIN sales_invoices i ON i.id = ra.invoice_id AND i.shift_id = ${shiftId}::uuid GROUP BY r.method`;
    const byMethod = Object.fromEntries(byMethodRows.map((r) => [r.method, f(D(r.v))]));
    const gross = invoices.reduce((a, i) => a.plus(D(i.total)), new Decimal(0));
    const expected = shift.status === "open" ? await expectedCashTx(tx, shift) : D(shift.expectedCash);
    return { shift, invoices, salesCount: invoices.length, grossSales: f(gross), byMethod, expectedCash: f(expected) };
  });
}

export async function listShifts(ctx: Ctx, registerId?: string) {
  authorize(ctx, "pos.use", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.posShift.findMany({ where: registerId ? { registerId } : {}, orderBy: { openedAt: "desc" }, take: 50, include: { register: { select: { name: true } } } }));
}

/** Products for the register screen with POS price and availability at the register's location. */
export async function posCatalog(ctx: Ctx, registerId: string) {
  authorize(ctx, "pos.use", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const reg = await tx.posRegister.findUnique({ where: { id: registerId } });
    if (!reg) throw new AppError("NOT_FOUND", "Register not found.");
    const rows = await tx.productVariant.findMany({
      where: { product: { status: "active", channel: { in: ["omni", "offline"] } } },
      include: { product: { select: { name: true, category: { select: { name: true } }, images: { take: 1 } } }, stockLevels: { where: { warehouseId: reg.warehouseId } } },
      orderBy: { product: { name: "asc" } }, take: 3000,
    });
    return rows.map((v) => ({
      id: v.id, label: v.title === "Default" ? v.product.name : `${v.product.name} · ${v.title}`, sku: v.sku ?? "", barcode: v.barcode ?? "",
      price: (v.offlinePrice ?? v.onlinePrice).toString(), category: v.product.category?.name ?? "Other", image: v.product.images[0]?.url ?? null,
      available: v.stockLevels.reduce((a, l) => a + l.onHand - l.reserved, 0),
    }));
  });
}
export type PosItem = Awaited<ReturnType<typeof posCatalog>>[number];
