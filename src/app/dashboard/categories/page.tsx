import { requireCtx } from "@/server/next/session";
import { listCategories } from "@/server/services/catalog";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { CategoryForm } from "./category-form";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ctx = await requireCtx();
  const cats = await listCategories(ctx);
  return (
    <>
      <PageHeader title="Categories" subtitle="Organise products for your storefront menu." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {cats.length === 0 ? <Empty title="No categories yet" body="Create categories like “Dinnerware” or “Tea & Coffee”." /> : (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100"><tr><th className="th">Category</th><th className="th">Slug</th><th className="th">Products</th><th className="th">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {cats.map((c) => (
                    <tr key={c.id}><td className="td font-semibold text-slate-900">{c.name}</td><td className="td font-mono text-xs text-slate-500">{c.slug}</td><td className="td">{c._count.products}</td><td className="td"><StatusBadge status={c.status} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <section className="card h-fit p-6"><h2 className="mb-4 font-bold">New category</h2><CategoryForm parents={cats.map((c) => ({ id: c.id, name: c.name }))} /></section>
      </div>
    </>
  );
}
