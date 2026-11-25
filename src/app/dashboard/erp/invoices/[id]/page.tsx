import Link from "next/link";
import { load, requireErp, ymd } from "@/server/next/erp";
import { getInvoice } from "@/server/services/erp/invoices";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/erp";
import { FormSuccess } from "@/components/form";
import { PageHeader, StatusBadge } from "@/components/ui";
import { PrintButton, ReturnForm, VoidForm } from "../../forms";
import { salesReturnAction, voidInvoiceAction, voidReceiptAction } from "../../actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; voided?: string }> }) {
  const ctx = await requireErp();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const inv = await load(id, () => getInvoice(ctx, id));
  const due = Number(inv.total) - Number(inv.paid) - Number(inv.returned);
  const canManage = hasPermission(ctx.permissions, "sales.manage") && !ctx.readOnly && inv.status === "posted";
  return (
    <>
      <Link href="/dashboard/erp/invoices" className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← Invoices</Link>
      <PageHeader title={`Invoice ${inv.number}`} subtitle={`${ymd(inv.invoiceDate)} · ${inv.customerName}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={inv.status === "void" ? "void" : inv.paymentStatus} /><PrintButton /></div>} />
      {sp.created && <div className="mb-6 print:hidden"><FormSuccess message="Invoice saved and stock updated." /></div>}
      {sp.voided && <div className="mb-6 print:hidden"><FormSuccess message="Invoice voided and stock restored." /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <div className="hidden border-b border-slate-100 p-5 print:block"><p className="text-xl font-extrabold">{ctx.tenant?.name}</p><p className="text-sm">Sales invoice {inv.number} · {ymd(inv.invoiceDate)} · Bill to: {inv.customerName}</p></div>
            <table className="w-full"><thead><tr><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Price</th><th className="th text-right">Disc.</th><th className="th text-right">VAT</th><th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {inv.items.map((i) => <tr key={i.id}><td className="td">{i.description}{i.returnedQty > 0 && <span className="ml-2 badge bg-rose-100 text-rose-700">{i.returnedQty} returned</span>}</td><td className="td text-right">{i.qty}</td><td className="td text-right">{formatBDT(i.unitPrice)}</td><td className="td text-right">{formatBDT(i.discount)}</td><td className="td text-right">{i.vatPct.toString()}%</td><td className="td text-right font-semibold">{formatBDT(i.lineTotal)}</td></tr>)}
              </tbody></table>
            <dl className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm">
              {[["Subtotal", inv.subtotal], ["VAT", inv.vatTotal], ["Discount", `-${inv.discount}`], ["Additional charge", inv.additionalCharge]].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-slate-500">{k as string}</dt><dd>{String(v).startsWith("-") ? `−${formatBDT(String(v).slice(1))}` : formatBDT(v as string)}</dd></div>)}
              <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>{formatBDT(inv.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd>{formatBDT(inv.paid)}</dd></div>
              {Number(inv.returned) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Credited by returns</dt><dd>{formatBDT(inv.returned)}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>Due</dt><dd className={due > 0 ? "text-rose-700" : ""}>{formatBDT(inv.status === "void" ? 0 : due)}</dd></div>
            </dl>
          </section>
          <section className="card p-5 print:hidden">
            <h2 className="font-bold">Payments</h2>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {inv.allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2"><span className="font-mono">{a.receipt.number}</span><span>{METHOD_LABEL[a.receipt.method as PaymentMethod] ?? "Advance"}{a.receipt.reference ? ` · ${a.receipt.reference}` : ""}</span><span className="font-semibold">{formatBDT(a.amount)}</span>
                  {canManage && <form action={voidReceiptAction.bind(null, a.receipt.id)}><button className="btn-ghost text-xs text-rose-600">Void receipt</button></form>}</li>
              ))}
              {inv.allocations.length === 0 && <li className="py-2 text-slate-500">No payments yet. <Link href="/dashboard/erp/receipts" className="text-brand-600 hover:underline">Receive payment</Link></li>}
            </ul>
            {inv.returns.length > 0 && <><h3 className="mt-4 font-semibold">Returns</h3><ul className="mt-2 text-sm">{inv.returns.map((r) => <li key={r.id} className="flex justify-between py-1"><span className="font-mono">{r.number}</span><span>{r.reason}</span><span>{formatBDT(r.amount)}</span></li>)}</ul></>}
          </section>
        </div>
        {canManage && (
          <div className="space-y-6 print:hidden">
            <section className="card p-5"><h2 className="mb-3 font-bold">Customer return</h2>
              <ReturnForm kind="sale" action={salesReturnAction.bind(null, inv.id)} items={inv.items.map((i) => ({ id: i.id, description: i.description, remaining: i.qty - i.returnedQty, unit: formatBDT(Number(i.lineTotal) / i.qty) }))} /></section>
            {Number(inv.paid) === 0 && inv.returns.length === 0 && <section className="card p-5"><h2 className="mb-3 font-bold">Void invoice</h2><p className="mb-3 text-sm text-slate-500">Restores stock. Only unpaid invoices can be voided.</p><VoidForm action={voidInvoiceAction.bind(null, inv.id)} label="Void invoice" /></section>}
          </div>
        )}
      </div>
    </>
  );
}
