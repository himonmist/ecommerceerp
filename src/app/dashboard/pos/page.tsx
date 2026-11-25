import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { hasPermission } from "@/server/security/permissions";
import { listRegisters, listShifts } from "@/server/services/pos";
import { listWarehouses } from "@/server/services/warehouses";
import { Empty, PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { RegisterForm } from "./forms";
import { createRegisterAction } from "./actions";

export const metadata = { title: "Point of sale" };

export default async function Pos() {
  const ctx = await requireCtx();
  if (!hasPermission(ctx.permissions, "pos.use")) notFound();
  const [registers, shifts] = [await listRegisters(ctx), await listShifts(ctx)];
  const canManage = hasPermission(ctx.permissions, "pos.manage") && !ctx.readOnly;
  const locations = canManage ? await listWarehouses(ctx) : [];
  return (
    <>
      <PageHeader title="Point of sale" subtitle="Counter sales with barcode scanning, split payment and cash shifts." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {registers.length === 0 ? <Empty title="No registers yet" body="Add a register and choose which location it sells from." /> : (
            <div className="grid gap-4 sm:grid-cols-2">
              {registers.map((r) => (
                <Link key={r.id} href={`/dashboard/pos/${r.id}`} className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{r.name}</h2><StatusBadge status={r.openShift ? "open" : "closed"} /></div>
                  <p className="mt-1 text-sm text-slate-500">Sells from {r.location}</p>
                  <p className="mt-4 text-sm font-semibold text-brand-700 group-hover:underline">{r.openShift ? `Continue shift ${r.openShift.number} →` : "Open a shift →"}</p>
                </Link>
              ))}
            </div>
          )}
          <section className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-5 py-4 font-bold">Recent shifts</h2>
            <table className="w-full"><thead><tr><th className="th">Shift</th><th className="th">Register</th><th className="th">Opened</th><th className="th text-right">Variance</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map((s) => <tr key={s.id}><td className="td font-mono"><Link className="text-brand-700 hover:underline" href={`/dashboard/pos/shifts/${s.id}`}>{s.number}</Link></td><td className="td">{s.register.name}</td><td className="td">{fmtDate(s.openedAt)}</td><td className={`td text-right ${s.variance && Number(s.variance) !== 0 ? "font-semibold text-rose-700" : ""}`}>{s.variance ? s.variance.toString() : "—"}</td><td className="td"><StatusBadge status={s.status} /></td></tr>)}
                {shifts.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>No shifts yet.</td></tr>}
              </tbody></table>
          </section>
        </div>
        {canManage && <section className="card h-fit p-6"><h2 className="mb-4 font-bold">Add register</h2><RegisterForm action={createRegisterAction} locations={locations.map((l) => ({ id: l.id, name: l.name }))} /></section>}
      </div>
    </>
  );
}
