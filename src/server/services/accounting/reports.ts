import "server-only";
import Decimal from "decimal.js";
import { withTenant, type Tx } from "@/server/db/tenant";
import { AppError } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";

const f = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const FAR_PAST = "1900-01-01";
const todayStr = () => new Date().toISOString().slice(0, 10);

type Row = { id: string; code: string; name: string; nature: string; group_name: string; system_key: string | null; kind: string | null; dr: string; cr: string };

/** Per-account debit/credit totals for posted journals between two dates (inclusive). Cancelled entries count with their reversals. */
async function sums(tx: Tx, from: string, to: string) {
  return tx.$queryRaw<Row[]>`
    SELECT a.id, a.code, a.name, a.nature, a.group_name, a.system_key, a.kind,
           COALESCE(sum(l.debit) FILTER (WHERE j.id IS NOT NULL), 0)::text AS dr,
           COALESCE(sum(l.credit) FILTER (WHERE j.id IS NOT NULL), 0)::text AS cr
    FROM accounts a
    LEFT JOIN journal_lines l ON l.account_id = a.id
    LEFT JOIN journals j ON j.id = l.journal_id AND j.status IN ('approved','verified','cancelled') AND j.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY a.id ORDER BY a.code`;
}

const view = (ctx: Ctx) => authorize(ctx, "accounting.view", { write: false });

export async function balancesByKey(ctx: Ctx): Promise<Record<string, string>> {
  view(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => sums(tx, FAR_PAST, "2999-12-31"));
  return Object.fromEntries(rows.filter((r) => r.system_key).map((r) => [r.system_key!, f(new Decimal(r.dr).minus(r.cr))]));
}

