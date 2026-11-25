import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { listSuppliers } from "@/server/services/erp/suppliers";
import { variantOptions } from "@/server/services/modules";
import { PageHeader } from "@/components/ui";
import { DateField, DocForm } from "../../forms";
import { createDirectBillAction } from "../../actions";

export const metadata = { title: "Direct bill" };

export default async function NewBill() {
  const ctx = await requireErp();
  const [suppliers, options] = [await listSuppliers(ctx, { page: 1 }), await variantOptions(ctx)];
  return (
    <>
      <Link href="/dashboard/erp/bills" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Bills</Link>
      <PageHeader title="Direct vendor bill (stock in)" subtitle="Stock increases when you save, and the moving-average cost updates." />
      <DocForm action={createDirectBillAction} options={options} mode="purchase" payments maxPayLabel="Pay in full" submit="Save bill & stock in">
        <div className="sm:col-span-2"><label className="label" htmlFor="supplierId">Supplier</label>
          <select id="supplierId" name="supplierId" className="input" required><option value="">Choose…</option>{suppliers.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label" htmlFor="supplierBillNo">Supplier bill #</label><input id="supplierBillNo" name="supplierBillNo" className="input" maxLength={60} /></div>
        <DateField name="billDate" label="Bill date" />
        <DateField name="dueDate" label="Due date" required={false} defaultToday={false} />
        <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor="notes">Notes</label><input id="notes" name="notes" className="input" maxLength={1000} /></div>
      </DocForm>
    </>
  );
}
