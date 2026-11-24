import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { getProduct, listCategories } from "@/server/services/catalog";
import { AppError } from "@/server/errors";
import { PageHeader, StatusBadge } from "@/components/ui";
import { FormSuccess } from "@/components/form";
import { ProductForm } from "../product-form";
import { StockForm } from "./stock-form";
import { archiveProductAction, updateProductAction } from "../../actions";

export const metadata = { title: "Edit product" };
const UUID = /^[0-9a-f-]{36}$/i;
const s = (v: { toString(): string } | null | undefined) => (v == null ? "" : v.toString());

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const ctx = await requireCtx();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [p, categories] = await Promise.all([
    getProduct(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; }),
    listCategories(ctx),
  ]);
  const stock = p.variants.map((v) => ({ id: v.id, title: v.title, onHand: v.stockLevels.reduce((a, l) => a + l.onHand, 0), reserved: v.stockLevels.reduce((a, l) => a + l.reserved, 0) }));
  return (
    <>
      <Link href="/dashboard/products" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Products</Link>
      <PageHeader title={p.name} subtitle={`/${p.slug}`} action={
        <div className="flex items-center gap-2">
          <StatusBadge status={p.status} />
          <a href={`/s/${ctx.tenant?.slug}/p/${p.slug}`} target="_blank" rel="noopener" className="btn-secondary">View in store</a>
          {p.status !== "archived" && <form action={archiveProductAction.bind(null, p.id)}><button className="btn-ghost text-rose-600">Archive</button></form>}
        </div>} />
      {sp.created && <div className="mb-6"><FormSuccess message="Product created. It's live on your storefront if status is Active." /></div>}
      <ProductForm editing action={updateProductAction.bind(null, p.id)} categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initial={{
          name: p.name, categoryId: p.categoryId ?? "", brandName: p.brand?.name ?? "", channel: p.channel, status: p.status,
          shortDescription: p.shortDescription ?? "", description: p.description ?? "", imageUrl: p.images[0]?.url ?? "", isFeatured: p.isFeatured,
          variants: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku ?? "", onlinePrice: s(v.onlinePrice), offlinePrice: s(v.offlinePrice),
            compareAtPrice: s(v.compareAtPrice), costPrice: s(v.costPrice), stock: "0", lowStockThreshold: String(v.lowStockThreshold) })),
        }} />
      <section className="card mt-6 max-w-xl p-6">
        <h2 className="font-bold">Adjust stock</h2>
        <p className="mt-1 text-sm text-slate-500">Every adjustment is recorded in the immutable stock ledger.</p>
        <div className="mt-4"><StockForm variants={stock} /></div>
      </section>
    </>
  );
}
