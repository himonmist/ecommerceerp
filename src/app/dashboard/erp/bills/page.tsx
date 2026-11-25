import Link from "next/link";
import { requireErp, ymd } from "@/server/next/erp";
import { listBills } from "@/server/services/erp/bills";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { Empty, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const metadata = { title: "Supplier bills" };

export default async function Bills({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const data = await listBills(ctx, { q: sp.q, status: sp.status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Supplier bills" subtitle={`${data.total} bill${data.total === 1 ? "" : "s"}`} action={<Link href="/dashboard/erp/bills/new" className="btn-primary"><Icon.plus className="h-4 w-4" />Direct bill (stock in)</Link>} />
      <form className="mb-4 flex flex-wrap gap-3" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Bill #, supplier bill # or supplier" className="input max-w-xs" aria-label="Search bills" maxLength={100} />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[180px]" aria-label="Payment status"><option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      {data.items.length === 0 ? <Empty title="No bills" body="Record a direct bill when stock arrives, or bill a goods receipt from a purchase order." /> : (
        <div className="card overflow-x-auto"><table className="w-full">
          <thead className="border-b border-slate-100"><tr><th className="th">Bill</th><th className="th">Supplier</th><th className="th">Date</th><th className="th text-right">Total</th><th className="th text-right">Due</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((b) => <tr key={b.id} className="hover:bg-slate-50"><td className="td font-mono font-semibold"><Link className="text-brand-700 hover:underline" href={`/dashboard/erp/bills/${b.id}`}>{b.number}</Link>{b.supplierBillNo && <span className="block text-xs text-slate-400">{b.supplierBillNo}</span>}</td><td className="td">{b.supplier.name}</td><td className="td">{ymd(b.billDate)}</td><td className="td text-right">{formatBDT(b.total)}</td><td className="td text-right font-semibold">{formatBDT(Number(b.total) - Number(b.paid) - Number(b.returned))}</td><td className="td"><StatusBadge status={b.paymentStatus} /></td></tr>)}
          </tbody></table></div>
      )}
      <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/bills" params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
