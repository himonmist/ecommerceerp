import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { listSuppliers } from "@/server/services/erp/suppliers";
import { variantOptions } from "@/server/services/modules";
import { PageHeader } from "@/components/ui";
import { DateField, DocForm } from "../../forms";
import { createPurchaseOrderAction } from "../../actions";

export const metadata = { title: "New purchase order" };

export default async function NewPO() {
  const ctx = await requireErp();
  const [suppliers, options] = [await listSuppliers(ctx, { page: 1 }), await variantOptions(ctx)];
  return (
    <>
      <Link href="/dashboard/erp/purchase-orders" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Purchase orders</Link>
      <PageHeader title="Issue purchase order" subtitle="Stock increases when you receive the goods, not now." />
      <DocForm action={createPurchaseOrderAction} options={options} mode="purchase" submit="Issue purchase order">
        <div className="sm:col-span-2"><label className="label" htmlFor="supplierId">Supplier</label>
          <select id="supplierId" name="supplierId" className="input" required><option value="">Choose…</option>{suppliers.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <p className="mt-1 text-xs text-slate-500"><Link href="/dashboard/erp/suppliers" className="text-brand-600 hover:underline">Add a supplier</Link></p></div>
        <DateField name="orderDate" label="Order date" />
        <DateField name="expectedDate" label="Expected delivery" required={false} defaultToday={false} />
        <div className="sm:col-span-2 lg:col-span-4"><label className="label" htmlFor="terms">Procurement terms</label><textarea id="terms" name="terms" rows={2} className="input" maxLength={2000} placeholder="Delivery to main warehouse, inspection on arrival" /></div>
      </DocForm>
    </>
  );
}
