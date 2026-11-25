import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { hasPermission } from "@/server/security/permissions";
import { listWarehouses } from "@/server/services/warehouses";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { LocationForm } from "../pos/forms";
import { createWarehouseAction } from "../pos/actions";

export const metadata = { title: "Locations" };

export default async function Locations() {
  const ctx = await requireCtx();
  const locations = await listWarehouses(ctx);
  const canManage = hasPermission(ctx.permissions, "inventory.manage") && !ctx.readOnly;
  return (
    <>
      <PageHeader title="Locations" subtitle="Warehouses, godowns and showrooms. Online orders ship from the default location."
        action={<div className="flex gap-2"><Link className="btn-secondary" href="/dashboard/locations/stock">Stock by location</Link><Link className="btn-primary" href="/dashboard/locations/transfers">Transfers</Link></div>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
          {locations.map((l) => (
            <div key={l.id} className="card p-5">
              <div className="flex items-center justify-between"><h2 className="font-bold">{l.name}</h2>{l.isDefault && <span className="badge bg-brand-50 text-brand-700">Default</span>}</div>
              <p className="text-sm capitalize text-slate-500">{l.type}{l.address ? ` · ${l.address}` : ""}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Units</dt><dd className="text-xl font-extrabold">{l.units.toLocaleString("en-US")}</dd></div><div><dt className="text-slate-500">Value at cost</dt><dd className="text-xl font-extrabold">{formatBDT(l.value)}</dd></div></dl>
            </div>
          ))}
        </div>
        {canManage && <section className="card h-fit p-6"><h2 className="mb-4 font-bold">Add location</h2><LocationForm action={createWarehouseAction} /></section>}
      </div>
    </>
  );
}
