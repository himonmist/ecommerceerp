import { requireAccounting } from "@/server/next/accounting";
import { vatSummary } from "@/server/services/accounting/reports";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { ReportNav } from "../nav";

export const metadata = { title: "VAT summary" };
const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function VAT({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { ctx } = await requireAccounting();
  const y = Number((await searchParams).year);
  const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : new Date().getFullYear();
  const v = await vatSummary(ctx, year);
  return (
    <>
      <PageHeader title="VAT summary (Mushak 6.3 working)" subtitle={`${ctx.tenant?.name} · ${year} · output VAT on sales minus input VAT on purchases`} />
      <ReportNav active="vat"><form className="flex items-end gap-2"><input name="year" type="number" min={2000} max={2099} defaultValue={year} className="input w-28 py-1.5" aria-label="Year" /><button className="btn-secondary">Apply</button></form></ReportNav>
      <section className="card max-w-3xl overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">Month</th><th className="th text-right">Output VAT</th><th className="th text-right">Input VAT</th><th className="th text-right">Net payable</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{v.months.map((m) => <tr key={m.month}><td className="td">{M[m.month - 1]}</td><td className="td text-right">{formatBDT(m.output)}</td><td className="td text-right">{formatBDT(m.input)}</td><td className={`td text-right font-semibold ${Number(m.net) < 0 ? "text-emerald-700" : ""}`}>{formatBDT(m.net)}</td></tr>)}</tbody>
          <tfoot className="border-t-2 border-slate-200"><tr><td className="td font-bold">Year</td><td className="td text-right font-bold">{formatBDT(v.totals.output)}</td><td className="td text-right font-bold">{formatBDT(v.totals.input)}</td><td className="td text-right font-bold">{formatBDT(v.totals.net)}</td></tr></tfoot>
        </table>
      </section>
    </>
  );
}
