import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { stockMatrix } from "@/server/services/warehouses";
import { PageHeader, Pagination } from "@/components/ui";

export const metadata = { title: "Stock by location" };

export default async function StockMatrix({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const m = await stockMatrix(ctx, { q: sp.q, page: Number(sp.page) || 1 });
  return (
    <>
      <Link href="/dashboard/locations" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Locations</Link>
      <PageHeader title="Stock by location" subtitle={`${m.total} items across ${m.warehouses.length} locations`} />
      <form className="mb-4" role="search"><input name="q" defaultValue={sp.q} placeholder="Search product" className="input max-w-sm" aria-label="Search products" maxLength={100} /></form>
      <div className="card overflow-x-auto"><table className="w-full">
        <thead className="border-b border-slate-100"><tr><th className="th">Product</th><th className="th">SKU</th>{m.warehouses.map((w) => <th key={w.id} className="th text-right">{w.name}</th>)}<th className="th text-right">Total</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {m.rows.map((r) => <tr key={r.id}><td className="td font-medium">{r.label}</td><td className="td font-mono text-xs text-slate-500">{r.sku ?? ""}</td>{m.warehouses.map((w) => <td key={w.id} className={`td text-right ${(r.byWarehouse[w.id] ?? 0) === 0 ? "text-slate-300" : ""}`}>{r.byWarehouse[w.id] ?? 0}</td>)}<td className="td text-right font-bold">{r.total}</td></tr>)}
        </tbody></table></div>
      <Pagination page={m.page} pages={m.pages} base="/dashboard/locations/stock" params={{ q: sp.q }} />
    </>
  );
}
