import Link from "next/link";
import { PrintButton } from "../../erp/forms";

const R = [["trial-balance", "Trial balance"], ["profit-loss", "Profit & loss"], ["balance-sheet", "Balance sheet"], ["general-ledger", "General ledger"], ["vat", "VAT summary"], ["day-book", "Day book"]] as const;

export function ReportNav({ active, children }: { active: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div className="flex flex-wrap gap-2">{R.map(([k, l]) => <Link key={k} href={`/dashboard/accounting/reports/${k}`} className={`rounded-full px-4 py-1.5 text-sm font-medium ${k === active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{l}</Link>)}</div>
      <div className="flex items-center gap-2">{children}<PrintButton /></div>
    </div>
  );
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const validDate = (s: string | undefined, fallback: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback);
export function DateFilter({ fields }: { fields: { name: string; label: string; value: string }[] }) {
  return (
    <form className="flex items-end gap-2">
      {fields.map((f) => <label key={f.name} className="text-xs font-medium text-slate-600">{f.label}<input type="date" name={f.name} defaultValue={f.value} className="input mt-1 py-1.5" /></label>)}
      <button className="btn-secondary">Apply</button>
    </form>
  );
}
