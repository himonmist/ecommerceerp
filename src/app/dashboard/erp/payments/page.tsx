import { requireErp, ymd } from "@/server/next/erp";
import { listSuppliers } from "@/server/services/erp/suppliers";
import { listSupplierPayments } from "@/server/services/erp/supplier-payments";
import { withTenant } from "@/server/db/tenant";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/erp";
import { PageHeader, Pagination, StatusBadge } from "@/components/ui";
import { MoneyForm } from "../forms";
import { supplierPaymentAction } from "../actions";

export const metadata = { title: "Pay suppliers" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const canManage = hasPermission(ctx.permissions, "purchase.manage") && !ctx.readOnly;
  const data = await listSupplierPayments(ctx, { page: Number(sp.page) || 1 });
  const suppliers = canManage ? (await listSuppliers(ctx, { page: 1 })).items : [];
  const open = canManage ? await withTenant(ctx.tenantId, (tx) => tx.purchaseBill.findMany({ where: { status: "posted", paymentStatus: { not: "paid" } }, orderBy: [{ billDate: "asc" }, { createdAt: "asc" }], take: 1000 })) : [];
  return (
    <>
      <PageHeader title="Pay suppliers" subtitle="Pays the opening payable first, then the oldest bills. Extra money becomes supplier advance." />
      <div className="grid gap-6 xl:grid-cols-3">
        {canManage && <section className="card h-fit p-6 xl:order-2"><h2 className="mb-4 font-bold">New supplier payment</h2>
          <MoneyForm kind="payment" action={supplierPaymentAction} parties={suppliers.map((s) => ({ id: s.id, name: s.name, outstanding: s.payable }))}
            open={open.map((b) => ({ id: b.id, partyId: b.supplierId, number: b.number, date: ymd(b.billDate), due: (Number(b.total) - Number(b.paid) - Number(b.returned)).toFixed(2) }))} /></section>}
        <div className="xl:col-span-2">
          <div className="card overflow-x-auto"><table className="w-full">
            <thead className="border-b border-slate-100"><tr><th className="th">Payment</th><th className="th">Date</th><th className="th">Supplier</th><th className="th">Method</th><th className="th text-right">Amount</th><th className="th text-right">To advance</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p) => <tr key={p.id}><td className="td font-mono">{p.number}</td><td className="td">{ymd(p.date)}</td><td className="td">{p.supplier.name}</td><td className="td">{METHOD_LABEL[p.method as PaymentMethod] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</td><td className="td text-right font-semibold">{formatBDT(p.amount)}</td><td className="td text-right">{formatBDT(p.toAdvance)}</td><td className="td"><StatusBadge status={p.status === "void" ? "void" : "posted"} /></td></tr>)}
              {data.items.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>No payments yet.</td></tr>}
            </tbody></table></div>
          <Pagination page={data.page} pages={data.pages} base="/dashboard/erp/payments" params={{}} />
        </div>
      </div>
    </>
  );
}
