"use client";
import { useActionState, useMemo, useState } from "react";
import { ActionForm, Field, FormError, FormSuccess, Submit } from "@/components/form";
import { METHOD_LABEL, PAYMENT_METHODS, allocateFIFO } from "@/lib/erp";
import { formatBDT } from "@/lib/money";
import type { ActionState } from "@/server/next/action";
import type { VariantOption } from "@/server/services/modules";
import { DocumentEditor } from "./document-editor";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;
const today = () => new Date().toISOString().slice(0, 10);

/** Header fields (server-rendered children) + line editor + submit. */
export function DocForm({ action, options, mode, payments, submit, maxPayLabel, children }: {
  action: Act; options: VariantOption[]; mode: "sale" | "purchase"; payments?: boolean; submit: string; maxPayLabel?: string; children: React.ReactNode;
}) {
  const [state, act] = useActionState(action, undefined);
  const f = state?.fields ?? {};
  const fieldErrors = Object.entries(f).filter(([k]) => !k.startsWith("items") && !k.startsWith("payments"));
  return (
    <ActionForm action={act} state={state} className="space-y-6" noValidate>
      <FormError message={state?.error} />
      {fieldErrors.length > 0 && <ul className="text-sm text-rose-600">{fieldErrors.map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}
      <section className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">{children}</section>
      <DocumentEditor options={options} mode={mode} payments={payments} maxPayLabel={maxPayLabel}
        errors={{ items: f.items ?? Object.entries(f).find(([k]) => k.startsWith("items."))?.[1] ?? "", payments: f.payments ?? "" }} />
      <div className="flex justify-end"><Submit className="btn-primary px-8 py-3" pendingText="Saving…">{submit}</Submit></div>
    </ActionForm>
  );
}

export function DateField({ name, label, required = true, defaultToday = true }: { name: string; label: string; required?: boolean; defaultToday?: boolean }) {
  return <Field label={label} name={name} type="date" required={required} defaultValue={defaultToday ? today() : undefined} />;
}

function SimpleForm({ action, children, submit, reset = true }: { action: Act; children: (f: Record<string, string>) => React.ReactNode; submit: string; reset?: boolean }) {
  const [state, act] = useActionState(action, undefined);
  return (
    <ActionForm action={act} state={state} resetOnSuccess={reset} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      {children(state?.fields ?? {})}
      <Submit pendingText="Saving…">{submit}</Submit>
    </ActionForm>
  );
}

export function CustomerForm({ action, types }: { action: Act; types: { id: string; name: string }[] }) {
  return (
    <SimpleForm action={action} submit="Add customer">
      {(f) => <>
        <Field label="Name" name="name" required error={f.name} />
        <Field label="Mobile" name="phone" required placeholder="01XXXXXXXXX" error={f.phone} />
        <div><label className="label" htmlFor="customerTypeId">Customer type</label>
          <select id="customerTypeId" name="customerTypeId" className="input"><option value="">General</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Credit limit ৳" name="creditLimit" inputMode="decimal" placeholder="0 = no limit" error={f.creditLimit} />
          <Field label="Opening due ৳" name="openingBalance" inputMode="decimal" error={f.openingBalance} />
        </div>
        <Field label="Email" name="email" type="email" error={f.email} />
        <div className="grid grid-cols-2 gap-3"><Field label="City" name="city" /><Field label="District" name="district" /></div>
        <Field label="Address" name="address" />
      </>}
    </SimpleForm>
  );
}

export function TypeForm({ action, kind }: { action: Act; kind: "customer" | "supplier" }) {
  return (
    <SimpleForm action={action} submit={`Add ${kind} type`}>
      {(f) => <>
        <Field label="Type name" name="name" required placeholder={kind === "customer" ? "Wholesaler" : "Manufacturer"} error={f.name} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" name="code" placeholder={kind === "customer" ? "WS" : "MFR"} />
          {kind === "customer" ? <Field label="Default discount %" name="discountPct" inputMode="decimal" error={f.discountPct} /> : <Field label="Description" name="description" />}
        </div>
        {kind === "customer" && <Field label="Credit days" name="creditDays" type="number" min={0} max={365} />}
      </>}
    </SimpleForm>
  );
}

export function SupplierForm({ action, types }: { action: Act; types: { id: string; name: string }[] }) {
  return (
    <SimpleForm action={action} submit="Add supplier">
      {(f) => <>
        <Field label="Supplier name" name="name" required error={f.name} />
        <div><label className="label" htmlFor="supplierTypeId">Supplier type</label>
          <select id="supplierTypeId" name="supplierTypeId" className="input"><option value="">General</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Contact person" name="contactPerson" /><Field label="Mobile" name="phone" placeholder="01XXXXXXXXX" error={f.phone} /></div>
        <Field label="Opening payable ৳" name="openingBalance" inputMode="decimal" error={f.openingBalance} />
        <Field label="Email" name="email" type="email" error={f.email} />
        <Field label="Address" name="address" />
      </>}
    </SimpleForm>
  );
}

type Party = { id: string; name: string; outstanding: string };
type Open = { id: string; partyId: string; number: string; date: string; due: string };

/** Receive from a customer / pay a supplier, with live FIFO preview or manual allocation. */
export function MoneyForm({ action, parties, open, kind }: { action: Act; parties: Party[]; open: Open[]; kind: "receipt" | "payment" }) {
  const [state, act] = useActionState(action, undefined);
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [manual, setManual] = useState(false);
  const docs = useMemo(() => open.filter((o) => o.partyId === party), [open, party]);
  const preview = useMemo(() => allocateFIFO(/^\d+(\.\d{0,2})?$/.test(amount) ? amount : "0", docs.map((d) => ({ id: d.id, due: d.due }))), [amount, docs]);
  const p = parties.find((x) => x.id === party);
  const f = state?.fields ?? {};
  const partyField = kind === "receipt" ? "customerId" : "supplierId";
  return (
    <ActionForm action={act} state={state} resetOnSuccess className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <div><label className="label" htmlFor={partyField}>{kind === "receipt" ? "Customer" : "Supplier"}</label>
        <select id={partyField} name={partyField} className="input" value={party} onChange={(e) => setParty(e.target.value)} required>
          <option value="">Choose…</option>{parties.map((x) => <option key={x.id} value={x.id}>{x.name} — {formatBDT(x.outstanding)} due</option>)}
        </select></div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount ৳" name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} error={f.amount} />
        <Field label="Date" name="date" type="date" required defaultValue={today()} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="method">Method</label><select id="method" name="method" className="input">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></div>
        <Field label="Reference" name="reference" placeholder="TrxID, cheque #, slip #" />
      </div>
      {p && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{manual ? "Allocate manually" : "Auto-allocated (opening balance, then oldest first)"}</p>
            {docs.length > 0 && <button type="button" className="btn-ghost text-xs" onClick={() => setManual((m) => !m)}>{manual ? "Use automatic" : "Choose documents"}</button>}
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {docs.map((d) => {
              const auto = preview.allocations.find((a) => a.id === d.id)?.amount;
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="font-mono">{d.number}</span><span className="text-slate-500">{d.date}</span><span>due {formatBDT(d.due)}</span>
                  {manual ? <><input type="hidden" name={`alloc[${docs.indexOf(d)}][id]`} value={d.id} />
                    <input aria-label={`Allocate to ${d.number}`} name={`alloc[${docs.indexOf(d)}][amount]`} className="input w-28" inputMode="decimal" placeholder="0" /></>
                    : <span className="w-28 text-right font-semibold">{auto ? formatBDT(auto) : "—"}</span>}
                </li>
              );
            })}
            {docs.length === 0 && <li className="py-1.5 text-slate-500">No open documents{Number(p.outstanding) > 0 ? " — this settles the opening balance." : "."}</li>}
          </ul>
          {!manual && Number(preview.remainder) > 0 && <p className="mt-2 text-xs text-slate-500">After opening balance and documents, {formatBDT(preview.remainder)} goes to advance (opening balance is settled first if any).</p>}
        </div>
      )}
      <Field label="Note" name="notes" />
      <Submit pendingText="Saving…">{kind === "receipt" ? "Receive payment" : "Record payment"}</Submit>
    </ActionForm>
  );
}

