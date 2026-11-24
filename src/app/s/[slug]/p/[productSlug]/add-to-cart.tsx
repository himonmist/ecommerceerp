"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "../../cart-context";
import { formatBDT } from "@/lib/money";

type V = { id: string; title: string; price: string; compareAt: string | null; available: number };

export function AddToCart({ product, variants, base }: { product: { name: string; slug: string; image: string | null }; variants: V[]; base: string }) {
  const { add } = useCart();
  const router = useRouter();
  const [vid, setVid] = useState(variants.find((v) => v.available > 0)?.id ?? variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const v = variants.find((x) => x.id === vid);
  if (!v) return null;
  const max = Math.min(99, v.available);
  const put = (go: boolean) => {
    add({ variantId: v.id, qty, name: product.name, title: v.title, price: v.price, image: product.image, productSlug: product.slug });
    setAdded(true);
    if (go) router.push(`${base}/cart`);
  };
  return (
    <div className="space-y-6">
      <p className="flex items-baseline gap-3">
        <span className="text-3xl font-extrabold">{formatBDT(v.price)}</span>
        {v.compareAt && Number(v.compareAt) > Number(v.price) && <span className="text-lg text-slate-400 line-through">{formatBDT(v.compareAt)}</span>}
      </p>
      {variants.length > 1 && (
        <fieldset>
          <legend className="label">Option</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <button key={x.id} type="button" onClick={() => { setVid(x.id); setQty(1); }} disabled={x.available === 0} aria-pressed={x.id === vid}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${x.id === vid ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 hover:border-slate-300"}`}>{x.title}</button>
            ))}
          </div>
        </fieldset>
      )}
      <p className={`text-sm font-medium ${v.available === 0 ? "text-rose-600" : v.available <= 5 ? "text-amber-600" : "text-emerald-700"}`}>
        {v.available === 0 ? "Out of stock" : v.available <= 5 ? `Only ${v.available} left` : "In stock"}
      </p>
      {v.available > 0 && (
        <>
          <div className="flex items-center gap-3">
            <label htmlFor="qty" className="text-sm font-medium text-slate-700">Quantity</label>
            <div className="flex items-center rounded-xl border border-slate-200">
              <button type="button" className="px-3 py-2 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
              <input id="qty" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} inputMode="numeric" className="w-12 text-center outline-none" />
              <button type="button" className="px-3 py-2 text-lg" onClick={() => setQty((q) => Math.min(max, q + 1))} aria-label="Increase">+</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary px-6 py-3" onClick={() => put(false)}>{added ? "Added ✓" : "Add to cart"}</button>
            <button type="button" className="btn-primary px-6 py-3" onClick={() => put(true)}>Buy now</button>
          </div>
        </>
      )}
    </div>
  );
}
