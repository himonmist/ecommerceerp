"use client";
import { useActionState, useState } from "react";
import { ActionForm, Field, FormError, FormSuccess, Submit } from "@/components/form";
import type { ActionState } from "@/server/next/action";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;

function Simple({ action, submit, reset = true, children }: { action: Act; submit: string; reset?: boolean; children: (f: Record<string, string>) => React.ReactNode }) {
  const [state, act] = useActionState(action, undefined);
  return (
    <ActionForm action={act} state={state} resetOnSuccess={reset} className="space-y-3" noValidate>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      {children(state?.fields ?? {})}
      <Submit pendingText="Saving…">{submit}</Submit>
    </ActionForm>
  );
}

export function RegisterForm({ action, locations }: { action: Act; locations: { id: string; name: string }[] }) {
  return (
    <Simple action={action} submit="Add register">
      {(f) => <>
        <Field label="Register name" name="name" required placeholder="Counter 1" error={f.name} />
        <div><label className="label" htmlFor="warehouseId">Sells stock from</label>
          <select id="warehouseId" name="warehouseId" className="input">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      </>}
    </Simple>
  );
}

export function OpenShiftForm({ action }: { action: Act }) {
  return (
    <Simple action={action} submit="Open shift" reset={false}>
      {(f) => <Field label="Opening cash in drawer (float) ৳" name="openingFloat" inputMode="decimal" defaultValue="0" error={f.openingFloat} />}
    </Simple>
  );
}

export function CashMovementForm({ action }: { action: Act }) {
  return (
    <Simple action={action} submit="Record">
      {(f) => <>
        <div><label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" className="input"><option value="cash_drop">Cash drop (deposit to bank / safe)</option><option value="pay_out">Pay-out (petty expense)</option><option value="pay_in">Pay-in (float top-up)</option></select></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Amount ৳" name="amount" inputMode="decimal" required error={f.amount} /><Field label="Reason" name="reason" required error={f.reason} placeholder="Midday deposit" /></div>
      </>}
    </Simple>
  );
}

export function CloseShiftForm({ action, expected }: { action: Act; expected: string }) {
  const [counted, setCounted] = useState("");
  const diff = counted && /^\d+(\.\d{0,2})?$/.test(counted) ? Number(counted) - Number(expected) : null;
  return (
    <Simple action={action} submit="Close shift" reset={false}>
      {(f) => <>
        <Field label="Counted cash in drawer ৳" name="countedCash" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} error={f.countedCash} />
        {diff !== null && <p className={`text-sm font-semibold ${diff === 0 ? "text-emerald-700" : "text-rose-700"}`}>{diff === 0 ? "Drawer matches exactly." : `${diff > 0 ? "Over" : "Short"} by ৳${Math.abs(diff).toFixed(2)} — this will be booked to Cash Over / Short.`}</p>}
        <Field label="Notes" name="notes" placeholder="Handover notes" />
      </>}
    </Simple>
  );
}

export function LocationForm({ action }: { action: Act }) {
  return (
    <Simple action={action} submit="Add location">
      {(f) => <>
        <Field label="Location name" name="name" required placeholder="Banani Showroom" error={f.name} />
        <div><label className="label" htmlFor="type">Type</label><select id="type" name="type" className="input"><option value="showroom">Showroom / shop</option><option value="warehouse">Warehouse / godown</option></select></div>
        <Field label="Address" name="address" />
      </>}
    </Simple>
  );
}

type Opt = { id: string; label: string };
export function TransferForm({ action, locations, variants }: { action: Act; locations: Opt[]; variants: Opt[] }) {
  const [rows, setRows] = useState([0]);
  return (
    <Simple action={action} submit="Move stock">
      {(f) => <>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="fromWarehouseId">From</label><select id="fromWarehouseId" name="fromWarehouseId" className="input">{locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
          <div><label className="label" htmlFor="toWarehouseId">To</label><select id="toWarehouseId" name="toWarehouseId" className="input" defaultValue={locations[1]?.id}>{locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
        </div>
        {f.items && <p className="text-sm text-rose-600">{f.items}</p>}
        {rows.map((r, i) => (
          <div key={r} className="grid grid-cols-[1fr_6rem] gap-2">
            <select aria-label={`Item ${i + 1}`} name={`items[${i}][variantId]`} className="input"><option value="">Choose product…</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
            <input aria-label={`Quantity ${i + 1}`} name={`items[${i}][qty]`} type="number" min={1} className="input" defaultValue={1} />
          </div>
        ))}
        <button type="button" className="btn-ghost text-sm" onClick={() => setRows((x) => [...x, (x.at(-1) ?? 0) + 1])}>Add item</button>
        <div className="grid grid-cols-2 gap-3"><Field label="Date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><Field label="Carrier / driver" name="carrier" placeholder="Van #2 / Rahim" /></div>
      </>}
    </Simple>
  );
}
