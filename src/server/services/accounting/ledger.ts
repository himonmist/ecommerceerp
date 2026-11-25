import "server-only";
import Decimal from "decimal.js";
import { withTenant, type Tx } from "@/server/db/tenant";
import { AppError } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { seedAccounts } from "./coa";

type Amount = Decimal | string | number | { toString(): string };
export type LineIn = { key?: string; accountId?: string; debit?: Amount; credit?: Amount; partyType?: "customer" | "supplier"; partyId?: string | null; memo?: string };
export type Actor = { tenantId: string; userId?: string | null };
export type Entry = { date: Date; description: string; reference?: string | null; sourceType: string; sourceId: string; lines: LineIn[]; voucherType?: string; status?: string; number?: string };

const D = (v: Amount | undefined) => new Decimal(v == null || v === "" ? 0 : v.toString());
const round = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function tenantLockKey(tx: Tx, tenantId: string, exclusive: boolean) {
  const fn = exclusive ? "pg_advisory_xact_lock" : "pg_advisory_xact_lock_shared";
  await tx.$queryRawUnsafe(`SELECT ${fn}(hashtext($1))::text`, `ledger:${tenantId}`); // fn is one of two constants
}

/** Ledger settings for the tenant, or null if accounting is not set up (postings are then skipped). */
export async function activeLedger(tx: Tx, tenantId: string) {
  await tenantLockKey(tx, tenantId, false);
  return tx.ledgerSettings.findUnique({ where: { tenantId } });
}

export function assertOpenPeriod(lockedThrough: Date | null | undefined, date: Date) {
  if (lockedThrough && ymd(date) <= ymd(lockedThrough)) {
    throw new AppError("PERIOD_LOCKED", `The books are closed through ${ymd(lockedThrough)}. Use a later date or reopen the period.`);
  }
}

/** Resolve system keys to account ids for this tenant. */
export async function accountIds(tx: Tx, keys: string[]) {
  const rows = await tx.account.findMany({ where: { systemKey: { in: [...new Set(keys)] } }, select: { id: true, systemKey: true } });
  return new Map(rows.map((r) => [r.systemKey!, r.id]));
}

/**
 * Post a balanced journal inside the caller's transaction. Lines may carry negative amounts
 * (they flip side) and zero lines are dropped. Returns null when accounting is not active.
 */
export async function post(tx: Tx, actor: Actor, e: Entry) {
  const settings = await activeLedger(tx, actor.tenantId);
  if (!settings) return null;
  if (e.status !== "draft") assertOpenPeriod(settings.lockedThrough, e.date);
  const ids = await accountIds(tx, e.lines.flatMap((l) => (l.key ? [l.key] : [])));
  const lines = e.lines.map((l) => {
    const accountId = l.accountId ?? ids.get(l.key!);
    if (!accountId) throw new Error(`Account not found for ${l.key}`);
    let debit = round(D(l.debit));
    let credit = round(D(l.credit));
    if (debit.isNegative()) { credit = credit.plus(debit.abs()); debit = new Decimal(0); }
    if (credit.isNegative()) { debit = debit.plus(credit.abs()); credit = new Decimal(0); }
    const net = debit.minus(credit);
    return { accountId, debit: net.isPositive() ? net : new Decimal(0), credit: net.isNegative() ? net.abs() : new Decimal(0), partyType: l.partyType ?? null, partyId: l.partyId ?? null, memo: l.memo ?? null };
  }).filter((l) => !l.debit.isZero() || !l.credit.isZero());
  const dr = lines.reduce((a, l) => a.plus(l.debit), new Decimal(0));
  const cr = lines.reduce((a, l) => a.plus(l.credit), new Decimal(0));
  if (lines.length === 0 || dr.isZero()) return null; // nothing to post
  if (!dr.equals(cr)) throw new AppError("VALIDATION", `Debits (${dr.toFixed(2)}) must equal credits (${cr.toFixed(2)}).`);
  return tx.journal.create({
    data: {
      tenantId: actor.tenantId, number: e.number ?? await nextNumber(tx, actor.tenantId, "journal"), voucherType: e.voucherType ?? "SYS",
      date: e.date, description: e.description.slice(0, 300), reference: e.reference ?? null, sourceType: e.sourceType, sourceId: e.sourceId,
      status: e.status ?? "approved", amount: dr.toFixed(2), createdBy: actor.userId ?? null,
      lines: { create: lines.map((l) => ({ tenantId: actor.tenantId, accountId: l.accountId, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), partyType: l.partyType, partyId: l.partyId, memo: l.memo })) },
    },
  });
}

/** Post the exact mirror of a journal and mark the original cancelled. */
export async function reverseJournal(tx: Tx, actor: Actor, journalId: string, reason: string, date = new Date()) {
  const settings = await activeLedger(tx, actor.tenantId);
  if (!settings) return null;
  assertOpenPeriod(settings.lockedThrough, date);
  const orig = await tx.journal.findUniqueOrThrow({ where: { id: journalId }, include: { lines: true } });
  if (orig.reversedById || orig.status === "cancelled") throw new AppError("VALIDATION", "This entry has already been reversed.");
  const rev = await tx.journal.create({
    data: {
      tenantId: actor.tenantId, number: await nextNumber(tx, actor.tenantId, "journal"), voucherType: orig.voucherType === "SYS" ? "SYS" : orig.voucherType,
      date, description: `Reversal of ${orig.number}: ${reason}`.slice(0, 300), reference: orig.number, sourceType: orig.sourceType, sourceId: orig.sourceId,
      status: "approved", amount: orig.amount, reversesJournalId: orig.id, createdBy: actor.userId ?? null,
      lines: { create: orig.lines.map((l) => ({ tenantId: actor.tenantId, accountId: l.accountId, debit: l.credit, credit: l.debit, partyType: l.partyType, partyId: l.partyId, memo: l.memo })) },
    },
  });
  await tx.journal.update({ where: { id: orig.id }, data: { status: "cancelled", reversedById: rev.id, cancelReason: reason.slice(0, 300) } });
  return rev;
}

