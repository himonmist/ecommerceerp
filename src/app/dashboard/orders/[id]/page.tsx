import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { getOrder } from "@/server/services/orders";
import { AppError } from "@/server/errors";
import { formatBDT } from "@/lib/money";
import { STATUS_LABEL, isOrderStatus, nextStatuses } from "@/lib/order-status";
import { hasPermission } from "@/server/security/permissions";
import { PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { TransitionForm } from "./transition-form";

export const metadata = { title: "Order" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const order = await getOrder(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const canManage = hasPermission(ctx.permissions, "orders.manage") && !ctx.readOnly;
  return (
    <>
      <Link href="/dashboard/orders" className="text-sm font-medium text-slate-500 hover:text-slate-900">← All orders</Link>
      <PageHeader title={`Order ${order.number}`} subtitle={`Placed ${fmtDate(order.placedAt)}`}
        action={<div className="flex gap-2"><StatusBadge status={order.paymentStatus} /><StatusBadge status={order.status} /></div>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card overflow-hidden">
            <h2 className="border-b border-slate-100 px-5 py-4 font-bold">Items</h2>
            <table className="w-full">
              <thead><tr><th className="th">Product</th><th className="th">Qty</th><th className="th">Unit</th><th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((i) => (
                  <tr key={i.id}><td className="td"><span className="font-medium text-slate-900">{i.name}</span><span className="block text-xs text-slate-500">{i.variantTitle}</span></td>
                    <td className="td">{i.qty}</td><td className="td">{formatBDT(i.unitPrice)}</td><td className="td text-right font-semibold">{formatBDT(i.lineTotal)}</td></tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatBDT(order.subtotal)}</dd></div>
              {Number(order.discount) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount {order.coupon ? `(${order.coupon.code})` : ""}</dt><dd className="text-emerald-700">−{formatBDT(order.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-slate-500">Delivery ({order.shippingZone?.name ?? "—"})</dt><dd>{formatBDT(order.shippingFee)}</dd></div>
              <div className="flex justify-between pt-2 text-base font-bold"><dt>Total</dt><dd>{formatBDT(order.total)}</dd></div>
            </dl>
          </section>
          <section className="card p-5">
            <h2 className="font-bold">Timeline</h2>
            <ol className="mt-4 space-y-4 border-l-2 border-slate-100 pl-5">
              {order.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100" />
                  <p className="text-sm font-semibold">{isOrderStatus(e.toStatus) ? STATUS_LABEL[e.toStatus] : e.toStatus}</p>
                  <p className="text-xs text-slate-500">{fmtDate(e.createdAt)}{e.note ? ` · ${e.note}` : ""}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold">Update status</h2>
            <div className="mt-4">{canManage ? <TransitionForm orderId={order.id} next={nextStatuses(order.status)} /> : <p className="text-sm text-slate-500">You can view this order but not change it.</p>}</div>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-bold">Customer & delivery</h2>
            <p className="mt-3 font-medium text-slate-900">{order.shippingName}</p>
            <p className="font-mono text-slate-600">{order.shippingPhone}</p>
            <p className="mt-2 whitespace-pre-line text-slate-600">{order.shippingAddress}</p>
            {order.notes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">“{order.notes}”</p>}
            <p className="mt-3 text-slate-500">Payment: {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod}</p>
          </section>
        </div>
      </div>
    </>
  );
}
