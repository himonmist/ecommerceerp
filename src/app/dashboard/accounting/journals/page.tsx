import Link from "next/link";
import { requireAccounting } from "@/server/next/accounting";
import { listJournals } from "@/server/services/accounting/vouchers";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const metadata = { title: "Journal entries" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function Journals({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; q?: string; page?: string }> }) {
  const { ctx } = await requireAccounting();
  const sp = await searchParams;
  const data = await listJournals(ctx, { type: sp.type, status: sp.status, q: sp.q, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Journal entries" subtitle={`${data.total} entr${data.total === 1 ? "y" : "ies"} · automatic postings (SYS) and manual vouchers`} action={<Link href="/dashboard/accounting/vouchers/new?type=DV" className="btn-primary"><Icon.plus className="h-4 w-4" />New voucher</Link>} />
      <form className="mb-4 flex flex-wrap gap-3" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Number, description or reference" className="input max-w-xs" aria-label="Search entries" maxLength={100} />
        <select name="type" defaultValue={sp.type ?? ""} className="input max-w-[170px]" aria-label="Voucher type"><option value="">All types</option><option value="SYS">Automatic (SYS)</option><option value="CV">Income (CV)</option><option value="DV">Expense (DV)</option><option value="JV">Journal (JV)</option><option value="TM">Transfer (TM)</option></select>
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[170px]" aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="verified">Verified</option><option value="cancelled">Cancelled</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto"><table className="w-full">
        <thead className="border-b border-slate-100"><tr><th className="th">Number</th><th className="th">Date</th><th className="th">Type</th><th className="th">Description</th><th className="th text-right">Amount</th><th className="th">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.items.map((j) => <tr key={j.id} className="hover:bg-slate-50"><td className="td font-mono font-semibold"><Link className="text-brand-700 hover:underline" href={`/dashboard/accounting/journals/${j.id}`}>{j.number}</Link></td><td className="td">{ymd(j.date)}</td><td className="td">{j.voucherType}</td><td className="td">{j.description}</td><td className="td text-right font-semibold">{formatBDT(j.amount)}</td><td className="td"><StatusBadge status={j.status} /></td></tr>)}
          {data.items.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No entries.</td></tr>}
        </tbody></table></div>
      <Pagination page={data.page} pages={data.pages} base="/dashboard/accounting/journals" params={{ type: sp.type, status: sp.status, q: sp.q }} />
    </>
  );
}
