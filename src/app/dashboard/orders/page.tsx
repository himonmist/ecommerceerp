import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { listOrders } from "@/server/services/orders";
import { formatBDT } from "@/lib/money";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";
import { Empty, PageHeader, Pagination, StatusBadge, fmtDate } from "@/components/ui";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const data = await listOrders(ctx, { status: sp.status, q: sp.q, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Orders" subtitle={`${data.total} order${data.total === 1 ? "" : "s"}`} />
      <form className="mb-5 flex flex-wrap gap-3" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search order #, name or phone" className="input max-w-xs" maxLength={100} aria-label="Search orders" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[200px]" aria-label="Filter by status">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty title="No orders found" body="Try a different search, or share your storefront to get your first order." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100"><tr><th className="th">Order</th><th className="th">Customer</th><th className="th">Phone</th><th className="th">Items</th><th className="th">Total</th><th className="th">Payment</th><th className="th">Status</th><th className="th">Placed</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="td font-mono font-semibold"><Link href={`/dashboard/orders/${o.id}`} className="text-brand-700 hover:underline">{o.number}</Link></td>
                  <td className="td">{o.shippingName}</td>
                  <td className="td font-mono text-slate-500">{o.shippingPhone}</td>
                  <td className="td">{o._count.items}</td>
                  <td className="td font-semibold">{formatBDT(o.total)}</td>
                  <td className="td"><StatusBadge status={o.paymentStatus} /></td>
                  <td className="td"><StatusBadge status={o.status} /></td>
                  <td className="td text-slate-500">{fmtDate(o.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} pages={data.pages} base="/dashboard/orders" params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
