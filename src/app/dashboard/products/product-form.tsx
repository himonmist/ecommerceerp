"use client";
import { useActionState, useState } from "react";
import { ActionForm, Field, FormError, FormSuccess, Submit } from "@/components/form";
import type { ActionState } from "@/server/next/action";

type Variant = { id?: string; title: string; sku: string; onlinePrice: string; offlinePrice: string; compareAtPrice: string; costPrice: string; stock: string; lowStockThreshold: string };
type Initial = {
  name: string; categoryId: string; brandName: string; channel: string; status: string; shortDescription: string; description: string;
  imageUrl: string; isFeatured: boolean; variants: Variant[];
};
const blank: Variant = { title: "Default", sku: "", onlinePrice: "", offlinePrice: "", compareAtPrice: "", costPrice: "", stock: "0", lowStockThreshold: "5" };

export function ProductForm({ action, categories, initial, editing = false }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  categories: { id: string; name: string }[];
  initial?: Initial;
  editing?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [variants, setVariants] = useState<Variant[]>(initial?.variants ?? [blank]);
  const f = state?.fields ?? {};
  const err = (i: number, k: string) => f[`variants.${i}.${k}`];
  return (
    <ActionForm action={formAction} state={state} className="grid gap-6 lg:grid-cols-3" noValidate>
      <div className="space-y-6 lg:col-span-2">
        <FormError message={state?.error} />
        <FormSuccess message={state?.message} />
        <section className="card space-y-5 p-6">
          <Field label="Product name" name="name" defaultValue={initial?.name} required maxLength={160} error={f.name} />
          <div>
            <label className="label" htmlFor="shortDescription">Short description</label>
            <input id="shortDescription" name="shortDescription" defaultValue={initial?.shortDescription} maxLength={300} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea id="description" name="description" defaultValue={initial?.description} rows={5} maxLength={10000} className="input" />
          </div>
          <Field label="Image URL (https)" name="imageUrl" type="url" defaultValue={initial?.imageUrl} placeholder="https://…" error={f.imageUrl} />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Variants, pricing & stock</h2>
            <button type="button" className="btn-secondary" onClick={() => setVariants((v) => [...v, { ...blank, title: `Variant ${v.length + 1}` }])} disabled={variants.length >= 50}>Add variant</button>
          </div>
          {f.variants && <p className="mt-2 text-sm text-rose-600">{f.variants}</p>}
          <div className="mt-4 space-y-4">
            {variants.map((v, i) => (
              <fieldset key={v.id ?? i} className="rounded-2xl border border-slate-200 p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Variant {i + 1}</legend>
                {v.id && <input type="hidden" name={`variants[${i}][id]`} value={v.id} />}
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Title" name={`variants[${i}][title]`} defaultValue={v.title} error={err(i, "title")} />
                  <Field label="SKU" name={`variants[${i}][sku]`} defaultValue={v.sku} error={err(i, "sku")} />
                  <Field label="Online price ৳" name={`variants[${i}][onlinePrice]`} inputMode="decimal" defaultValue={v.onlinePrice} required error={err(i, "onlinePrice")} />
                  <Field label="Offline / POS ৳" name={`variants[${i}][offlinePrice]`} inputMode="decimal" defaultValue={v.offlinePrice} error={err(i, "offlinePrice")} />
                  <Field label="Compare-at ৳" name={`variants[${i}][compareAtPrice]`} inputMode="decimal" defaultValue={v.compareAtPrice} error={err(i, "compareAtPrice")} />
                  <Field label="Cost (COGS) ৳" name={`variants[${i}][costPrice]`} inputMode="decimal" defaultValue={v.costPrice} error={err(i, "costPrice")} />
                  {!editing || !v.id ? (
                    <Field label={editing ? "Stock (set via adjustment)" : "Opening stock"} name={`variants[${i}][stock]`} type="number" min={0} defaultValue={v.stock} readOnly={editing} error={err(i, "stock")} />
                  ) : <div />}
                  <Field label="Low-stock alert at" name={`variants[${i}][lowStockThreshold]`} type="number" min={0} defaultValue={v.lowStockThreshold} error={err(i, "lowStockThreshold")} />
                </div>
                {!v.id && variants.length > 1 && (
                  <button type="button" className="btn-ghost mt-2 text-rose-600" onClick={() => setVariants((all) => all.filter((_, j) => j !== i))}>Remove</button>
                )}
              </fieldset>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={initial?.status ?? "active"} className="input">
              <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="channel">Sales channel</label>
            <select id="channel" name="channel" defaultValue={initial?.channel ?? "omni"} className="input">
              <option value="omni">Online + in-store</option><option value="online">Online only</option><option value="offline">In-store only</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="categoryId">Category</label>
            <select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""} className="input">
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Field label="Brand" name="brandName" defaultValue={initial?.brandName} maxLength={80} />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="isFeatured" defaultChecked={initial?.isFeatured} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Feature on storefront
          </label>
        </section>
        <Submit pendingText="Saving…">{editing ? "Save changes" : "Create product"}</Submit>
      </div>
    </ActionForm>
  );
}
