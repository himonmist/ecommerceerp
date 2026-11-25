import { requireErp, ymd } from "@/server/next/erp";
import { listCustomers } from "@/server/services/erp/customers";
import { listReceipts } from "@/server/services/erp/receipts";
import { withTenant } from "@/server/db/tenant";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/erp";
import { PageHeader, Pagination, StatusBadge } from "@/components/ui";
import { MoneyForm } from "../forms";
import { receiptAction } from "../actions";

export const metadata = { title: "Receive payment" };

export default async function Receipts({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const canManage = hasPermission(ctx.permissions, "sales.manage") && !ctx.readOnly;
  const data = await listReceipts(ctx, { page: Number(sp.page) || 1 });
  const customers = canManage ? (await listCustomers(ctx, { page: 1 })).items : [];
  const open = canManage ? await withTenant(ctx.tenantId, (tx) => tx.salesInvoice.findMany({ where: { status: "posted", paymentStatus: { not: "paid" }, customerId: { not: null } }, orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }], take: 1000 })) : [];
  return (
    <>
      <PageHeader title="Receive payment" subtitle="Settles the opening balance first, then the oldest invoices. Extra money is kept as customer advance." />
      <div className="grid gap-6 xl:grid-cols-3">
        {canManage && <section className="card h-fit p-6 xl:order-2"><h2 className="mb-4 font-bold">New money receipt</h2>
          <MoneyForm kind="receipt" action={receiptAction} parties={customers.map((c) => ({ id: c.id, name: c.name, outstanding: c.outstanding }))}
            open={open.map((i) => ({ id: i.id, partyId: i.customerId!, number: i.number, date: ymd(i.invoiceDate), due: (Number(i.total) - Number(i.paid) - Number(i.returned)).toFixed(2) }))} /></section>}
        <div className="xl:col-span-2">
          <div className="card overflow-x-auto"><table className="w-full">
            <thead className="border-b border-slate-100"><tr><th className="th">Receipt</th><th className="th">Date</th><th className="th">Customer</th><th className="th">Method</th><th className="th text-right">Amount</th><th className="th text-right">To advance</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((r) => <tr key={r.id}><td className="td font-mono">{r.number}</td><td className="td">{ymd(r.date)}</td><td className="td">{r.customer?.name ?? "Walk-in"}</td><td className="td">{METHOD_LABEL[r.method as PaymentMethod] ?? "Advance used"}{r.reference ? ` · ${r.reference}` : ""}</td><td className="td text-right font-semibold">{formatBDT(r.amount)}</td><td className="td text-right">{formatBDT(r.toAdvance)}</td><td className="td"><StatusBadge status={r.status === "void" ? "void" : "posted"} /></td></tr>)}
              {data.items.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>No receipts yet.</td></tr>}
            </tbody></table></div>
          <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/receipts" params={{}} />
        </div>
      </div>
    </>
  );
}
