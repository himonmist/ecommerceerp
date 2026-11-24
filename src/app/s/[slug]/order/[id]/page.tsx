import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefront } from "@/server/services/storefront";
import { withTenant } from "@/server/db/tenant";
import { formatBDT } from "@/lib/money";
import { STATUS_LABEL, isOrderStatus } from "@/lib/order-status";
import { Icon } from "@/components/icons";
import { ClearCart } from "./clear-cart";

export const metadata = { title: "Order confirmed", robots: { index: false } };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function OrderConfirmation({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const sf = await getStorefront(slug);
  if (!sf) notFound();
  const order = await withTenant(sf.tenant.id, (tx) => tx.order.findUnique({ where: { id }, include: { items: true } }));
  if (!order) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <ClearCart />
      <div className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Icon.check className="h-8 w-8" /></span>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Thank you! Your order is placed.</h1>
        <p className="mt-2 text-slate-600">Order <span className="font-mono font-semibold text-slate-900">{order.number}</span> · {isOrderStatus(order.status) ? STATUS_LABEL[order.status] : order.status}</p>
        <p className="mt-1 text-sm text-slate-500">We&apos;ll call {order.shippingPhone.replace(/^(\d{3})\d{5}/, "$1•••••")} to confirm delivery.</p>
      </div>
      <div className="card mt-10 p-6">
        <ul className="divide-y divide-slate-100 text-sm">
          {order.items.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.name} <span className="text-slate-400">· {i.variantTitle} × {i.qty}</span></span><span className="font-semibold">{formatBDT(i.lineTotal)}</span></li>)}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatBDT(order.subtotal)}</dd></div>
          {Number(order.discount) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd className="text-emerald-700">−{formatBDT(order.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd>{formatBDT(order.shippingFee)}</dd></div>
          <div className="flex justify-between pt-1 text-base font-bold"><dt>Pay on delivery</dt><dd>{formatBDT(order.total)}</dd></div>
        </dl>
      </div>
      <div className="mt-8 text-center"><Link href={`/s/${sf.tenant.slug}`} className="btn-primary">Continue shopping</Link></div>
    </div>
  );
}
