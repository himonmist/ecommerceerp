import Link from "next/link";
import { requireErp } from "@/server/next/erp";
import { customerAging } from "@/server/services/erp/customers";
import { supplierAging } from "@/server/services/erp/suppliers";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "../forms";

export const metadata = { title: "Dues & aging" };

type Row = { opening: string; current: string; d31_60: string; d61_90: string; d90plus: string; total: string; advance?: string };
function Aging({ title, rows, totals, href }: { title: string; rows: (Row & { id: string; name: string; phone: string | null })[]; totals: Row; href?: (id: string) => string }) {
  const cols: [keyof Row, string][] = [["opening", "Opening"], ["current", "0–30 days"], ["d31_60", "31–60"], ["d61_90", "61–90"], ["d90plus", "90+ days"], ["total", "Total due"], ["advance", "Advance"]];
  return (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-slate-100 px-5 py-4 font-bold">{title}</h2>
      <table className="w-full"><thead><tr><th className="th">Name</th>{cols.map(([, l]) => <th key={l} className="th text-right">{l}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => <tr key={r.id}><td className="td">{href ? <Link href={href(r.id)} className="font-medium text-brand-700 hover:underline">{r.name}</Link> : r.name}<span className="block text-xs text-slate-400">{r.phone}</span></td>
            {cols.map(([k]) => <td key={k} className={`td text-right ${k === "total" ? "font-bold" : ""} ${k === "d90plus" && Number(r[k]) > 0 ? "text-rose-700" : ""}`}>{formatBDT(r[k] ?? "0")}</td>)}</tr>)}
          {rows.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>Nothing outstanding.</td></tr>}
        </tbody>
        <tfoot className="border-t-2 border-slate-200"><tr><td className="td font-bold">Total</td>{cols.map(([k]) => <td key={k} className="td text-right font-bold">{k === "advance" ? "" : formatBDT(totals[k] ?? "0")}</td>)}</tr></tfoot>
      </table>
    </section>
  );
}

export default async function Reports() {
  const ctx = await requireErp();
  const ar = hasPermission(ctx.permissions, "sales.view") ? await customerAging(ctx) : null;
  const ap = hasPermission(ctx.permissions, "purchase.view") ? await supplierAging(ctx) : null;
  return (
    <>
      <PageHeader title="Receivables & payables aging" subtitle={`As of ${new Date().toISOString().slice(0, 10)}, aged by invoice / bill date.`} action={<PrintButton />} />
      <div className="space-y-8">
        {ar && <Aging title="Customer dues (AR)" rows={ar.rows.map((r) => ({ ...r, id: r.customerId }))} totals={ar.totals} href={(id) => `/dashboard/erp/customers/${id}`} />}
        {ap && <Aging title="Supplier payables (AP)" rows={ap.rows.map((r) => ({ ...r, id: r.supplierId }))} totals={ap.totals} />}
      </div>
    </>
  );
}
