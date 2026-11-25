import Link from "next/link";
import { requireAccounting } from "@/server/next/accounting";
import { dayBook } from "@/server/services/accounting/reports";
import { formatBDT } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/ui";
import { DateFilter, ReportNav, validDate, ymd } from "../nav";

export const metadata = { title: "Day book" };

export default async function DayBook({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { ctx } = await requireAccounting();
  const date = validDate((await searchParams).date, ymd(new Date()));
  const db = await dayBook(ctx, date);
  return (
    <>
      <PageHeader title="Day book" subtitle={`${ctx.tenant?.name} · every posting on ${date}`} />
      <ReportNav active="day-book"><DateFilter fields={[{ name: "date", label: "Date", value: date }]} /></ReportNav>
      <div className="space-y-4">
        {db.journals.map((j) => (
          <section key={j.id} className="card overflow-x-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm"><span><Link className="font-mono font-semibold text-brand-700 hover:underline" href={`/dashboard/accounting/journals/${j.id}`}>{j.number}</Link> · {j.description}</span><StatusBadge status={j.status} /></div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">{j.lines.map((l) => <tr key={l.id}><td className="td">{l.account.code} · {l.account.name}</td><td className="td text-right">{Number(l.debit) ? formatBDT(l.debit) : ""}</td><td className="td text-right">{Number(l.credit) ? formatBDT(l.credit) : ""}</td></tr>)}</tbody></table>
          </section>
        ))}
        {db.journals.length === 0 && <p className="text-sm text-slate-500">Nothing posted on this day.</p>}
      </div>
    </>
  );
}
