"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "../cart-context";
import { checkoutAction } from "../actions";
import { ActionForm, Field, FormError, Submit } from "@/components/form";
import { formatBDT } from "@/lib/money";

type Zone = { id: string; name: string; charge: string; eta: string | null };

export function Checkout({ slug, zones }: { slug: string; zones: Zone[] }) {
  const { lines, setQty, clear, ready } = useCart();
  const [state, action] = useActionState(checkoutAction.bind(null, slug), undefined);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const zone = zones.find((z) => z.id === zoneId);
  const subtotal = useMemo(() => lines.reduce((a, l) => a + Number(l.price) * l.qty, 0), [lines]);
  const f = state?.fields ?? {};
  const base = `/s/${slug}`;

  if (!ready) return <p className="py-20 text-center text-slate-500">Loading your cart…</p>;
  if (lines.length === 0) return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-extrabold">Your cart is empty</h1>
      <Link href={base} className="btn-primary mt-6">Continue shopping</Link>
    </div>
  );
  return (
    <div className="grid gap-10 lg:grid-cols-5">
      <section className="lg:col-span-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Your cart</h1>
        <ul className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {lines.map((l) => (
            <li key={l.variantId} className="flex items-center gap-4 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">{l.image && <img src={l.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <Link href={`${base}/p/${l.productSlug}`} className="font-semibold text-slate-900 hover:underline">{l.name}</Link>
                <p className="text-xs text-slate-500">{l.title}</p>
                <p className="mt-1 text-sm font-semibold">{formatBDT(l.price)}</p>
              </div>
              <div className="flex items-center rounded-xl border border-slate-200">
                <button type="button" className="px-3 py-1.5" aria-label={`Decrease ${l.name}`} onClick={() => setQty(l.variantId, l.qty - 1)}>−</button>
                <span className="w-8 text-center text-sm" aria-live="polite">{l.qty}</span>
                <button type="button" className="px-3 py-1.5" aria-label={`Increase ${l.name}`} onClick={() => setQty(l.variantId, l.qty + 1)}>+</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-ghost mt-3 text-sm" onClick={clear}>Clear cart</button>
      </section>

      <section className="lg:col-span-2">
        <ActionForm action={action} state={state} className="card space-y-4 p-6" noValidate>
          <h2 className="text-lg font-bold">Delivery details</h2>
          <FormError message={state?.error} />
          <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ variantId: l.variantId, qty: l.qty })))} />
          <Field label="Full name" name="name" autoComplete="name" required maxLength={100} error={f.name} />
          <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="01XXXXXXXXX" required error={f.phone} />
          <Field label="Email (optional)" name="email" type="email" autoComplete="email" error={f.email} />
          <div>
            <label htmlFor="address" className="label">Full address</label>
            <textarea id="address" name="address" rows={3} required maxLength={400} className="input" aria-invalid={!!f.address} placeholder="House, road, area, district" />
            {f.address && <p className="mt-1.5 text-xs font-medium text-rose-600">{f.address}</p>}
          </div>
          <div>
            <label htmlFor="zoneId" className="label">Delivery area</label>
            <select id="zoneId" name="zoneId" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="input">
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {formatBDT(z.charge)}{z.eta ? ` (${z.eta})` : ""}</option>)}
            </select>
          </div>
          <Field label="Coupon code" name="couponCode" maxLength={32} error={f.couponCode} />
          <Field label="Order note (optional)" name="notes" maxLength={500} />
          <dl className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatBDT(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd>{formatBDT(zone?.charge ?? 0)}</dd></div>
            <div className="flex justify-between pt-1 text-base font-bold"><dt>Estimated total</dt><dd>{formatBDT(subtotal + Number(zone?.charge ?? 0))}</dd></div>
            <p className="text-xs text-slate-400">Final total, stock and discounts are confirmed securely when you place the order.</p>
          </dl>
          <Submit pendingText="Placing order…">Place order · Cash on delivery</Submit>
        </ActionForm>
      </section>
    </div>
  );
}
