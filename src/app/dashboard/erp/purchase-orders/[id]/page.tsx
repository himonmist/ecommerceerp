import Link from "next/link";
import { load, requireErp, ymd } from "@/server/next/erp";
import { getPurchaseOrder } from "@/server/services/erp/purchase-orders";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/ui";
import { FormSuccess } from "@/components/form";
import { BillGrnForm, PrintButton, ReceiveForm } from "../../forms";
import { billFromGrnAction, cancelPurchaseOrderAction, receiveGoodsAction } from "../../actions";

export const metadata = { title: "Purchase order" };

export default async function POPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ received?: string }> }) {
  const ctx = await requireErp();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const po = await load(id, () => getPurchaseOrder(ctx, id));
  const canManage = hasPermission(ctx.permissions, "purchase.manage") && !ctx.readOnly;
  const receivable = ["issued", "partially_received"].includes(po.status);
  return (
    <>
      <Link href="/dashboard/erp/purchase-orders" className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← Purchase orders</Link>
      <PageHeader title={`Purchase order ${po.number}`} subtitle={`${ymd(po.orderDate)} · ${po.supplier.name}`} action={<div className="flex items-center gap-2"><StatusBadge status={po.status} /><PrintButton /></div>} />
      {sp.received && <div className="mb-6 print:hidden"><FormSuccess message="Goods received — stock updated." /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <table className="w-full"><thead><tr><th className="th">Item</th><th className="th text-right">Ordered</th><th className="th text-right">Received</th><th className="th text-right">Unit cost</th><th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{po.items.map((i) => <tr key={i.id}><td className="td">{i.description}</td><td className="td text-right">{i.qty}</td><td className="td text-right">{i.receivedQty}</td><td className="td text-right">{formatBDT(i.unitCost)}</td><td className="td text-right font-semibold">{formatBDT(i.lineTotal)}</td></tr>)}</tbody></table>
            <div className="flex justify-between border-t border-slate-100 px-5 py-4 font-bold"><span>Total</span><span>{formatBDT(po.total)}</span></div>
          </section>
          <section className="card p-5 print:hidden">
            <h2 className="font-bold">Goods receipts (GRN)</h2>
            <ul className="mt-3 space-y-4">
              {po.receipts.map((g) => (
                <li key={g.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                  <div className="flex items-center justify-between"><span className="font-mono font-semibold">{g.number}</span><span>{ymd(g.receivedDate)} · {g.items.reduce((a, x) => a + x.qty, 0)} units</span>
                    {g.billId ? <Link className="text-brand-600 hover:underline" href={`/dashboard/erp/bills/${g.billId}`}>View bill</Link> : <span className="badge bg-amber-100 text-amber-800">Not billed</span>}</div>
                  {!g.billId && canManage && <div className="mt-3"><BillGrnForm action={billFromGrnAction.bind(null, g.id)} /></div>}
                </li>
              ))}
              {po.receipts.length === 0 && <li className="text-sm text-slate-500">Nothing received yet.</li>}
            </ul>
          </section>
        </div>
        {canManage && receivable && (
          <div className="space-y-6 print:hidden">
            <section className="card p-5"><h2 className="mb-3 font-bold">Receive goods</h2><ReceiveForm action={receiveGoodsAction.bind(null, po.id)} items={po.items.map((i) => ({ id: i.id, description: i.description, remaining: i.qty - i.receivedQty }))} /></section>
            {po.status === "issued" && <form action={cancelPurchaseOrderAction.bind(null, po.id)}><button className="btn-secondary w-full text-rose-700">Cancel purchase order</button></form>}
          </div>
        )}
      </div>
    </>
  );
}
