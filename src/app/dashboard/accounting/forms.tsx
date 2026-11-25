"use client";
import { useActionState, useMemo, useState } from "react";
import { ActionForm, Field, FormError, FormSuccess, Submit } from "@/components/form";
import { formatBDT } from "@/lib/money";
import type { ActionState } from "@/server/next/action";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;
export type AccountOpt = { id: string; code: string; name: string; nature: string; kind: string | null };
const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;

function AccountSelect({ name, accounts, label, filter, defaultValue }: { name: string; accounts: AccountOpt[]; label: string; filter?: (a: AccountOpt) => boolean; defaultValue?: string }) {
  const list = filter ? accounts.filter(filter) : accounts;
  const groups = ["asset", "liability", "equity", "income", "expense"];
  return (
    <select name={name} aria-label={label} className="input" defaultValue={defaultValue ?? ""}>
      <option value="">Choose account…</option>
      {groups.map((g) => {
        const items = list.filter((a) => a.nature === g);
        return items.length ? <optgroup key={g} label={g[0]!.toUpperCase() + g.slice(1)}>{items.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</optgroup> : null;
      })}
    </select>
  );
}

const TITLES: Record<string, { title: string; money: string; lines: string; hint: string }> = {
  CV: { title: "Income / receipt voucher (CV)", money: "Received into", lines: "Income from", hint: "Money coming in that isn't a customer invoice payment — e.g. owner capital, interest, scrap sales." },
  DV: { title: "Expense / payment voucher (DV)", money: "Paid from", lines: "Expense for", hint: "Money going out that isn't a supplier bill — rent, salaries, utilities, ads." },
  JV: { title: "Journal voucher (JV)", money: "", lines: "", hint: "Adjustments between accounts. Debits must equal credits." },
  TM: { title: "Transfer money (TM)", money: "", lines: "", hint: "Move money between cash, bank and wallet accounts, e.g. a bank deposit." },
};

export function VoucherForm({ action, accounts, type }: { action: Act; accounts: AccountOpt[]; type: "CV" | "DV" | "JV" | "TM" }) {
  const [state, act] = useActionState(action, undefined);
  const [lines, setLines] = useState(() => (type === "JV" ? [{ k: ++seq }, { k: ++seq }] : [{ k: ++seq }]));
  const [amounts, setAmounts] = useState<Record<number, { d?: string; c?: string; a?: string }>>({});
  const money = (a: AccountOpt) => !!a.kind;
  const totals = useMemo(() => {
    const vals = Object.values(amounts);
    const n = (s?: string) => (s && /^\d+(\.\d{0,2})?$/.test(s) ? Number(s) : 0);
    return { d: vals.reduce((s, v) => s + n(v.d), 0), c: vals.reduce((s, v) => s + n(v.c), 0), a: vals.reduce((s, v) => s + n(v.a), 0) };
  }, [amounts]);
  const f = state?.fields ?? {};
  const t = TITLES[type]!;
  return (
    <ActionForm action={act} state={state} className="space-y-6" noValidate>
      <input type="hidden" name="type" value={type} />
      <FormError message={state?.error} />
      <p className="text-sm text-slate-500">{t.hint}</p>
      <section className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Date" name="date" type="date" required defaultValue={today()} />
        <Field label="Description" name="description" required maxLength={300} error={f.description} placeholder={type === "DV" ? "November showroom rent" : type === "TM" ? "Cash deposited to bank" : "Narration"} />
        <Field label="Reference" name="reference" maxLength={100} placeholder="Memo #, cheque #, slip #" />
      </section>
      {type === "TM" ? (
        <section className="card grid gap-4 p-5 sm:grid-cols-3">
          <div><label className="label">From</label><AccountSelect name="fromAccountId" label="From account" accounts={accounts} filter={money} /></div>
          <div><label className="label">To</label><AccountSelect name="toAccountId" label="To account" accounts={accounts} filter={money} /></div>
          <Field label="Amount ৳" name="amount" inputMode="decimal" required error={f.amount} />
        </section>
      ) : (
        <section className="card p-5">
          {type !== "JV" && <div className="mb-4 max-w-sm"><label className="label">{t.money}</label><AccountSelect name="moneyAccountId" label={t.money} accounts={accounts} filter={money} /></div>}
          <table className="w-full">
            <thead><tr><th className="th w-1/2">{type === "JV" ? "Account" : t.lines}</th>{type === "JV" ? <><th className="th">Debit ৳</th><th className="th">Credit ৳</th></> : <th className="th">Amount ৳</th>}<th className="th">Memo</th><th className="th" /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.k}>
                  <td className="td"><AccountSelect name={`lines[${i}][accountId]`} label={`Line ${i + 1} account`} accounts={accounts}
                    filter={type === "CV" ? (a) => !a.kind && a.nature !== "expense" : type === "DV" ? (a) => !a.kind && a.nature !== "income" : undefined} /></td>
                  {type === "JV" ? <>
                    <td className="td"><input aria-label={`Line ${i + 1} debit`} name={`lines[${i}][debit]`} className="input w-32" inputMode="decimal" onChange={(e) => setAmounts((s) => ({ ...s, [l.k]: { ...s[l.k], d: e.target.value } }))} /></td>
                    <td className="td"><input aria-label={`Line ${i + 1} credit`} name={`lines[${i}][credit]`} className="input w-32" inputMode="decimal" onChange={(e) => setAmounts((s) => ({ ...s, [l.k]: { ...s[l.k], c: e.target.value } }))} /></td>
                  </> : <td className="td"><input aria-label={`Line ${i + 1} amount`} name={`lines[${i}][amount]`} className="input w-36" inputMode="decimal" onChange={(e) => setAmounts((s) => ({ ...s, [l.k]: { a: e.target.value } }))} /></td>}
                  <td className="td"><input aria-label={`Line ${i + 1} memo`} name={`lines[${i}][memo]`} className="input" maxLength={200} /></td>
                  <td className="td">{lines.length > (type === "JV" ? 2 : 1) && <button type="button" className="btn-ghost px-2 text-rose-600" aria-label="Remove line" onClick={() => { setLines((x) => x.filter((y) => y.k !== l.k)); setAmounts((s) => { const n = { ...s }; delete n[l.k]; return n; }); }}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" className="btn-secondary" onClick={() => setLines((x) => [...x, { k: ++seq }])}>Add line</button>
            {type === "JV" ? (
              <p className={`text-sm font-semibold ${totals.d === totals.c && totals.d > 0 ? "text-emerald-700" : "text-rose-600"}`} data-testid="jv-balance">
                Debit {formatBDT(totals.d)} · Credit {formatBDT(totals.c)} {totals.d === totals.c && totals.d > 0 ? "· Balanced" : "· Not balanced"}
              </p>
            ) : <p className="text-sm font-semibold">Total {formatBDT(totals.a)}</p>}
          </div>
        </section>
      )}
      <div className="flex items-center justify-end gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="asDraft" className="h-4 w-4" /> Save as draft (not posted)</label>
        <Submit className="btn-primary px-8 py-3" pendingText="Posting…">Post voucher</Submit>
      </div>
    </ActionForm>
  );
}

export function JournalActions({ action, status, canVerify, isSystem }: { action: Act; status: string; canVerify: boolean; isSystem: boolean }) {
  const [state, act] = useActionState(action, undefined);
  return (
    <ActionForm action={act} state={state} className="space-y-3">
      <FormError message={state?.error} />
      <div className="flex flex-wrap gap-2">
        {status === "draft" && <Submit name="op" value="approve" className="btn-primary" pendingText="Posting…">Approve & post</Submit>}
        {status === "approved" && canVerify && <Submit name="op" value="verify" className="btn-primary" pendingText="Verifying…">Verify</Submit>}
      </div>
      {!isSystem && ["draft", "approved", "verified"].includes(status) && (
        <div className="flex items-end gap-2 border-t border-slate-100 pt-3">
          <div className="flex-1"><Field label={status === "draft" ? "Discard reason" : "Cancellation reason (posts a reversal)"} name="reason" placeholder="Wrong account" /></div>
          <Submit name="op" value="cancel" className="btn-secondary text-rose-700" pendingText="Cancelling…">{status === "draft" ? "Discard" : "Cancel"}</Submit>
        </div>
      )}
    </ActionForm>
  );
}

export function AccountForm({ action }: { action: Act }) {
  const [state, act] = useActionState(action, undefined);
  return (
    <ActionForm action={act} state={state} resetOnSuccess className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <Field label="Account name" name="name" required error={state?.fields?.name} placeholder="Dutch Bangla Bank" />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="nature">Type</label><select id="nature" name="nature" className="input"><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option></select></div>
        <div><label className="label" htmlFor="kind">Money account?</label><select id="kind" name="kind" className="input"><option value="">No</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="wallet">Mobile wallet</option></select></div>
      </div>
      <Field label="Group (optional)" name="groupName" placeholder="Operating Expenses" />
      <Submit pendingText="Saving…">Add account</Submit>
    </ActionForm>
  );
}

export function PeriodLockForm({ action, lockedThrough }: { action: Act; lockedThrough: string | null }) {
  const [state, act] = useActionState(action, undefined);
  return (
    <ActionForm action={act} state={state} className="space-y-3">
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <p className="text-sm text-slate-600">{lockedThrough ? <>Books are closed through <strong>{lockedThrough}</strong>. Nothing can be posted on or before that date.</> : "No period is closed yet."}</p>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Field label="Close books through" name="lockedThrough" type="date" max={today()} /></div>
        <Submit className="btn-primary" pendingText="Saving…">Close period</Submit>
      </div>
      {lockedThrough && <button name="reopen" value="1" className="btn-ghost text-sm text-rose-700">Reopen all periods</button>}
    </ActionForm>
  );
}
