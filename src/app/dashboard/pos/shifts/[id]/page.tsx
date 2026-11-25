import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { load } from "@/server/next/erp";
import { hasPermission } from "@/server/security/permissions";
import { shiftSummary } from "@/server/services/pos";
import { formatBDT } from "@/lib/money";
import { FormSuccess } from "@/components/form";
import { PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { PrintButton } from "../../../erp/forms";
import { CashMovementForm, CloseShiftForm } from "../../forms";
import { cashMovementAction, closeShiftAction } from "../../actions";

export const metadata = { title: "Shift" };
const LABEL: Record<string, string> = { cash: "Cash", card: "Card", bkash: "bKash", nagad: "Nagad", advance: "Store credit" };

export default async function ShiftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ closed?: string }> }) {
  const ctx = await requireCtx();
  if (!hasPermission(ctx.permissions, "pos.use")) notFound();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await load(id, () => shiftSummary(ctx, id));
  const open = s.shift.status === "open";
  const canAct = open && !ctx.readOnly;
  return (
    <>
      <Link href={open ? `/dashboard/pos/${s.shift.registerId}` : "/dashboard/pos"} className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← {open ? "Back to register" : "Registers"}</Link>
      <PageHeader title={`${open ? "Shift" : "Z-report"} ${s.shift.number}`} subtitle={`${s.shift.register.name} · opened ${fmtDate(s.shift.openedAt)}${s.shift.closedAt ? ` · closed ${fmtDate(s.shift.closedAt)}` : ""}`} action={<div className="flex items-center gap-2"><StatusBadge status={s.shift.status} /><PrintButton /></div>} />
      {sp.closed && <div className="mb-6 print:hidden"><FormSuccess message="Shift closed. This is the Z-report." /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-4"><p className="text-sm text-slate-500">Sales</p><p className="mt-1 text-2xl font-extrabold">{s.salesCount}</p></div>
            <div className="card p-4"><p className="text-sm text-slate-500">Gross sales</p><p className="mt-1 text-2xl font-extrabold">{formatBDT(s.grossSales)}</p></div>
            <div className="card p-4"><p className="text-sm text-slate-500">{open ? "Expected cash now" : "Expected cash"}</p><p className="mt-1 text-2xl font-extrabold" data-testid="expected-cash">{formatBDT(s.expectedCash)}</p></div>
          </div>
          <section className="card p-5">
            <h2 className="font-bold">By payment method</h2>
            <dl className="mt-3 space-y-1 text-sm">
              {Object.entries(s.byMethod).map(([m, v]) => <div key={m} className="flex justify-between"><dt>{LABEL[m] ?? m}</dt><dd className="font-semibold">{formatBDT(v)}</dd></div>)}
              {Object.keys(s.byMethod).length === 0 && <p className="text-slate-500">No sales yet.</p>}
            </dl>
          </section>
          <section className="card p-5">
            <h2 className="font-bold">Drawer</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Opening float</dt><dd>{formatBDT(s.shift.openingFloat)}</dd></div>
              {s.shift.movements.map((m) => <div key={m.id} className="flex justify-between"><dt>{m.type.replace("_", " ")} · {m.reason}</dt><dd>{m.type === "pay_in" ? "+" : "−"}{formatBDT(m.amount)}</dd></div>)}
              {!open && <>
                <div className="flex justify-between border-t border-slate-100 pt-1"><dt>Counted</dt><dd>{formatBDT(s.shift.countedCash!)}</dd></div>
                <div className="flex justify-between font-bold"><dt>Variance</dt><dd className={Number(s.shift.variance) !== 0 ? "text-rose-700" : "text-emerald-700"}>{formatBDT(s.shift.variance!)}</dd></div>
              </>}
            </dl>
          </section>
          <section className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-5 py-4 font-bold">Sales in this shift</h2>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {s.invoices.map((i) => <tr key={i.id}><td className="td font-mono"><Link className="text-brand-700 hover:underline" href={`/dashboard/erp/invoices/${i.id}`}>{i.number}</Link></td><td className="td">{fmtDate(i.createdAt)}</td><td className="td">{i.customerName}</td><td className="td text-right font-semibold">{formatBDT(i.total)}</td></tr>)}
              {s.invoices.length === 0 && <tr><td className="td text-slate-500">No sales yet.</td></tr>}
            </tbody></table>
          </section>
        </div>
        {canAct && (
          <div className="space-y-6 print:hidden">
            <section className="card p-5"><h2 className="mb-3 font-bold">Cash in / out</h2><CashMovementForm action={cashMovementAction.bind(null, s.shift.id)} /></section>
            <section className="card p-5"><h2 className="mb-1 font-bold">Close shift</h2><p className="mb-3 text-sm text-slate-500">Expected in drawer: <strong>{formatBDT(s.expectedCash)}</strong></p><CloseShiftForm action={closeShiftAction.bind(null, s.shift.id)} expected={s.expectedCash} /></section>
          </div>
        )}
      </div>
    </>
  );
}
