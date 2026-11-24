import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefront, getStorefrontProduct } from "@/server/services/storefront";
import { Icon } from "@/components/icons";
import { AddToCart } from "./add-to-cart";

type P = { params: Promise<{ slug: string; productSlug: string }> };

export async function generateMetadata({ params }: P) {
  const { slug, productSlug } = await params;
  const sf = await getStorefront(slug);
  const p = sf ? await getStorefrontProduct(sf.tenant.id, productSlug.slice(0, 100)) : null;
  return p ? { title: p.name, description: p.shortDescription ?? undefined } : {};
}

export default async function ProductPage({ params }: P) {
  const { slug, productSlug } = await params;
  const sf = await getStorefront(slug);
  if (!sf) notFound();
  const p = await getStorefrontProduct(sf.tenant.id, productSlug.slice(0, 100));
  if (!p) notFound();
  const base = `/s/${sf.tenant.slug}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-slate-500"><Link href={base} className="hover:text-slate-900">Shop</Link>{p.category && <> / <Link href={`${base}?category=${p.category.slug}`} className="hover:text-slate-900">{p.category.name}</Link></>}</nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-3xl bg-slate-100">
          {p.image ? <img src={p.image} alt={p.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-300"><Icon.box className="h-24 w-24" /></div>}
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{p.name}</h1>
          {p.shortDescription && <p className="mt-3 text-lg text-slate-600">{p.shortDescription}</p>}
          <div className="mt-8"><AddToCart product={{ name: p.name, slug: p.slug, image: p.image }} variants={p.variants} base={base} /></div>
          <ul className="mt-8 space-y-2 border-t border-slate-100 pt-6 text-sm text-slate-600">
            <li className="flex items-center gap-2"><Icon.truck className="h-5 w-5 text-brand-600" />Delivery across Bangladesh · Cash on delivery</li>
            <li className="flex items-center gap-2"><Icon.shield className="h-5 w-5 text-brand-600" />Secure checkout</li>
          </ul>
          {p.description && <div className="mt-8 whitespace-pre-line border-t border-slate-100 pt-6 text-slate-700">{p.description}</div>}
        </div>
      </div>
    </div>
  );
}
