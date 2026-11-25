import Link from "next/link";
import { requireErp, ymd } from "@/server/next/erp";
import { listInvoices } from "@/server/services/erp/invoices";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { Empty, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const metadata = { title: "Sales invoices" };

export default async function Invoices({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const data = await listInvoices(ctx, { q: sp.q, status: sp.status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Sales invoices" subtitle={`${data.total} invoice${data.total === 1 ? "" : "s"}`} action={<Link href="/dashboard/erp/invoices/new" className="btn-primary"><Icon.plus className="h-4 w-4" />Direct invoice</Link>} />
      <form className="mb-4 flex flex-wrap gap-3" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Invoice # or customer" className="input max-w-xs" aria-label="Search invoices" maxLength={100} />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[180px]" aria-label="Payment status"><option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      {data.items.length === 0 ? <Empty title="No invoices" body="Create a direct invoice for walk-in or credit customers." /> : (
        <div className="card overflow-x-auto"><table className="w-full">
          <thead className="border-b border-slate-100"><tr><th className="th">Invoice</th><th className="th">Date</th><th className="th">Customer</th><th className="th text-right">Total</th><th className="th text-right">Paid</th><th className="th text-right">Due</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((i) => {
              const due = Number(i.total) - Number(i.paid) - Number(i.returned);
              return (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="td font-mono font-semibold"><Link href={`/dashboard/erp/invoices/${i.id}`} className="text-brand-700 hover:underline">{i.number}</Link></td>
                  <td className="td">{ymd(i.invoiceDate)}</td><td className="td">{i.customerName}</td>
                  <td className="td text-right">{formatBDT(i.total)}</td><td className="td text-right">{formatBDT(i.paid)}</td>
                  <td className={`td text-right font-semibold ${due > 0 && i.status === "posted" ? "text-rose-700" : ""}`}>{formatBDT(i.status === "void" ? 0 : due)}</td>
                  <td className="td"><StatusBadge status={i.status === "void" ? "void" : i.paymentStatus} /></td>
                </tr>
              );
            })}
          </tbody></table></div>
      )}
      <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/invoices" params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
