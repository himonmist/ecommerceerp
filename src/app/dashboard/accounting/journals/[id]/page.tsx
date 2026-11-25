import Link from "next/link";
import { requireAccounting, sourceLink, SOURCE_LABEL } from "@/server/next/accounting";
import { load } from "@/server/next/erp";
import { getJournal } from "@/server/services/accounting/vouchers";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { FormSuccess } from "@/components/form";
import { PageHeader, StatusBadge } from "@/components/ui";
import { PrintButton } from "../../../erp/forms";
import { JournalActions } from "../../forms";
import { journalAction } from "../../actions";

export const metadata = { title: "Journal entry" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function JournalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; done?: string }> }) {
  const { ctx } = await requireAccounting();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const j = await load(id, () => getJournal(ctx, id));
  const link = sourceLink(j.sourceType, j.sourceId);
  const canManage = hasPermission(ctx.permissions, "accounting.manage") && !ctx.readOnly;
  const dr = j.lines.reduce((s, l) => s + Number(l.debit), 0);
  const cr = j.lines.reduce((s, l) => s + Number(l.credit), 0);
  const msg = sp.created ? (j.status === "draft" ? "Saved as draft — not posted yet." : "Voucher posted to the ledger.") : sp.done === "approve" ? "Approved and posted." : sp.done === "verify" ? "Verified." : sp.done === "cancel" ? (j.status === "void" ? "Draft discarded." : "Cancelled — a reversal entry was posted.") : null;
  return (
    <>
      <Link href="/dashboard/accounting/journals" className="text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden">← Entries</Link>
      <PageHeader title={`${j.voucherType === "SYS" ? "Journal entry" : `${j.voucherType} voucher`} ${j.number}`} subtitle={`${ymd(j.date)} · ${j.description}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={j.status} /><PrintButton /></div>} />
      {msg && <div className="mb-6 print:hidden"><FormSuccess message={msg} /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <table className="w-full"><thead><tr><th className="th">Account</th><th className="th">Memo</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {j.lines.map((l) => <tr key={l.id}><td className="td"><span className="font-mono text-slate-500">{l.account.code}</span> {l.account.name}</td><td className="td text-slate-500">{l.memo ?? ""}</td><td className="td text-right">{Number(l.debit) ? formatBDT(l.debit) : ""}</td><td className="td text-right">{Number(l.credit) ? formatBDT(l.credit) : ""}</td></tr>)}
            </tbody>
            <tfoot className="border-t-2 border-slate-200"><tr><td className="td font-bold" colSpan={2}>Total</td><td className="td text-right font-bold">{formatBDT(dr)}</td><td className="td text-right font-bold">{formatBDT(cr)}</td></tr></tfoot>
          </table>
        </section>
        <div className="space-y-6 print:hidden">
          <section className="card p-5 text-sm">
            <h2 className="font-bold">Details</h2>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between"><dt className="text-slate-500">Source</dt><dd>{link ? <Link className="text-brand-700 hover:underline" href={link}>{SOURCE_LABEL[j.sourceType ?? ""] ?? j.sourceType}</Link> : SOURCE_LABEL[j.sourceType ?? ""] ?? j.sourceType}</dd></div>
              {j.reference && <div className="flex justify-between"><dt className="text-slate-500">Reference</dt><dd className="font-mono">{j.reference}</dd></div>}
              {j.reversedById && <div className="flex justify-between"><dt className="text-slate-500">Reversed by</dt><dd><Link className="text-brand-700 hover:underline" href={`/dashboard/accounting/journals/${j.reversedById}`}>reversal entry</Link></dd></div>}
              {j.reversesJournalId && <div className="flex justify-between"><dt className="text-slate-500">Reverses</dt><dd><Link className="text-brand-700 hover:underline" href={`/dashboard/accounting/journals/${j.reversesJournalId}`}>original entry</Link></dd></div>}
              {j.cancelReason && <div className="flex justify-between"><dt className="text-slate-500">Reason</dt><dd>{j.cancelReason}</dd></div>}
            </dl>
          </section>
          {canManage && j.voucherType !== "SYS" && !j.reversesJournalId && ["draft", "approved", "verified"].includes(j.status) && (
            <section className="card p-5"><h2 className="mb-3 font-bold">Actions</h2><JournalActions action={journalAction.bind(null, j.id)} status={j.status} canVerify={hasPermission(ctx.permissions, "accounting.verify")} isSystem={false} /></section>
          )}
        </div>
      </div>
    </>
  );
}