export async function trialBalance(ctx: Ctx, asOf = todayStr()) {
  view(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => sums(tx, FAR_PAST, asOf));
  const lines = rows.map((r) => {
    const net = new Decimal(r.dr).minus(r.cr);
    return { id: r.id, code: r.code, name: r.name, nature: r.nature, debit: net.isPositive() ? f(net) : "0.00", credit: net.isNegative() ? f(net.abs()) : "0.00" };
  }).filter((l) => l.debit !== "0.00" || l.credit !== "0.00");
  const totalDebit = f(lines.reduce((a, l) => a.plus(l.debit), new Decimal(0)));
  const totalCredit = f(lines.reduce((a, l) => a.plus(l.credit), new Decimal(0)));
  return { asOf, lines, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function profitAndLoss(ctx: Ctx, { from, to }: { from: string; to: string }) {
  view(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => sums(tx, from, to));
  const amt = (r: Row) => (r.nature === "income" ? new Decimal(r.cr).minus(r.dr) : new Decimal(r.dr).minus(r.cr));
  const section = (pred: (r: Row) => boolean) => {
    const items = rows.filter(pred).map((r) => ({ id: r.id, code: r.code, name: r.name, amount: f(amt(r)) })).filter((i) => i.amount !== "0.00");
    return { items, total: f(items.reduce((a, i) => a.plus(i.amount), new Decimal(0))) };
  };
  const revenue = section((r) => r.nature === "income" && r.group_name === "Revenue");
  const otherIncome = section((r) => r.nature === "income" && r.group_name !== "Revenue");
  const cogs = section((r) => r.nature === "expense" && r.group_name === "Cost of Sales");
  const expenses = section((r) => r.nature === "expense" && r.group_name !== "Cost of Sales");
  const gross = new Decimal(revenue.total).minus(cogs.total);
  return {
    from, to, sections: { revenue, cogs, otherIncome, expenses },
    revenue: revenue.total, cogs: cogs.total, grossProfit: f(gross),
    netProfit: f(gross.plus(otherIncome.total).minus(expenses.total)),
  };
}

export async function balanceSheet(ctx: Ctx, asOf = todayStr()) {
  view(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => sums(tx, FAR_PAST, asOf));
  const side = (nature: string, sign: 1 | -1) => {
    const items = rows.filter((r) => r.nature === nature).map((r) => ({ id: r.id, code: r.code, name: r.name, group: r.group_name, amount: f(new Decimal(r.dr).minus(r.cr).times(sign)) })).filter((i) => i.amount !== "0.00");
    return { items, total: f(items.reduce((a, i) => a.plus(i.amount), new Decimal(0))) };
  };
  const assets = side("asset", 1);
  const liabilities = side("liability", -1);
  const equity = side("equity", -1);
  const earnings = rows.filter((r) => r.nature === "income" || r.nature === "expense").reduce((a, r) => a.plus(new Decimal(r.cr).minus(r.dr)), new Decimal(0));
  const right = new Decimal(liabilities.total).plus(equity.total).plus(earnings);
  return { asOf, assets, liabilities, equity, currentEarnings: f(earnings), totalLiabilitiesAndEquity: f(right), balanced: f(right) === assets.total };
}

export async function generalLedger(ctx: Ctx, accountId: string, { from, to }: { from: string; to: string }) {
  view(ctx);
  return withTenant(ctx.tenantId, async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError("NOT_FOUND", "Account not found.");
    const [open] = await tx.$queryRaw<{ bal: string | null }[]>`
      SELECT sum(l.debit - l.credit)::text AS bal FROM journal_lines l JOIN journals j ON j.id = l.journal_id
      WHERE l.account_id = ${accountId}::uuid AND j.status IN ('approved','verified','cancelled') AND j.date < ${from}::date`;
    const lines = await tx.journalLine.findMany({
      where: { accountId, journal: { status: { in: ["approved", "verified", "cancelled"] }, date: { gte: new Date(from), lte: new Date(to) } } },
      include: { journal: true }, orderBy: [{ journal: { date: "asc" } }, { journal: { createdAt: "asc" } }],
    });
    let bal = new Decimal(open?.bal ?? 0);
    const opening = f(bal);
    const rows = lines.map((l) => {
      bal = bal.plus(l.debit.toString()).minus(l.credit.toString());
      return { journalId: l.journalId, date: l.journal.date, number: l.journal.number, description: l.journal.description, memo: l.memo, debit: f(l.debit.toString()), credit: f(l.credit.toString()), balance: f(bal) };
    });
    return { account, from, to, opening, rows, closing: f(bal) };
  });
}

export async function vatSummary(ctx: Ctx, year: number) {
  view(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => tx.$queryRaw<{ m: number; key: string; amt: string }[]>`
    SELECT extract(month FROM j.date)::int AS m, a.system_key AS key, sum(l.credit - l.debit)::text AS amt
    FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
    WHERE a.system_key IN ('vat_out','vat_in') AND j.status IN ('approved','verified','cancelled') AND extract(year FROM j.date) = ${year}
    GROUP BY 1, 2`);
  const months = Array.from({ length: 12 }, (_, i) => {
    const out = new Decimal(rows.find((r) => r.m === i + 1 && r.key === "vat_out")?.amt ?? 0);
    const inp = new Decimal(rows.find((r) => r.m === i + 1 && r.key === "vat_in")?.amt ?? 0).negated();
    return { month: i + 1, output: f(out), input: f(inp), net: f(out.minus(inp)) };
  });
  const sum = (k: "output" | "input" | "net") => f(months.reduce((a, m) => a.plus(m[k]), new Decimal(0)));
  return { year, months, totals: { output: sum("output"), input: sum("input"), net: sum("net") } };
}

export async function dayBook(ctx: Ctx, date: string) {
  view(ctx);
  const journals = await withTenant(ctx.tenantId, (tx) => tx.journal.findMany({
    where: { date: new Date(date), status: { in: ["approved", "verified", "cancelled"] } }, include: { lines: { include: { account: true } } }, orderBy: { createdAt: "asc" },
  }));
  return { date, journals };
}

export async function cashBook(ctx: Ctx) {
  view(ctx);
  const rows = await withTenant(ctx.tenantId, (tx) => sums(tx, FAR_PAST, "2999-12-31"));
  return rows.filter((r) => r.kind).map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind, systemKey: r.system_key, balance: f(new Decimal(r.dr).minus(r.cr)) }));
}
