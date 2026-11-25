import Link from "next/link";
import { requireErp, ymd } from "@/server/next/erp";
import { listPurchaseOrders, listUnbilledReceipts } from "@/server/services/erp/purchase-orders";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { Empty, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const metadata = { title: "Purchase orders" };

export default async function PurchaseOrders({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const data = await listPurchaseOrders(ctx, { status: sp.status, page: Number(sp.page) || 1 });
  const unbilled = await listUnbilledReceipts(ctx);
  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Order → receive goods (GRN) → bill." action={<Link href="/dashboard/erp/purchase-orders/new" className="btn-primary"><Icon.plus className="h-4 w-4" />Issue purchase order</Link>} />
      {unbilled.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">{unbilled.length} goods receipt{unbilled.length === 1 ? "" : "s"} waiting to be billed</p>
          <ul className="mt-2 space-y-1">{unbilled.slice(0, 5).map((g) => <li key={g.id}><Link className="font-mono text-amber-900 underline" href={`/dashboard/erp/purchase-orders/${g.poId}`}>{g.number}</Link> · {g.supplier.name} · {g.po.number}</li>)}</ul>
        </div>
      )}
      {data.items.length === 0 ? <Empty title="No purchase orders" body="Issue a purchase order to a supplier, then receive the goods against it." /> : (
        <div className="card overflow-x-auto"><table className="w-full">
          <thead className="border-b border-slate-100"><tr><th className="th">PO</th><th className="th">Supplier</th><th className="th">Date</th><th className="th">Expected</th><th className="th text-right">Total</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((p) => <tr key={p.id} className="hover:bg-slate-50"><td className="td font-mono font-semibold"><Link className="text-brand-700 hover:underline" href={`/dashboard/erp/purchase-orders/${p.id}`}>{p.number}</Link></td><td className="td">{p.supplier.name}</td><td className="td">{ymd(p.orderDate)}</td><td className="td">{ymd(p.expectedDate)}</td><td className="td text-right font-semibold">{formatBDT(p.total)}</td><td className="td"><StatusBadge status={p.status} /></td></tr>)}
          </tbody></table></div>
      )}
      <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/purchase-orders" params={{ status: sp.status }} />
    </>
  );
}
