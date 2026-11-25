import { requireErp } from "@/server/next/erp";
import { listSupplierTypes, listSuppliers } from "@/server/services/erp/suppliers";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { Empty, PageHeader, Pagination } from "@/components/ui";
import { SupplierForm, TypeForm } from "../forms";
import { createSupplierAction, createSupplierTypeAction } from "../actions";

export const metadata = { title: "Suppliers" };

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const data = await listSuppliers(ctx, { q: sp.q, page: Number(sp.page) || 1 });
  const types = await listSupplierTypes(ctx);
  const canManage = hasPermission(ctx.permissions, "purchase.manage") && !ctx.readOnly;
  return (
    <>
      <PageHeader title="Suppliers & vendors" subtitle="Who you buy from and how much you owe them." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <form className="mb-4" role="search"><input name="q" defaultValue={sp.q} placeholder="Search name, contact or phone" className="input max-w-sm" aria-label="Search suppliers" maxLength={100} /></form>
          {data.items.length === 0 ? <Empty title="No suppliers yet" body="Add suppliers to raise purchase orders and bills." /> : (
            <div className="card overflow-x-auto"><table className="w-full">
              <thead className="border-b border-slate-100"><tr><th className="th">Supplier</th><th className="th">Type</th><th className="th">Contact</th><th className="th">Phone</th><th className="th text-right">Payable</th><th className="th text-right">Advance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((s) => <tr key={s.id}><td className="td font-semibold text-slate-900">{s.name}</td><td className="td">{s.supplierType?.name ?? "General"}</td><td className="td">{s.contactPerson ?? "—"}</td><td className="td font-mono">{s.phone ?? "—"}</td><td className={`td text-right font-semibold ${Number(s.payable) > 0 ? "text-rose-700" : ""}`}>{formatBDT(s.payable)}</td><td className="td text-right">{formatBDT(s.advance)}</td></tr>)}
              </tbody></table></div>
          )}
          <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/suppliers" params={{ q: sp.q }} />
        </div>
        {canManage && (
          <div className="space-y-6">
            <section className="card p-6"><h2 className="mb-4 font-bold">Add supplier</h2><SupplierForm action={createSupplierAction} types={types.map((t) => ({ id: t.id, name: t.name }))} /></section>
            <section className="card p-6"><h2 className="mb-2 font-bold">Supplier types</h2><ul className="mb-4 space-y-1 text-sm">{types.map((t) => <li key={t.id} className="flex justify-between"><span>{t.name}{t.code ? ` (${t.code})` : ""}</span><span className="text-slate-500">{t._count.suppliers}</span></li>)}</ul>
              <TypeForm action={createSupplierTypeAction} kind="supplier" /></section>
          </div>
        )}
      </div>
    </>
  );
}
