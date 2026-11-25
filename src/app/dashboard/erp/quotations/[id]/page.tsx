import Link from "next/link";
import { load, requireErp, ymd } from "@/server/next/erp";
import { getQuotation } from "@/server/services/erp/quotations";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ConvertForm, PrintButton, StatusForm } from "../../forms";
import { convertQuotationAction, quotationStatusAction } from "../../actions";

export const metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireErp();
  const { id } = await params;
  const q = await load(id, () => getQuotation(ctx, id));
  const open = q.status !== "converted";
  const canManage = hasPermission(ctx.permissions, "sales.manage") && !ctx.readOnly && open;
  return (
    <>
      <Link href="/dashboard/erp/quotations" className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← Quotations</Link>
      <PageHeader title={`Quotation ${q.number}`} subtitle={`${ymd(q.date)} · ${q.customer.name}${q.validUntil ? ` · valid until ${ymd(q.validUntil)}` : ""}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={q.status} />{q.convertedInvoiceId && <Link className="btn-secondary print:hidden" href={`/dashboard/erp/invoices/${q.convertedInvoiceId}`}>View invoice</Link>}<PrintButton /></div>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <div className="hidden border-b border-slate-100 p-5 print:block"><p className="text-xl font-extrabold">{ctx.tenant?.name}</p><p className="text-sm">Price quotation {q.number} for {q.customer.name}</p></div>
          <table className="w-full"><thead><tr><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Price</th><th className="th text-right">Disc.</th><th className="th text-right">VAT</th><th className="th text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{q.items.map((i) => <tr key={i.id}><td className="td">{i.description}</td><td className="td text-right">{i.qty}</td><td className="td text-right">{formatBDT(i.unitPrice)}</td><td className="td text-right">{formatBDT(i.discount)}</td><td className="td text-right">{i.vatPct.toString()}%</td><td className="td text-right font-semibold">{formatBDT(i.lineTotal)}</td></tr>)}</tbody></table>
          <div className="flex justify-between border-t border-slate-100 px-5 py-4 text-base font-bold"><span>Total</span><span>{formatBDT(q.total)}</span></div>
          {q.terms && <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{q.terms}</p>}
        </section>
        {canManage && (
          <div className="space-y-6 print:hidden">
            <section className="card p-5"><h2 className="mb-3 font-bold">Status</h2><StatusForm action={quotationStatusAction.bind(null, q.id)} options={[{ value: "sent", label: "Sent to customer" }, { value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }, { value: "draft", label: "Draft" }]} /></section>
            {q.status !== "rejected" && <section className="card p-5"><h2 className="mb-1 font-bold">Convert to invoice</h2><p className="mb-3 text-sm text-slate-500">Creates an invoice and deducts stock.</p><ConvertForm action={convertQuotationAction.bind(null, q.id)} /></section>}
          </div>
        )}
      </div>
    </>
  );
}
