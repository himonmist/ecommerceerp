import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { listCustomerTypes, listCustomers } from "@/server/services/erp/customers";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { Empty, PageHeader, Pagination } from "@/components/ui";
import { CustomerForm, TypeForm } from "../forms";
import { createCustomerAction, createCustomerTypeAction } from "../actions";

export const metadata = { title: "Customers (ERP)" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const data = await listCustomers(ctx, { q: sp.q, page: Number(sp.page) || 1 });
  const types = await listCustomerTypes(ctx);
  const canManage = hasPermission(ctx.permissions, "sales.manage") && !ctx.readOnly;
  return (
    <>
      <PageHeader title="Customers" subtitle="Wholesale and credit customers with receivable balances." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <form className="mb-4" role="search"><input name="q" defaultValue={sp.q} placeholder="Search name, phone or CMID" className="input max-w-sm" aria-label="Search customers" maxLength={100} /></form>
          {data.items.length === 0 ? <Empty title="No customers yet" body="Add wholesale or credit customers to invoice them." /> : (
            <div className="card overflow-x-auto"><table className="w-full">
              <thead className="border-b border-slate-100"><tr><th className="th">Customer</th><th className="th">Type</th><th className="th">Phone</th><th className="th">Credit limit</th><th className="th text-right">Receivable</th><th className="th text-right">Advance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td"><Link href={`/dashboard/erp/customers/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{c.name}</Link><span className="block font-mono text-xs text-slate-400">{c.membershipId ?? "Online customer"}</span></td>
                    <td className="td">{c.customerType?.name ?? "General"}</td><td className="td font-mono">{c.phone}</td>
                    <td className="td">{Number(c.creditLimit) > 0 ? formatBDT(c.creditLimit) : "No limit"}</td>
                    <td className={`td text-right font-semibold ${Number(c.outstanding) > 0 ? "text-rose-700" : ""}`}>{formatBDT(c.outstanding)}</td>
                    <td className="td text-right">{formatBDT(c.advance)}</td>
                  </tr>
                ))}
              </tbody></table></div>
          )}
          <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/customers" params={{ q: sp.q }} />
        </div>
        {canManage && (
          <div className="space-y-6">
            <section className="card p-6"><h2 className="mb-4 font-bold">Add customer</h2><CustomerForm action={createCustomerAction} types={types.map((t) => ({ id: t.id, name: t.name }))} /></section>
            <section className="card p-6"><h2 className="mb-2 font-bold">Customer types</h2>
              <ul className="mb-4 space-y-1 text-sm">{types.map((t) => <li key={t.id} className="flex justify-between"><span>{t.name}{t.code ? ` (${t.code})` : ""}</span><span className="text-slate-500">{t.discountPct.toString()}% · {t.creditDays}d · {t._count.customers}</span></li>)}</ul>
              <TypeForm action={createCustomerTypeAction} kind="customer" /></section>
          </div>
        )}
      </div>
    </>
  );
}
