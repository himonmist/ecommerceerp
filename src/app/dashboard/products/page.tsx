import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { listProducts } from "@/server/services/catalog";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { Empty, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const data = await listProducts(ctx, { q: sp.q, status: sp.status || undefined, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Products" subtitle={`${data.total} product${data.total === 1 ? "" : "s"}`} action={<Link href="/dashboard/products/new" className="btn-primary"><Icon.plus className="h-4 w-4" />Add product</Link>} />
      <form className="mb-5 flex flex-wrap gap-3" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search name or SKU" className="input max-w-xs" maxLength={100} aria-label="Search products" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[180px]" aria-label="Filter by status">
          <option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty title="No products yet" body="Add your first product to start selling." action={<Link href="/dashboard/products/new" className="btn-primary">Add product</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100"><tr><th className="th">Product</th><th className="th">Category</th><th className="th">Online price</th><th className="th">Available</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p) => {
                const avail = p.variants.reduce((a, v) => a + v.stockLevels.reduce((b, l) => b + l.onHand - l.reserved, 0), 0);
                const low = p.variants.some((v) => v.stockLevels.reduce((b, l) => b + l.onHand - l.reserved, 0) <= v.lowStockThreshold);
                const prices = p.variants.map((v) => Number(v.onlinePrice));
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/dashboard/products/${p.id}`} className="flex items-center gap-3">
                        {p.images[0] ? <img src={p.images[0].url} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400"><Icon.box className="h-5 w-5" /></span>}
                        <span><span className="block font-semibold text-slate-900 hover:text-brand-700">{p.name}</span><span className="text-xs text-slate-500">{p.variants.length} variant{p.variants.length === 1 ? "" : "s"}</span></span>
                      </Link>
                    </td>
                    <td className="td">{p.category?.name ?? "—"}</td>
                    <td className="td font-semibold">{prices.length ? (Math.min(...prices) === Math.max(...prices) ? formatBDT(prices[0]!) : `${formatBDT(Math.min(...prices))} – ${formatBDT(Math.max(...prices))}`) : "—"}</td>
                    <td className="td"><span className={low ? "font-semibold text-rose-600" : ""}>{avail}</span>{low && <span className="ml-2 badge bg-rose-100 text-rose-700">Low</span>}</td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} pages={data.pages} base="/dashboard/products" params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
