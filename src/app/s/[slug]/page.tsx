import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefront, listStorefrontProducts } from "@/server/services/storefront";
import { ProductCard } from "./product-card";

export default async function StoreHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string; q?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sf = await getStorefront(slug);
  if (!sf) notFound();
  const products = await listStorefrontProducts(sf.tenant.id, { category: sp.category?.slice(0, 80), q: sp.q });
  const base = `/s/${sf.tenant.slug}`;
  const active = sf.categories.find((c) => c.slug === sp.category);
  return (
    <>
      {!sp.category && !sp.q && (
        <section className="relative isolate overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 text-white">
          <div className="absolute inset-0 -z-10 grid-bg opacity-30" />
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-100">Welcome to</p>
            <h1 className="mt-2 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">{sf.tenant.name}</h1>
            <p className="mt-4 max-w-xl text-brand-50">{sf.tenant.tagline ?? "Discover our latest collection — fast delivery and cash on delivery across Bangladesh."}</p>
            <a href="#shop" className="mt-8 inline-flex rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-700 shadow-lg hover:bg-brand-50">Shop now</a>
          </div>
        </section>
      )}
      <section id="shop" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-tight">{active ? active.name : sp.q ? `Results for “${sp.q.slice(0, 50)}”` : "All products"}</h2>
          <form role="search" className="flex gap-2">
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            <input name="q" defaultValue={sp.q} placeholder="Search products" maxLength={100} className="input w-56" aria-label="Search products" />
          </form>
        </div>
        {sf.categories.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={base} className={`rounded-full px-4 py-1.5 text-sm font-medium ${!sp.category ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>All</Link>
            {sf.categories.map((c) => (
              <Link key={c.id} href={`${base}?category=${c.slug}`} className={`rounded-full px-4 py-1.5 text-sm font-medium ${sp.category === c.slug ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{c.name}</Link>
            ))}
          </div>
        )}
        {products.length === 0 ? (
          <p className="mt-16 text-center text-slate-500">No products here yet — check back soon.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} p={p} base={base} />)}
          </div>
        )}
      </section>
    </>
  );
}
