"use client";
import { useId, useMemo, useState } from "react";
import { computeDocument, METHOD_LABEL, PAYMENT_METHODS } from "@/lib/erp";
import { formatBDT } from "@/lib/money";
import type { VariantOption } from "@/server/services/modules";

type Row = { key: number; variantId: string; qty: string; unitPrice: string; discount: string; vatPct: string };
type Pay = { key: number; method: string; amount: string; reference: string };
let seq = 0;
const blankRow = (): Row => ({ key: ++seq, variantId: "", qty: "1", unitPrice: "", discount: "", vatPct: "" });
const num = (v: string) => (/^\d+(\.\d{0,2})?$/.test(v) ? v : "0");

function Picker({ options, value, onPick, mode }: { options: VariantOption[]; value: string; onPick: (o: VariantOption) => void; mode: "sale" | "purchase" }) {
  const current = options.find((o) => o.id === value);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? options.filter((o) => o.label.toLowerCase().includes(t) || o.sku.toLowerCase().includes(t)) : options).slice(0, 8);
  }, [q, options]);
  const choose = (o: VariantOption | undefined) => { if (!o) return; onPick(o); setOpen(false); };
  return (
    <div className="relative">
      <input className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label="Product"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        value={open ? q : current?.label ?? ""} placeholder="Search product or SKU…"
        onFocus={() => { setOpen(true); setQ(""); setActive(0); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open) { e.preventDefault(); choose(matches[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
          {matches.map((o, i) => (
            <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-brand-50" : "hover:bg-slate-50"}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              <span><span className="font-medium text-slate-900">{o.label}</span>{o.sku && <span className="ml-2 font-mono text-xs text-slate-400">{o.sku}</span>}</span>
              <span className="shrink-0 text-xs text-slate-500">{mode === "sale" ? `${o.available} in stock · ${formatBDT(o.salePrice)}` : `cost ${formatBDT(o.cost)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DocumentEditor({ options, mode, payments = false, maxPayLabel = "Pay full", errors = {} }: {
  options: VariantOption[]; mode: "sale" | "purchase"; payments?: boolean; maxPayLabel?: string; errors?: Record<string, string>;
}) {
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [discount, setDiscount] = useState("");
  const [charge, setCharge] = useState("");
  const [pays, setPays] = useState<Pay[]>([]);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const filled = rows.filter((r) => r.variantId);
  const totals = useMemo(() => {
    try {
      return computeDocument(filled.map((r) => ({ qty: Math.max(0, Number(r.qty) || 0), unitPrice: num(r.unitPrice), discount: num(r.discount), vatPct: num(r.vatPct) })), { discount: num(discount), additionalCharge: num(charge) });
    } catch {
      return null;
    }
  }, [filled, discount, charge]);
  const paidSum = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      <section className="card overflow-visible">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold">Items</h2>
          <button type="button" className="btn-secondary" onClick={() => setRows((r) => [...r, blankRow()])} disabled={rows.length >= 200}>Add line</button>
        </div>
        {errors.items && <p className="px-5 pt-3 text-sm font-medium text-rose-600">{errors.items}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th w-[34%]">Product</th><th className="th">Qty</th><th className="th">{mode === "sale" ? "Unit price ৳" : "Unit cost ৳"}</th><th className="th">Discount ৳</th><th className="th">VAT %</th><th className="th text-right">Line total</th><th className="th" /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const i = filled.indexOf(r);
                const o = byId.get(r.variantId);
                const over = mode === "sale" && o && Number(r.qty) > o.available;
                return (
                  <tr key={r.key} className="align-top">
                    <td className="td">
                      <Picker options={options} value={r.variantId} mode={mode}
                        onPick={(p) => set(r.key, { variantId: p.id, unitPrice: mode === "sale" ? p.salePrice : p.cost })} />
                      {over && <p className="mt-1 text-xs font-medium text-rose-600">Only {o.available} in stock</p>}
                      {i >= 0 && (
                        <>
                          <input type="hidden" name={`items[${i}][variantId]`} value={r.variantId} />
                        </>
                      )}
                    </td>
                    <td className="td"><input className="input w-20" inputMode="numeric" aria-label="Quantity" name={i >= 0 ? `items[${i}][qty]` : undefined} value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value.replace(/\D/g, "") })} /></td>
                    <td className="td"><input className="input w-28" inputMode="decimal" aria-label="Unit price" name={i >= 0 ? `items[${i}][unitPrice]` : undefined} value={r.unitPrice} onChange={(e) => set(r.key, { unitPrice: e.target.value })} /></td>
                    <td className="td"><input className="input w-24" inputMode="decimal" aria-label="Line discount" name={i >= 0 ? `items[${i}][discount]` : undefined} value={r.discount} onChange={(e) => set(r.key, { discount: e.target.value })} /></td>
                    <td className="td"><input className="input w-20" inputMode="decimal" aria-label="VAT percent" name={i >= 0 ? `items[${i}][vatPct]` : undefined} value={r.vatPct} onChange={(e) => set(r.key, { vatPct: e.target.value })} /></td>
                    <td className="td text-right font-semibold">{totals && i >= 0 ? formatBDT(totals.lines[i]!.lineTotal) : "—"}</td>
                    <td className="td">{rows.length > 1 && <button type="button" className="btn-ghost px-2 text-rose-600" aria-label="Remove line" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="discount">Document discount ৳</label><input id="discount" name="discount" className="input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            <div><label className="label" htmlFor="additionalCharge">Additional charge ৳</label><input id="additionalCharge" name="additionalCharge" className="input" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} /></div>
          </div>
          {payments && (
            <div>
              <div className="flex items-center justify-between">
                <p className="label mb-0">Payments now</p>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost text-sm" onClick={() => setPays((p) => [...p, { key: ++seq, method: "cash", amount: "", reference: "" }])} disabled={pays.length >= 10}>Add payment</button>
                  {totals && <button type="button" className="btn-secondary text-sm" onClick={() => setPays([{ key: ++seq, method: "cash", amount: totals.total, reference: "" }])}>{maxPayLabel}</button>}
                </div>
              </div>
              {errors.payments && <p className="mt-1 text-sm font-medium text-rose-600">{errors.payments}</p>}
              <div className="mt-2 space-y-2">
                {pays.map((p, i) => (
                  <div key={p.key} className="grid grid-cols-[1fr_1fr_1.3fr_auto] gap-2">
                    <select aria-label="Payment method" name={`payments[${i}][method]`} className="input" value={p.method} onChange={(e) => setPays((all) => all.map((x) => (x.key === p.key ? { ...x, method: e.target.value } : x)))}>
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                    <input aria-label="Payment amount" name={`payments[${i}][amount]`} className="input" inputMode="decimal" placeholder="Amount" value={p.amount} onChange={(e) => setPays((all) => all.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))} />
                    <input aria-label="Payment reference" name={`payments[${i}][reference]`} className="input" placeholder="TrxID / cheque #" value={p.reference} onChange={(e) => setPays((all) => all.map((x) => (x.key === p.key ? { ...x, reference: e.target.value } : x)))} />
                    <button type="button" className="btn-ghost px-2 text-rose-600" aria-label="Remove payment" onClick={() => setPays((all) => all.filter((x) => x.key !== p.key))}>✕</button>
                  </div>
                ))}
                {pays.length === 0 && <p className="text-sm text-slate-500">No payment now — the full amount stays due.</p>}
              </div>
            </div>
          )}
        </section>
        <section className="card p-5">
          {totals ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal (after line discounts)</dt><dd>{formatBDT(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{formatBDT(totals.vatTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd>−{formatBDT(totals.discount)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Additional charge</dt><dd>{formatBDT(totals.additionalCharge)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-extrabold"><dt>Total</dt><dd data-testid="doc-total">{formatBDT(totals.total)}</dd></div>
              {payments && <>
                <div className="flex justify-between"><dt className="text-slate-500">Paying now</dt><dd>{formatBDT(paidSum)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Due after this</dt><dd>{formatBDT(Math.max(0, Number(totals.total) - paidSum))}</dd></div>
              </>}
            </dl>
          ) : <p className="text-sm font-medium text-rose-600">A line discount is larger than its line value.</p>}
        </section>
      </div>
    </div>
  );
}
