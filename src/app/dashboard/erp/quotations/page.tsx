import Link from "next/link";
import { requireErp, ymd } from "@/server/next/erp";
import { listQuotations } from "@/server/services/erp/quotations";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { Empty, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const metadata = { title: "Quotations" };

export default async function Quotations({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const data = await listQuotations(ctx, { status: sp.status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Price quotations" subtitle="Quote first, convert to an invoice when the customer accepts." action={<Link href="/dashboard/erp/quotations/new" className="btn-primary"><Icon.plus className="h-4 w-4" />New quotation</Link>} />
      {data.items.length === 0 ? <Empty title="No quotations" body="Send price quotations to wholesale customers." /> : (
        <div className="card overflow-x-auto"><table className="w-full">
          <thead className="border-b border-slate-100"><tr><th className="th">Quote</th><th className="th">Customer</th><th className="th">Date</th><th className="th">Valid until</th><th className="th">Items</th><th className="th text-right">Total</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((q) => <tr key={q.id} className="hover:bg-slate-50"><td className="td font-mono font-semibold"><Link className="text-brand-700 hover:underline" href={`/dashboard/erp/quotations/${q.id}`}>{q.number}</Link></td><td className="td">{q.customer.name}</td><td className="td">{ymd(q.date)}</td><td className="td">{ymd(q.validUntil)}</td><td className="td">{q._count.items}</td><td className="td text-right font-semibold">{formatBDT(q.total)}</td><td className="td"><StatusBadge status={q.status} /></td></tr>)}
          </tbody></table></div>
      )}
      <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/quotations" params={{ status: sp.status }} />
    </>
  );
}
