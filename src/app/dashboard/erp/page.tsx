import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { customerAging } from "@/server/services/erp/customers";
import { supplierAging } from "@/server/services/erp/suppliers";
import { listInvoices } from "@/server/services/erp/invoices";
import { listUnbilledReceipts } from "@/server/services/erp/purchase-orders";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "ERP hub" };

export default async function ErpHub() {
  const ctx = await requireErp();
  const canSales = hasPermission(ctx.permissions, "sales.view");
  const canPurchase = hasPermission(ctx.permissions, "purchase.view");
  const ar = canSales ? await customerAging(ctx) : null;
  const ap = canPurchase ? await supplierAging(ctx) : null;
  const recent = canSales ? await listInvoices(ctx, {}) : null;
  const unbilled = canPurchase ? await listUnbilledReceipts(ctx) : [];
  const actions = [
    { href: "/dashboard/erp/invoices/new", label: "Direct invoice", icon: Icon.cart, tint: "from-brand-500 to-accent-500", show: canSales },
    { href: "/dashboard/erp/quotations/new", label: "New quotation", icon: Icon.tag, tint: "from-violet-500 to-fuchsia-500", show: canSales },
    { href: "/dashboard/erp/receipts", label: "Receive payment", icon: Icon.chart, tint: "from-emerald-500 to-teal-500", show: canSales },
    { href: "/dashboard/erp/purchase-orders/new", label: "Purchase order", icon: Icon.truck, tint: "from-amber-500 to-orange-500", show: canPurchase },
    { href: "/dashboard/erp/bills/new", label: "Direct bill (stock in)", icon: Icon.box, tint: "from-rose-500 to-pink-500", show: canPurchase },
    { href: "/dashboard/erp/payments", label: "Pay supplier", icon: Icon.chart, tint: "from-sky-500 to-indigo-500", show: canPurchase },
  ].filter((a) => a.show);
  return (
    <>
      <PageHeader title="Wholesale ERP" subtitle="Sales, purchase, receivables and payables in one place." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {actions.map(({ href, label, icon: I, tint }) => (
          <Link key={href} href={href} className={`group rounded-2xl bg-gradient-to-br ${tint} p-4 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl`}>
            <I className="h-6 w-6" /><p className="mt-6 text-sm font-bold">{label}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {ar && <Link href="/dashboard/erp/reports" className="card p-5 hover:shadow-md"><p className="text-sm text-slate-500">Receivable (customers owe)</p><p className="mt-2 text-2xl font-extrabold">{formatBDT(ar.totals.total)}</p><p className="mt-1 text-xs text-slate-500">{formatBDT(ar.totals.d90plus)} over 90 days</p></Link>}
        {ap && <Link href="/dashboard/erp/reports" className="card p-5 hover:shadow-md"><p className="text-sm text-slate-500">Payable (you owe suppliers)</p><p className="mt-2 text-2xl font-extrabold">{formatBDT(ap.totals.total)}</p><p className="mt-1 text-xs text-slate-500">{formatBDT(ap.totals.d90plus)} over 90 days</p></Link>}
        {canPurchase && <Link href="/dashboard/erp/purchase-orders" className="card p-5 hover:shadow-md"><p className="text-sm text-slate-500">Goods received, not yet billed</p><p className="mt-2 text-2xl font-extrabold">{unbilled.length}</p><p className="mt-1 text-xs text-slate-500">goods receipt notes</p></Link>}
      </div>
      {recent && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Recent invoices</h2><Link href="/dashboard/erp/invoices" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link></div>
          <div className="card overflow-x-auto">
            <table className="w-full"><thead className="border-b border-slate-100"><tr><th className="th">Invoice</th><th className="th">Customer</th><th className="th">Total</th><th className="th">Due</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {recent.items.slice(0, 8).map((i) => (
                  <tr key={i.id}><td className="td font-mono font-semibold"><Link className="text-brand-700 hover:underline" href={`/dashboard/erp/invoices/${i.id}`}>{i.number}</Link></td><td className="td">{i.customerName}</td>
                    <td className="td">{formatBDT(i.total)}</td><td className="td">{formatBDT(Number(i.total) - Number(i.paid) - Number(i.returned))}</td><td className="td"><StatusBadge status={i.status === "void" ? "void" : i.paymentStatus} /></td></tr>
                ))}
                {recent.items.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>No invoices yet.</td></tr>}
              </tbody></table>
          </div>
        </section>
      )}
    </>
  );
}