/** Reverse every live posting for a business document (void / cancel). */
export async function reverseSource(tx: Tx, actor: Actor, sourceType: string, sourceId: string, reason: string) {
  if (!(await activeLedger(tx, actor.tenantId))) return;
  const live = await tx.journal.findMany({ where: { sourceType, sourceId, status: { in: ["approved", "verified"] }, reversedById: null, reversesJournalId: null } });
  for (const j of live) await reverseJournal(tx, actor, j.id, reason);
}

export async function ledgerStatus(ctx: Ctx) {
  authorize(ctx, "accounting.view", { write: false });
  const s = await withTenant(ctx.tenantId, (tx) => tx.ledgerSettings.findUnique({ where: { tenantId: ctx.tenantId } }));
  return { active: !!s, startedAt: s?.startedAt ?? null, lockedThrough: s?.lockedThrough ?? null };
}

/** New stores: chart of accounts + settings, no opening entry. */
export async function seedLedger(tx: Tx, tenantId: string) {
  await seedAccounts(tx, tenantId);
  await tx.ledgerSettings.create({ data: { tenantId } });
}

/**
 * Start accounting for a store that already has data: seed the chart of accounts and
 * post one opening-balance journal from current stock, receivables, payables and advances.
 */
export async function initializeLedger(ctx: Ctx) {
  authorize(ctx, "accounting.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    await tenantLockKey(tx, ctx.tenantId, true);
    if (await tx.ledgerSettings.findUnique({ where: { tenantId: ctx.tenantId } })) throw new AppError("VALIDATION", "Accounting is already set up for this store.");
    await seedAccounts(tx, ctx.tenantId);
    await tx.ledgerSettings.create({ data: { tenantId: ctx.tenantId } });

    const [inv] = await tx.$queryRaw<{ v: string | null }[]>`
      SELECT sum(sl.on_hand * pv.cost_price)::text AS v FROM stock_levels sl JOIN product_variants pv ON pv.id = sl.variant_id`;
    const customers = await tx.customer.findMany({ select: { id: true, openingDue: true, advanceBalance: true } });
    const custDue = await tx.$queryRaw<{ id: string | null; due: string }[]>`
      SELECT customer_id AS id, sum(total - paid - returned)::text AS due FROM sales_invoices WHERE status = 'posted' GROUP BY customer_id`;
    const suppliers = await tx.supplier.findMany({ select: { id: true, openingDue: true, advanceBalance: true } });
    const supDue = await tx.$queryRaw<{ id: string; due: string }[]>`
      SELECT supplier_id AS id, sum(total - paid - returned)::text AS due FROM purchase_bills WHERE status = 'posted' GROUP BY supplier_id`;
    const [grni] = await tx.$queryRaw<{ v: string | null }[]>`
      SELECT sum(gi.qty * gi.unit_cost)::text AS v FROM goods_receipt_items gi JOIN goods_receipts g ON g.id = gi.grn_id WHERE g.bill_id IS NULL`;

    const lines: LineIn[] = [{ key: "inventory", debit: D(inv?.v ?? 0), memo: "Stock on hand at cost" }];
    const dueBy = new Map(custDue.map((r) => [r.id, D(r.due)]));
    for (const c of customers) {
      lines.push({ key: "ar", debit: D(c.openingDue).plus(dueBy.get(c.id) ?? 0), partyType: "customer", partyId: c.id });
      lines.push({ key: "customer_advance", credit: D(c.advanceBalance), partyType: "customer", partyId: c.id });
    }
    lines.push({ key: "ar", debit: dueBy.get(null) ?? 0, memo: "Walk-in" });
    const supBy = new Map(supDue.map((r) => [r.id, D(r.due)]));
    for (const s of suppliers) {
      lines.push({ key: "ap", credit: D(s.openingDue).plus(supBy.get(s.id) ?? 0), partyType: "supplier", partyId: s.id });
      lines.push({ key: "supplier_advance", debit: D(s.advanceBalance), partyType: "supplier", partyId: s.id });
    }
    lines.push({ key: "grni", credit: D(grni?.v ?? 0) });
    const net = lines.reduce((a, l) => a.plus(D(l.debit)).minus(D(l.credit)), new Decimal(0));
    lines.push({ key: "opening_equity", credit: net, memo: "Balancing figure" });
    const j = await post(tx, ctx, { date: new Date(), description: "Opening balances when accounting started", sourceType: "ledger_opening", sourceId: ctx.tenantId, lines });
    await audit(tx, ctx, "ledger.initialized", "ledger", ctx.tenantId, undefined, { opening: j?.number ?? null });
    return j;
  });
}
