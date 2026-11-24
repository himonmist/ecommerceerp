import Link from "next/link";
import type { StorefrontProduct } from "@/server/services/storefront";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";

export function ProductCard({ p, base }: { p: StorefrontProduct; base: string }) {
  const v = p.variants[0];
  const available = p.variants.reduce((a, x) => a + x.available, 0);
  return (
    <Link href={`${base}/p/${p.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
        {p.image ? <img src={p.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          : <div className="grid h-full place-items-center text-slate-300"><Icon.box className="h-14 w-14" /></div>}
        {available === 0 ? <span className="absolute left-3 top-3 badge bg-slate-900/80 text-white">Sold out</span>
          : available <= 5 ? <span className="absolute left-3 top-3 badge bg-rose-600 text-white">Only {available} left</span> : null}
        {v?.compareAt && Number(v.compareAt) > Number(v.price) && <span className="absolute right-3 top-3 badge bg-emerald-600 text-white">Sale</span>}
      </div>
      <div className="mt-3">
        {p.category && <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{p.category.name}</p>}
        <h3 className="mt-0.5 line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700">{p.name}</h3>
        {v && <p className="mt-1 flex items-baseline gap-2"><span className="font-bold text-slate-900">{formatBDT(v.price)}</span>
          {v.compareAt && Number(v.compareAt) > Number(v.price) && <span className="text-sm text-slate-400 line-through">{formatBDT(v.compareAt)}</span>}</p>}
      </div>
    </Link>
  );
}
