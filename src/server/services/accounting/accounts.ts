import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { accountSchema } from "@/lib/validation-erp";
import { audit } from "../audit";
import type { z } from "zod";

const PREFIX: Record<string, string> = { asset: "1", liability: "2", equity: "3", income: "4", expense: "6" };
const DEFAULT_GROUP: Record<string, string> = { asset: "Current Assets", liability: "Current Liabilities", equity: "Equity", income: "Other Income", expense: "Operating Expenses" };

/** Accounts with their balance (debit − credit) from posted journals. */
export async function listAccounts(ctx: Ctx) {
  authorize(ctx, "accounting.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const accounts = await tx.account.findMany({ orderBy: { code: "asc" } });
    const sums = await tx.$queryRaw<{ account_id: string; bal: string }[]>`
      SELECT l.account_id, sum(l.debit - l.credit)::text AS bal FROM journal_lines l
      JOIN journals j ON j.id = l.journal_id WHERE j.status IN ('approved','verified','cancelled') GROUP BY l.account_id`;
    const by = new Map(sums.map((s) => [s.account_id, s.bal]));
    return accounts.map((a) => ({ ...a, balance: Number(by.get(a.id) ?? 0).toFixed(2) }));
  });
}

export async function createAccount(ctx: Ctx, raw: z.input<typeof accountSchema>) {
  authorize(ctx, "accounting.manage");
  const p = accountSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const a = p.data;
  if (a.kind && a.nature !== "asset") throw new AppError("VALIDATION", "Cash, bank and wallet accounts must be assets.");
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      if (await tx.account.findFirst({ where: { name: { equals: a.name, mode: "insensitive" } } })) throw new AppError("CONFLICT", "An account with that name already exists.");
      const prefix = a.kind ? "10" : PREFIX[a.nature]!;
      const codes = (await tx.account.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })).map((c) => Number(c.code)).filter((n) => Number.isFinite(n));
      const base = Number(prefix.padEnd(4, "0"));
      let code = Math.max(base, ...codes) + 10;
      if (String(code).slice(0, prefix.length) !== prefix) code = Math.max(base, ...codes) + 1;
      const acc = await tx.account.create({ data: { tenantId: ctx.tenantId, code: String(code), name: a.name, nature: a.nature, groupName: a.groupName ?? (a.kind ? "Cash & Bank" : DEFAULT_GROUP[a.nature]!), kind: a.kind ?? null, description: a.description ?? null } });
      await audit(tx, ctx, "account.created", "account", acc.id, undefined, { code: acc.code, name: acc.name });
      return acc;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "That account code already exists.");
    throw e;
  }
}

/** Close the books through a date (inclusive), or reopen with null. */
export async function setPeriodLock(ctx: Ctx, date: string | null) {
  authorize(ctx, "accounting.verify");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("VALIDATION", "Enter a valid date.");
  if (date && date > new Date().toISOString().slice(0, 10)) throw new AppError("VALIDATION", "You can't close a period in the future.");
  return withTenant(ctx.tenantId, async (tx) => {
    const s = await tx.ledgerSettings.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!s) throw new AppError("VALIDATION", "Set up accounting first.");
    const updated = await tx.ledgerSettings.update({ where: { tenantId: ctx.tenantId }, data: { lockedThrough: date ? new Date(date) : null } });
    await audit(tx, ctx, date ? "ledger.period_closed" : "ledger.period_reopened", "ledger", ctx.tenantId, { lockedThrough: s.lockedThrough }, { lockedThrough: date });
    return updated;
  });
}
