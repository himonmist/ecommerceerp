import Link from "next/link";
import { load, requireErp, ymd } from "@/server/next/erp";
import { getBill } from "@/server/services/erp/bills";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/erp";
import { FormSuccess } from "@/components/form";
import { PageHeader, StatusBadge } from "@/components/ui";
import { PrintButton, ReturnForm } from "../../forms";
import { purchaseReturnAction, voidSupplierPaymentAction } from "../../actions";

export const metadata = { title: "Bill" };

export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const ctx = await requireErp();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const b = await load(id, () => getBill(ctx, id));
  const due = Number(b.total) - Number(b.paid) - Number(b.returned);
  const canManage = hasPermission(ctx.permissions, "purchase.manage") && !ctx.readOnly && b.status === "posted";
  return (
    <>
      <Link href="/dashboard/erp/bills" className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← Bills</Link>
      <PageHeader title={`Bill ${b.number}`} subtitle={`${ymd(b.billDate)} · ${b.supplier.name}${b.supplierBillNo ? ` · supplier ref ${b.supplierBillNo}` : ""}${b.grnId ? " · from goods receipt" : " · direct stock-in"}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={b.paymentStatus} /><PrintButton /></div>} />
      {sp.created && <div className="mb-6 print:hidden"><FormSuccess message={b.grnId ? "Bill created from the goods receipt." : "Bill saved and stock received."} /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <table className="w-full"><thead><tr><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Unit cost</th><th className="th text-right">Disc.</th><th className="th text-right">VAT</th><th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{b.items.map((i) => <tr key={i.id}><td className="td">{i.description}{i.returnedQty > 0 && <span className="ml-2 badge bg-rose-100 text-rose-700">{i.returnedQty} returned</span>}</td><td className="td text-right">{i.qty}</td><td className="td text-right">{formatBDT(i.unitCost)}</td><td className="td text-right">{formatBDT(i.discount)}</td><td className="td text-right">{i.vatPct.toString()}%</td><td className="td text-right font-semibold">{formatBDT(i.lineTotal)}</td></tr>)}</tbody></table>
            <dl className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm">
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatBDT(b.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd>{formatBDT(b.paid)}</dd></div>
              {Number(b.returned) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Debit notes (returns)</dt><dd>{formatBDT(b.returned)}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>Due</dt><dd className={due > 0 ? "text-rose-700" : ""}>{formatBDT(due)}</dd></div>
            </dl>
          </section>
          <section className="card p-5 print:hidden">
            <h2 className="font-bold">Payments</h2>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {b.allocations.map((a) => <li key={a.id} className="flex items-center justify-between py-2"><span className="font-mono">{a.payment.number}</span><span>{METHOD_LABEL[a.payment.method as PaymentMethod] ?? a.payment.method}{a.payment.reference ? ` · ${a.payment.reference}` : ""}</span><span className="font-semibold">{formatBDT(a.amount)}</span>
                {canManage && <form action={voidSupplierPaymentAction.bind(null, a.payment.id)}><button className="btn-ghost text-xs text-rose-600">Void payment</button></form>}</li>)}
              {b.allocations.length === 0 && <li className="py-2 text-slate-500">No payments yet. <Link href="/dashboard/erp/payments" className="text-brand-600 hover:underline">Pay supplier</Link></li>}
            </ul>
          </section>
        </div>
        {canManage && <div className="print:hidden"><section className="card p-5"><h2 className="mb-3 font-bold">Return to supplier</h2>
          <ReturnForm kind="purchase" action={purchaseReturnAction.bind(null, b.id)} items={b.items.map((i) => ({ id: i.id, description: i.description, remaining: i.qty - i.returnedQty, unit: formatBDT(Number(i.lineTotal) / i.qty) }))} /></section></div>}
      </div>
    </>
  );
}
