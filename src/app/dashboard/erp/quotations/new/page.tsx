import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { listCustomers } from "@/server/services/erp/customers";
import { variantOptions } from "@/server/services/modules";
import { PageHeader } from "@/components/ui";
import { DateField, DocForm } from "../../forms";
import { createQuotationAction } from "../../actions";

export const metadata = { title: "New quotation" };

export default async function NewQuotation() {
  const ctx = await requireErp();
  const [customers, options] = [await listCustomers(ctx, { page: 1 }), await variantOptions(ctx)];
  return (
    <>
      <Link href="/dashboard/erp/quotations" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Quotations</Link>
      <PageHeader title="Create price quotation" subtitle="No stock is reserved until it becomes an invoice." />
      <DocForm action={createQuotationAction} options={options} mode="sale" submit="Save quotation">
        <div className="sm:col-span-2"><label className="label" htmlFor="customerId">Customer</label>
          <select id="customerId" name="customerId" className="input" required><option value="">Choose…</option>{customers.items.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></div>
        <DateField name="date" label="Quotation date" />
        <DateField name="validUntil" label="Valid until" required={false} defaultToday={false} />
        <div className="sm:col-span-2 lg:col-span-4"><label className="label" htmlFor="terms">Terms & conditions</label><textarea id="terms" name="terms" rows={2} className="input" placeholder="50% advance on confirmation, delivery within 7 working days" maxLength={2000} /></div>
      </DocForm>
    </>
  );
}
