import Link from "next/link";
import { requireAccounting } from "@/server/next/accounting";
import { listAccounts } from "@/server/services/accounting/accounts";
import { generalLedger } from "@/server/services/accounting/reports";
import { load } from "@/server/next/erp";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { ReportNav, validDate, ymd } from "../nav";

export const metadata = { title: "General ledger" };

export default async function GL({ searchParams }: { searchParams: Promise<{ account?: string; from?: string; to?: string }> }) {
  const { ctx } = await requireAccounting();
  const sp = await searchParams;
  const accounts = await listAccounts(ctx);
  const now = new Date();
  const from = validDate(sp.from, ymd(new Date(now.getFullYear(), 0, 1)));
  const to = validDate(sp.to, ymd(now));
  const accountId = sp.account ?? accounts.find((a) => a.systemKey === "cash")?.id ?? accounts[0]!.id;
  const gl = await load(accountId, () => generalLedger(ctx, accountId, { from, to }));
  return (
    <>
      <PageHeader title={`General ledger — ${gl.account.code} ${gl.account.name}`} subtitle={`${from} to ${to}`} />
      <ReportNav active="general-ledger">
        <form className="flex flex-wrap items-end gap-2">
          <select name="account" defaultValue={accountId} className="input w-64 py-1.5" aria-label="Account">{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
          <input type="date" name="from" defaultValue={from} className="input w-40 py-1.5" aria-label="From" />
          <input type="date" name="to" defaultValue={to} className="input w-40 py-1.5" aria-label="To" />
          <button className="btn-secondary">Apply</button>
        </form>
      </ReportNav>
      <section className="card overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Entry</th><th className="th">Description</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th><th className="th text-right">Balance</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50"><td className="td" colSpan={5}>Opening balance</td><td className="td text-right font-semibold">{formatBDT(gl.opening)}</td></tr>
            {gl.rows.map((r, i) => <tr key={i}><td className="td">{ymd(r.date)}</td><td className="td font-mono"><Link className="text-brand-700 hover:underline" href={`/dashboard/accounting/journals/${r.journalId}`}>{r.number}</Link></td><td className="td">{r.description}{r.memo ? <span className="text-slate-400"> · {r.memo}</span> : null}</td><td className="td text-right">{r.debit !== "0.00" ? formatBDT(r.debit) : ""}</td><td className="td text-right">{r.credit !== "0.00" ? formatBDT(r.credit) : ""}</td><td className="td text-right font-semibold">{formatBDT(r.balance)}</td></tr>)}
            <tr className="bg-slate-50"><td className="td font-bold" colSpan={5}>Closing balance</td><td className="td text-right font-bold">{formatBDT(gl.closing)}</td></tr>
          </tbody></table>
      </section>
    </>
  );
}
