import { requireAccounting } from "@/server/next/accounting";
import { profitAndLoss } from "@/server/services/accounting/reports";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { DateFilter, ReportNav, validDate, ymd } from "../nav";

export const metadata = { title: "Profit & loss" };

function Section({ title, s }: { title: string; s: { items: { id: string; code: string; name: string; amount: string }[]; total: string } }) {
  return (
    <>
      <tr className="bg-slate-50"><td className="td font-bold" colSpan={2}>{title}</td></tr>
      {s.items.map((i) => <tr key={i.id}><td className="td pl-8">{i.code} · {i.name}</td><td className="td text-right">{formatBDT(i.amount)}</td></tr>)}
      <tr><td className="td pl-8 font-semibold">Total {title.toLowerCase()}</td><td className="td text-right font-semibold">{formatBDT(s.total)}</td></tr>
    </>
  );
}

export default async function PL({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { ctx } = await requireAccounting();
  const sp = await searchParams;
  const now = new Date();
  const from = validDate(sp.from, ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const to = validDate(sp.to, ymd(now));
  const pl = await profitAndLoss(ctx, { from, to });
  return (
    <>
      <PageHeader title="Profit & loss" subtitle={`${ctx.tenant?.name} · ${from} to ${to}`} />
      <ReportNav active="profit-loss"><DateFilter fields={[{ name: "from", label: "From", value: from }, { name: "to", label: "To", value: to }]} /></ReportNav>
      <section className="card max-w-3xl overflow-x-auto">
        <table className="w-full"><tbody className="divide-y divide-slate-100">
          <Section title="Revenue" s={pl.sections.revenue} />
          <Section title="Cost of sales" s={pl.sections.cogs} />
          <tr className="bg-brand-50"><td className="td font-bold">Gross profit</td><td className="td text-right font-bold">{formatBDT(pl.grossProfit)}</td></tr>
          <Section title="Other income" s={pl.sections.otherIncome} />
          <Section title="Operating expenses" s={pl.sections.expenses} />
          <tr className="bg-ink-950 text-white"><td className="px-4 py-3 text-base font-extrabold">Net profit</td><td className="px-4 py-3 text-right text-base font-extrabold" data-testid="net-profit">{formatBDT(pl.netProfit)}</td></tr>
        </tbody></table>
      </section>
    </>
  );
}