export function ReturnForm({ action, items, kind }: { action: Act; items: { id: string; description: string; remaining: number; unit: string }[]; kind: "sale" | "purchase" }) {
  return (
    <SimpleForm action={action} submit={kind === "sale" ? "Record customer return" : "Return to supplier"}>
      {(f) => <>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center justify-between gap-3 text-sm">
              <input type="hidden" name={`ret[${i}][id]`} value={it.id} />
              <span>{it.description} <span className="text-slate-400">· {it.remaining} returnable · {it.unit}/unit</span></span>
              <input aria-label={`Return quantity for ${it.description}`} name={`ret[${i}][qty]`} type="number" min={0} max={it.remaining} defaultValue={0} className="input w-24" disabled={it.remaining === 0} />
            </li>
          ))}
        </ul>
        <Field label="Date" name="date" type="date" required defaultValue={today()} />
        <Field label="Reason" name="reason" required error={f.reason} placeholder={kind === "sale" ? "Damaged in transit" : "Defective batch"} />
        {kind === "sale" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restock" defaultChecked className="h-4 w-4" /> Put returned goods back into stock</label>}
      </>}
    </SimpleForm>
  );
}

export function ReceiveForm({ action, items }: { action: Act; items: { id: string; description: string; remaining: number }[] }) {
  return (
    <SimpleForm action={action} submit="Receive goods (GRN)">
      {() => <>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center justify-between gap-3 text-sm">
              <input type="hidden" name={`rcv[${i}][id]`} value={it.id} />
              <span>{it.description} <span className="text-slate-400">· {it.remaining} outstanding</span></span>
              <input aria-label={`Receive quantity for ${it.description}`} name={`rcv[${i}][qty]`} type="number" min={0} max={it.remaining} defaultValue={it.remaining} className="input w-24" disabled={it.remaining === 0} />
            </li>
          ))}
        </ul>
        <Field label="Received on" name="receivedDate" type="date" required defaultValue={today()} />
        <Field label="Note" name="notes" placeholder="Transporter, challan #" />
      </>}
    </SimpleForm>
  );
}

export function BillGrnForm({ action }: { action: Act }) {
  return (
    <SimpleForm action={action} submit="Create bill" reset={false}>
      {() => <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Bill date" name="billDate" type="date" required defaultValue={today()} />
        <Field label="Due date" name="dueDate" type="date" />
        <Field label="Supplier bill #" name="supplierBillNo" />
      </div>}
    </SimpleForm>
  );
}

export function StatusForm({ action, options }: { action: Act; options: { value: string; label: string }[] }) {
  return (
    <SimpleForm action={action} submit="Update status" reset={false}>
      {() => <select name="status" className="input" aria-label="Status">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
    </SimpleForm>
  );
}

export function ConvertForm({ action }: { action: Act }) {
  return (
    <SimpleForm action={action} submit="Convert to invoice" reset={false}>
      {() => <Field label="Invoice date" name="invoiceDate" type="date" required defaultValue={today()} />}
    </SimpleForm>
  );
}

export function VoidForm({ action, label }: { action: Act; label: string }) {
  return (
    <SimpleForm action={action} submit={label} reset={false}>
      {() => <Field label="Reason" name="reason" required placeholder="Entered twice" />}
    </SimpleForm>
  );
}

export function PrintButton() {
  return <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>Print</button>;
}
