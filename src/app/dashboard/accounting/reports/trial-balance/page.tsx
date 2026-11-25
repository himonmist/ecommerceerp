import Link from "next/link";
import { requireAccounting } from "@/server/next/accounting";
import { trialBalance } from "@/server/services/accounting/reports";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { DateFilter, ReportNav, validDate, ymd } from "../nav";

export const metadata = { title: "Trial balance" };

export default async function TB({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const { ctx } = await requireAccounting();
  const asOf = validDate((await searchParams).asOf, ymd(new Date()));
  const tb = await trialBalance(ctx, asOf);
  return (
    <>
      <PageHeader title="Trial balance" subtitle={`${ctx.tenant?.name} · as of ${asOf}`} />
      <ReportNav active="trial-balance"><DateFilter fields={[{ name: "asOf", label: "As of", value: asOf }]} /></ReportNav>
      <section className="card overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">Code</th><th className="th">Account</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{tb.lines.map((l) => <tr key={l.id}><td className="td font-mono text-slate-500">{l.code}</td><td className="td"><Link className="hover:text-brand-700" href={`/dashboard/accounting/reports/general-ledger?account=${l.id}`}>{l.name}</Link></td><td className="td text-right">{l.debit !== "0.00" ? formatBDT(l.debit) : ""}</td><td className="td text-right">{l.credit !== "0.00" ? formatBDT(l.credit) : ""}</td></tr>)}</tbody>
          <tfoot className="border-t-2 border-slate-200"><tr><td className="td font-bold" colSpan={2}>Total {tb.balanced ? <span className="ml-2 badge bg-emerald-100 text-emerald-700">Balanced</span> : <span className="ml-2 badge bg-rose-100 text-rose-700">Out of balance</span>}</td><td className="td text-right font-bold">{formatBDT(tb.totalDebit)}</td><td className="td text-right font-bold">{formatBDT(tb.totalCredit)}</td></tr></tfoot>
        </table>
      </section>
    </>
  );
}
