import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { listCustomers } from "@/server/services/erp/customers";
import { variantOptions } from "@/server/services/modules";
import { PageHeader } from "@/components/ui";
import { DateField, DocForm } from "../../forms";
import { createInvoiceAction } from "../../actions";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await requireErp();
  const sp = await searchParams;
  const [customers, options] = [await listCustomers(ctx, { page: 1 }), await variantOptions(ctx)];
  return (
    <>
      <Link href="/dashboard/erp/invoices" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Invoices</Link>
      <PageHeader title="Direct invoice" subtitle="Stock is deducted when you save. Walk-in sales must be paid in full." />
      <DocForm action={createInvoiceAction} options={options} mode="sale" payments submit="Save invoice">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="customerId">Customer</label>
          <select id="customerId" name="customerId" className="input" defaultValue={sp.customer ?? ""}>
            <option value="">Walk-in customer (enter name →)</option>
            {customers.items.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}{Number(c.outstanding) > 0 ? ` · owes ৳${c.outstanding}` : ""}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Showing first {customers.items.length} customers. <Link href="/dashboard/erp/customers" className="text-brand-600 hover:underline">Add a customer</Link></p>
        </div>
        <div><label className="label" htmlFor="walkInName">Walk-in name</label><input id="walkInName" name="walkInName" className="input" placeholder="Counter sale" /></div>
        <DateField name="invoiceDate" label="Invoice date" />
        <DateField name="dueDate" label="Due date" required={false} defaultToday={false} />
        <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" name="useAdvance" className="h-4 w-4" /> Use customer&apos;s advance</label>
        <div className="sm:col-span-2"><label className="label" htmlFor="notes">Notes</label><input id="notes" name="notes" className="input" maxLength={1000} /></div>
      </DocForm>
    </>
  );
}
