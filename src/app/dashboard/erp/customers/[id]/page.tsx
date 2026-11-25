import Link from "next/link";
import { load, requireErp, ymd } from "@/server/next/erp";
import { customerStatement } from "@/server/services/erp/customers";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "../../forms";

export const metadata = { title: "Customer statement" };

export default async function CustomerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireErp();
  const { id } = await params;
  const st = await load(id, () => customerStatement(ctx, id));
  const c = st.customer;
  return (
    <>
      <Link href="/dashboard/erp/customers" className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← Customers</Link>
      <PageHeader title={c.name} subtitle={`${c.membershipId ?? ""} · ${c.phone}${c.city ? ` · ${c.city}` : ""}`} action={<div className="flex gap-2 print:hidden"><Link className="btn-primary" href={`/dashboard/erp/invoices/new?customer=${c.id}`}>New invoice</Link><Link className="btn-secondary" href="/dashboard/erp/receipts">Receive payment</Link><PrintButton /></div>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-slate-500">Balance (owed − advance)</p><p className="mt-1 text-2xl font-extrabold">{formatBDT(st.closing)}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-500">Credit limit</p><p className="mt-1 text-2xl font-extrabold">{Number(c.creditLimit) > 0 ? formatBDT(c.creditLimit) : "No limit"}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-500">Advance held</p><p className="mt-1 text-2xl font-extrabold">{formatBDT(c.advanceBalance)}</p></div>
      </div>
      <section className="card overflow-x-auto">
        <h2 className="border-b border-slate-100 px-5 py-4 font-bold">Statement of account</h2>
        <table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Type</th><th className="th">Reference</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th><th className="th text-right">Balance</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {st.rows.map((r, i) => <tr key={i}><td className="td">{ymd(r.date)}</td><td className="td">{r.type}</td><td className="td font-mono">{r.ref}</td><td className="td text-right">{r.debit !== "0.00" ? formatBDT(r.debit) : ""}</td><td className="td text-right">{r.credit !== "0.00" ? formatBDT(r.credit) : ""}</td><td className="td text-right font-semibold">{formatBDT(r.balance!)}</td></tr>)}
            {st.rows.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No transactions yet.</td></tr>}
          </tbody></table>
      </section>
    </>
  );
}
