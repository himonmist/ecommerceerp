import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { listCategories } from "@/server/services/catalog";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { createProductAction } from "../../actions";

export const metadata = { title: "New product" };

export default async function NewProduct() {
  const ctx = await requireCtx();
  const categories = await listCategories(ctx);
  return (
    <>
      <Link href="/dashboard/products" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Products</Link>
      <PageHeader title="Add product" subtitle="Set prices per channel and opening stock." />
      <ProductForm action={createProductAction} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
