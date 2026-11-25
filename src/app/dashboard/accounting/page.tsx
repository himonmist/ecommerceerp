import Link from "next/link";
import { requireAccounting } from "@/server/next/accounting";
import { balancesByKey, cashBook, profitAndLoss } from "@/server/services/accounting/reports";
import { listJournals } from "@/server/services/accounting/vouchers";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { FormSuccess } from "@/components/form";
import { PageHeader, StatusBadge } from "@/components/ui";
import { PeriodLockForm } from "./forms";
import { periodLockAction, setupLedgerAction } from "./actions";

export const metadata = { title: "Accounting" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function AccountingHome({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { ctx, status } = await requireAccounting({ active: false });
  const sp = await searchParams;
  const canManage = hasPermission(ctx.permissions, "accounting.manage") && !ctx.readOnly;
  if (!status.active) {
    return (
      <>
        <PageHeader title="Accounting" subtitle="Double-entry books that write themselves from your sales, purchases and stock." />
        <section className="card max-w-2xl p-8">
          <h2 className="text-lg font-bold">Set up accounting for this store</h2>
          <p className="mt-2 text-sm text-slate-600">We&apos;ll create a chart of accounts and one opening entry from what you have today: stock at cost, customer dues, supplier payables and advances. From then on, every invoice, receipt, bill, payment, return and stock change posts automatically.</p>
          {canManage ? <form action={setupLedgerAction} className="mt-6"><button className="btn-primary">Set up accounting</button></form> : <p className="mt-6 text-sm text-slate-500">Ask the store owner to set this up.</p>}
        </section>
      </>
    );
  }
  const now = new Date();
  const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const [bal, cash, pl, recent] = [await balancesByKey(ctx), await cashBook(ctx), await profitAndLoss(ctx, { from: monthStart, to: ymd(now) }), await listJournals(ctx, {})];
  const neg = (v?: string) => (-Number(v ?? 0)).toFixed(2);
  const vatDue = (-Number(bal.vat_out ?? 0) - Number(bal.vat_in ?? 0)).toFixed(2);
  const vouchers = [
    { type: "DV", label: "Expense (DV)", icon: Icon.chart, tint: "from-rose-500 to-pink-500" },
    { type: "CV", label: "Income (CV)", icon: Icon.chart, tint: "from-emerald-500 to-teal-500" },
    { type: "TM", label: "Transfer (TM)", icon: Icon.truck, tint: "from-sky-500 to-indigo-500" },
    { type: "JV", label: "Journal (JV)", icon: Icon.layers, tint: "from-violet-500 to-fuchsia-500" },
  ];
  return (
    <>
      <PageHeader title="Accounting" subtitle={`Books started ${ymd(status.startedAt!)}${status.lockedThrough ? ` · closed through ${ymd(status.lockedThrough)}` : ""}`}
        action={<Link className="btn-secondary" href="/dashboard/accounting/reports/trial-balance">Reports</Link>} />
      {sp.setup && <div className="mb-6"><FormSuccess message="Accounting is set up. Your opening balances are posted." /></div>}
      {canManage && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {vouchers.map(({ type, label, icon: I, tint }) => (
          <Link key={type} href={`/dashboard/accounting/vouchers/new?type=${type}`} className={`rounded-2xl bg-gradient-to-br ${tint} p-4 text-white shadow-lg transition hover:-translate-y-0.5`}><I className="h-6 w-6" /><p className="mt-5 text-sm font-bold">New {label}</p></Link>
        ))}
      </div>}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[["Net profit this month", pl.netProfit], ["Receivable", bal.ar ?? "0"], ["Payable", neg(bal.ap)], ["VAT payable (net)", vatDue]].map(([k, v]) => (
          <div key={k} className="card p-5"><p className="text-sm text-slate-500">{k}</p><p className={`mt-2 text-2xl font-extrabold ${Number(v) < 0 ? "text-rose-700" : ""}`}>{formatBDT(v!)}</p></div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="font-bold">Cash & bank</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {cash.map((a) => <li key={a.id} className="flex justify-between py-2"><Link className="hover:text-brand-700" href={`/dashboard/accounting/reports/general-ledger?account=${a.id}`}>{a.name}</Link><span className="font-semibold">{formatBDT(a.balance)}</span></li>)}
          </ul>
        </section>
        <section className="card overflow-x-auto lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Recent entries</h2><Link href="/dashboard/accounting/journals" className="text-sm font-semibold text-brand-600 hover:underline">All entries</Link></div>
          <table className="w-full"><tbody className="divide-y divide-slate-100">
            {recent.items.slice(0, 8).map((j) => <tr key={j.id}><td className="td font-mono"><Link className="text-brand-700 hover:underline" href={`/dashboard/accounting/journals/${j.id}`}>{j.number}</Link></td><td className="td">{ymd(j.date)}</td><td className="td">{j.description}</td><td className="td text-right font-semibold">{formatBDT(j.amount)}</td><td className="td"><StatusBadge status={j.status} /></td></tr>)}
            {recent.items.length === 0 && <tr><td className="td text-slate-500">No entries yet.</td></tr>}
          </tbody></table>
        </section>
      </div>
      {hasPermission(ctx.permissions, "accounting.verify") && !ctx.readOnly && (
        <section className="card mt-8 max-w-xl p-5"><h2 className="mb-3 font-bold">Close the books</h2><PeriodLockForm action={periodLockAction} lockedThrough={status.lockedThrough ? ymd(status.lockedThrough) : null} /></section>
      )}
    </>
  );
}
