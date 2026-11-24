import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefront } from "@/server/services/storefront";
import { Icon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { CartCount, CartProvider } from "./cart-context";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const sf = await getStorefront((await params).slug);
  return sf ? { title: { default: sf.tenant.name, template: `%s · ${sf.tenant.name}` }, description: sf.tenant.tagline ?? `Shop ${sf.tenant.name} online.` } : {};
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sf = await getStorefront(slug);
  if (!sf) notFound();
  const base = `/s/${sf.tenant.slug}`;
  return (
    <CartProvider slug={sf.tenant.slug}>
      <div className="flex min-h-screen flex-col bg-white">
        {sf.tenant.announcement && <div className="bg-ink-950 px-4 py-2 text-center text-xs font-medium text-white">{sf.tenant.announcement}</div>}
        <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href={base} className="text-xl font-extrabold tracking-tight text-slate-900">{sf.tenant.name}</Link>
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              <Link href={base} className="hover:text-slate-900">Shop</Link>
              {sf.categories.slice(0, 5).map((c) => <Link key={c.id} href={`${base}?category=${c.slug}`} className="hover:text-slate-900">{c.name}</Link>)}
            </nav>
            <Link href={`${base}/cart`} className="relative rounded-full p-2 text-slate-700 hover:bg-slate-100" aria-label="Cart">
              <Icon.cart className="h-6 w-6" /><CartCount />
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mt-16 border-t border-slate-100 bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm sm:grid-cols-2 sm:px-6">
            <div>
              <p className="font-bold text-slate-900">{sf.tenant.name}</p>
              {sf.tenant.contactEmail && <p className="mt-2 text-slate-600">{sf.tenant.contactEmail}</p>}
              {sf.tenant.contactPhone && <p className="text-slate-600">{sf.tenant.contactPhone}</p>}
            </div>
            <div className="flex items-end justify-start gap-2 text-xs text-slate-500 sm:justify-end">
              <LogoMark className="h-5 w-5" /> Powered by <Link href="/" className="font-semibold text-slate-700 hover:underline">Link Vision Commerce</Link>
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
