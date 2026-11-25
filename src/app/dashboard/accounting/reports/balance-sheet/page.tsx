import { requireAccounting } from "@/server/next/accounting";
import { balanceSheet } from "@/server/services/accounting/reports";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { DateFilter, ReportNav, validDate, ymd } from "../nav";

export const metadata = { title: "Balance sheet" };

function Side({ title, s, extra }: { title: string; s: { items: { id: string; code: string; name: string; amount: string }[]; total: string }; extra?: [string, string] }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-slate-100 px-5 py-3 font-bold">{title}</h2>
      <table className="w-full"><tbody className="divide-y divide-slate-100">
        {s.items.map((i) => <tr key={i.id}><td className="td">{i.code} · {i.name}</td><td className="td text-right">{formatBDT(i.amount)}</td></tr>)}
        {extra && <tr><td className="td italic">{extra[0]}</td><td className="td text-right">{formatBDT(extra[1])}</td></tr>}
      </tbody></table>
    </section>
  );
}

export default async function BS({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const { ctx } = await requireAccounting();
  const asOf = validDate((await searchParams).asOf, ymd(new Date()));
  const bs = await balanceSheet(ctx, asOf);
  return (
    <>
      <PageHeader title="Balance sheet" subtitle={`${ctx.tenant?.name} · as of ${asOf}`} />
      <ReportNav active="balance-sheet"><DateFilter fields={[{ name: "asOf", label: "As of", value: asOf }]} /></ReportNav>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4"><Side title="Assets" s={bs.assets} /><div className="card flex justify-between p-4 text-base font-extrabold"><span>Total assets</span><span>{formatBDT(bs.assets.total)}</span></div></div>
        <div className="space-y-4">
          <Side title="Liabilities" s={bs.liabilities} />
          <Side title="Equity" s={bs.equity} extra={["Current earnings (profit to date)", bs.currentEarnings]} />
          <div className="card flex justify-between p-4 text-base font-extrabold"><span>Total liabilities & equity {bs.balanced ? <span className="ml-2 badge bg-emerald-100 text-emerald-700">Balanced</span> : <span className="ml-2 badge bg-rose-100 text-rose-700">Out of balance</span>}</span><span>{formatBDT(bs.totalLiabilitiesAndEquity)}</span></div>
        </div>
      </div>
    </>
  );
}
