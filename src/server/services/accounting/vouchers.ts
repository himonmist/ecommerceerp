import "server-only";
import { randomUUID } from "node:crypto";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { voucherSchema } from "@/lib/validation-erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { activeLedger, assertOpenPeriod, post, reverseJournal, type LineIn } from "./ledger";
import type { z } from "zod";

const LABEL = { CV: "Income / receipt voucher", DV: "Expense / payment voucher", JV: "Journal voucher", TM: "Transfer" } as const;
export const VOUCHER_TYPES = Object.keys(LABEL) as (keyof typeof LABEL)[];
export { LABEL as VOUCHER_LABEL };

/** Manual vouchers: CV (money in), DV (money out), TM (between money accounts), JV (free-form, must balance). */
export async function createVoucher(ctx: Ctx, raw: z.input<typeof voucherSchema>) {
  authorize(ctx, "accounting.manage");
  const p = voucherSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const v = p.data;
  return withTenant(ctx.tenantId, async (tx) => {
    if (!(await activeLedger(tx, ctx.tenantId))) throw new AppError("VALIDATION", "Set up accounting first.");
    const ids = v.type === "TM" ? [v.fromAccountId, v.toAccountId] : v.type === "JV" ? v.lines.map((l) => l.accountId) : [v.moneyAccountId, ...v.lines.map((l) => l.accountId)];
    const accounts = await tx.account.findMany({ where: { id: { in: [...new Set(ids)] }, isActive: true } });
    if (accounts.length !== new Set(ids).size) throw new AppError("NOT_FOUND", "One or more accounts were not found or are inactive.");
    const isMoney = (id: string) => !!accounts.find((a) => a.id === id)?.kind;
    let lines: LineIn[];
    if (v.type === "CV" || v.type === "DV") {
      if (!isMoney(v.moneyAccountId)) throw new AppError("VALIDATION", "Choose a cash, bank or wallet account.", { moneyAccountId: "Money account required" });
      const total = v.lines.reduce((s, l) => s + Number(l.amount), 0).toFixed(2);
      lines = v.type === "CV"
        ? [{ accountId: v.moneyAccountId, debit: total }, ...v.lines.map((l) => ({ accountId: l.accountId, credit: l.amount, memo: l.memo }))]
        : [...v.lines.map((l) => ({ accountId: l.accountId, debit: l.amount, memo: l.memo })), { accountId: v.moneyAccountId, credit: total }];
    } else if (v.type === "TM") {
      if (v.fromAccountId === v.toAccountId || !isMoney(v.fromAccountId) || !isMoney(v.toAccountId)) throw new AppError("VALIDATION", "Transfer between two different cash, bank or wallet accounts.");
      lines = [{ accountId: v.toAccountId, debit: v.amount }, { accountId: v.fromAccountId, credit: v.amount }];
    } else {
      lines = v.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo }));
    }
    const j = await post(tx, ctx, {
      date: new Date(v.date), description: v.description, reference: v.reference, sourceType: "voucher", sourceId: randomUUID(),
      lines, voucherType: v.type, status: v.status, number: await nextNumber(tx, ctx.tenantId, v.type),
    });
    if (!j) throw new AppError("VALIDATION", "Enter at least one amount.");
    await audit(tx, ctx, "voucher.created", "journal", j.id, undefined, { number: j.number, status: j.status, amount: j.amount.toString() });
    return j;
  });
}

async function load(ctxTenant: string, id: string) {
  return withTenant(ctxTenant, async (tx) => {
    const j = await tx.journal.findUnique({ where: { id } });
    if (!j) throw new AppError("NOT_FOUND", "Entry not found.");
    return j;
  });
}

export async function approveVoucher(ctx: Ctx, id: string) {
  authorize(ctx, "accounting.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    const j = await tx.journal.findUnique({ where: { id } });
    if (!j) throw new AppError("NOT_FOUND", "Entry not found.");
    if (j.status !== "draft") throw new AppError("VALIDATION", "Only drafts can be approved.");
    assertOpenPeriod((await activeLedger(tx, ctx.tenantId))?.lockedThrough, j.date);
    const updated = await tx.journal.update({ where: { id }, data: { status: "approved" } });
    await audit(tx, ctx, "voucher.approved", "journal", id, { status: "draft" }, { status: "approved" });
    return updated;
  });
}

export async function verifyVoucher(ctx: Ctx, id: string) {
  authorize(ctx, "accounting.verify");
  return withTenant(ctx.tenantId, async (tx) => {
    const j = await tx.journal.findUnique({ where: { id } });
    if (!j) throw new AppError("NOT_FOUND", "Entry not found.");
    if (j.status !== "approved") throw new AppError("VALIDATION", "Only approved entries can be verified.");
    const updated = await tx.journal.update({ where: { id }, data: { status: "verified", verifiedBy: ctx.userId, verifiedAt: new Date() } });
    await audit(tx, ctx, "voucher.verified", "journal", id, { status: "approved" }, { status: "verified" });
    return updated;
  });
}

/** Drafts are voided; posted vouchers are reversed with a mirror entry dated today. System postings are reversed only by voiding their document. */
export async function cancelVoucher(ctx: Ctx, id: string, reason: string) {
  authorize(ctx, "accounting.manage");
  const j = await load(ctx.tenantId, id);
  if (j.voucherType === "SYS") throw new AppError("VALIDATION", "Automatic postings are reversed by voiding or returning their source document.");
  if (j.reversesJournalId) throw new AppError("VALIDATION", "A reversal can't be cancelled.");
  return withTenant(ctx.tenantId, async (tx) => {
    if (j.status === "draft") {
      const updated = await tx.journal.update({ where: { id }, data: { status: "void", cancelReason: reason.slice(0, 300) } });
      await audit(tx, ctx, "voucher.voided", "journal", id, { status: "draft" }, { status: "void" });
      return updated;
    }
    if (!["approved", "verified"].includes(j.status)) throw new AppError("VALIDATION", "This entry is already cancelled.");
    const rev = await reverseJournal(tx, ctx, id, reason || "Cancelled");
    await audit(tx, ctx, "voucher.cancelled", "journal", id, { status: j.status }, { status: "cancelled", reversal: rev?.number });
    return rev;
  });
}

export async function getJournal(ctx: Ctx, id: string) {
  authorize(ctx, "accounting.view", { write: false });
  const j = await withTenant(ctx.tenantId, (tx) => tx.journal.findUnique({ where: { id }, include: { lines: { include: { account: true } } } }));
  if (!j) throw new AppError("NOT_FOUND", "Entry not found.");
  return j;
}

export async function listJournals(ctx: Ctx, opts: { type?: string; status?: string; q?: string; page?: number } = {}) {
  authorize(ctx, "accounting.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = {
    ...(opts.type && ["CV", "DV", "JV", "TM", "SYS"].includes(opts.type) ? { voucherType: opts.type } : {}),
    ...(opts.status && ["draft", "approved", "verified", "cancelled", "void"].includes(opts.status) ? { status: opts.status } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }, { reference: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.journal.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 30, take: 30 });
    const total = await tx.journal.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 30)) };
  });
}
