"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { computeDocument } from "@/lib/erp";
import { formatBDT } from "@/lib/money";
import type { PosItem } from "@/server/services/pos";
import { findCustomerAction, posSaleAction, type SaleResult } from "../actions";

type Line = { id: string; qty: number };
type Tender = "cash" | "card" | "bkash" | "nagad";
type Customer = { id: string; name: string; phone: string; advance: string } | null;
const TENDERS: { key: Tender; label: string; hint?: string }[] = [
  { key: "cash", label: "Cash", hint: "F9" }, { key: "card", label: "Card", hint: "F10" }, { key: "bkash", label: "bKash" }, { key: "nagad", label: "Nagad" },
];
const num = (s: string) => (/^\d+(\.\d{0,2})?$/.test(s) ? Number(s) : 0);

export function Register({ shiftId, shiftNumber, registerName, storeName, catalog }: { shiftId: string; shiftNumber: string; registerName: string; storeName: string; catalog: PosItem[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [tenders, setTenders] = useState<Record<Tender, string>>({ cash: "", card: "", bkash: "", nagad: "" });
  const [refs, setRefs] = useState<Record<Tender, string>>({ cash: "", card: "", bkash: "", nagad: "" });
  const [customer, setCustomer] = useState<Customer>(null);
  const [useAdvance, setUseAdvance] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<(Extract<SaleResult, { ok: true }> & { lines: { label: string; qty: number; price: string }[]; discount: string; at: string; tendered: Record<Tender, string> }) | null>(null);
  const [pending, start] = useTransition();
  const [sold, setSold] = useState<Record<string, number>>({}); // sold this session, until the next page load
  const search = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, { ...c, available: c.available - (sold[c.id] ?? 0) }])), [catalog, sold]);
  const categories = useMemo(() => ["All", ...new Set(catalog.map((c) => c.category))], [catalog]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...byId.values()].filter((c) => (cat === "All" || c.category === cat) && (!t || c.label.toLowerCase().includes(t) || c.sku.toLowerCase().includes(t) || c.barcode === t)).slice(0, 60);
  }, [byId, q, cat]);

  const doc = useMemo(() => {
    try {
      return computeDocument(lines.map((l) => ({ qty: l.qty, unitPrice: byId.get(l.id)!.price })), { discount: String(num(discount)) });
    } catch { return null; }
  }, [lines, discount, byId]);
  const total = Number(doc?.total ?? 0);
  const advance = customer && useAdvance ? Math.min(Number(customer.advance), total) : 0;
  const nonCash = num(tenders.card) + num(tenders.bkash) + num(tenders.nagad);
  const cashDue = Math.max(0, total - advance - nonCash);
  const change = Math.max(0, num(tenders.cash) - cashDue);
  const covered = lines.length > 0 && nonCash <= total - advance + 0.001 && num(tenders.cash) + 0.001 >= cashDue;

  const add = useCallback((id: string) => {
    const item = byId.get(id);
    if (!item) return;
    setError("");
    setLines((ls) => {
      const cur = ls.find((l) => l.id === id);
      if ((cur?.qty ?? 0) + 1 > item.available) { setError(`Only ${item.available} of ${item.label} in stock here.`); return ls; }
      return cur ? ls.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { id, qty: 1 }];
    });
  }, [byId]);
  const setQty = (id: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.id !== id) : ls.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, byId.get(id)!.available) } : l))));
  const reset = useCallback(() => {
    setLines([]); setDiscount(""); setTenders({ cash: "", card: "", bkash: "", nagad: "" }); setRefs({ cash: "", card: "", bkash: "", nagad: "" });
    setCustomer(null); setUseAdvance(false); setPhone(""); setError(""); setReceipt(null); setQ(""); search.current?.focus();
  }, []);
  /** Put the whole remaining amount on one tender. */
  const exact = (t: Tender) => setTenders({ cash: "", card: "", bkash: "", nagad: "", [t]: Math.max(0, total - advance).toFixed(2) });

  const complete = useCallback(() => {
    if (!covered || pending) return;
    setError("");
    const payload = {
      customerId: customer?.id, useAdvance: !!(customer && useAdvance), discount: discount || undefined,
      items: lines.map((l) => ({ variantId: l.id, qty: l.qty })),
      tenders: (Object.keys(tenders) as Tender[]).filter((t) => num(tenders[t]) > 0).map((t) => ({ method: t, amount: num(tenders[t]).toFixed(2), reference: refs[t] || undefined })),
    };
    start(async () => {
      const res = await posSaleAction(shiftId, payload);
      if (!res.ok) { setError(res.error); return; }
      setReceipt({ ...res, lines: lines.map((l) => ({ label: byId.get(l.id)!.label, qty: l.qty, price: byId.get(l.id)!.price })), discount: doc?.discount ?? "0", at: new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }), tendered: tenders });
      setSold((cur) => { const n = { ...cur }; for (const l of lines) n[l.id] = (n[l.id] ?? 0) + l.qty; return n; });
    });
  }, [covered, pending, customer, useAdvance, discount, lines, tenders, refs, shiftId, byId, doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); search.current?.focus(); }
      else if (e.key === "F9") { e.preventDefault(); exact("cash"); }
      else if (e.key === "F10") { e.preventDefault(); exact("card"); }
      else if (e.key === "F12" || (e.key === "Enter" && e.ctrlKey)) { e.preventDefault(); complete(); }
      else if (e.key === "Escape" && receipt) { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { search.current?.focus(); }, []);

  const lookup = () => start(async () => {
    const c = await findCustomerAction(phone);
    if (!c) { setError("No customer with that phone. The sale will be a walk-in."); setCustomer(null); return; }
    setError(""); setCustomer(c);
  });

  return (
    <>
      <div className="grid gap-4 print:hidden xl:grid-cols-[1fr_420px]">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search or scan"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = q.trim().toLowerCase();
                const hit = catalog.find((c) => c.barcode && c.barcode === q.trim()) ?? catalog.find((c) => c.sku.toLowerCase() === t) ?? shown[0];
                if (hit) { add(hit.id); setQ(""); }
              }}
              placeholder="Search or scan barcode (F2)" className="input max-w-md flex-1 py-3 text-base" />
            <span className="text-sm text-slate-500">{registerName} · shift {shiftNumber}</span>
            <Link href={`/dashboard/pos/shifts/${shiftId}`} className="btn-secondary ml-auto">Cash &amp; close shift</Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${c === cat ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{c}</button>)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {shown.map((c) => (
              <button key={c.id} type="button" onClick={() => add(c.id)} disabled={c.available <= 0} aria-label={`Add ${c.label}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                <span className="line-clamp-2 min-h-10 text-sm font-semibold text-slate-900">{c.label}</span>
                <span className="mt-2 text-base font-extrabold text-brand-700">{formatBDT(c.price)}</span>
                <span className={`mt-1 text-xs ${c.available <= 0 ? "text-rose-600" : c.available <= 5 ? "text-amber-600" : "text-slate-400"}`}>{c.available <= 0 ? "Out of stock" : `${c.available} in stock`}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-500">No products match.</p>}
          </div>
        </section>

        <aside className="card flex h-fit flex-col p-4 xl:sticky xl:top-4">
          <h2 className="font-bold">Current sale</h2>
          {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-auto" aria-label="Cart">
            {lines.map((l) => { const it = byId.get(l.id)!; return (
              <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.label}</span><span className="text-xs text-slate-500">{formatBDT(it.price)} each</span></span>
                <button type="button" className="h-7 w-7 rounded-lg bg-slate-100" aria-label={`Less ${it.label}`} onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                <span className="w-6 text-center font-semibold" data-testid="line-qty">{l.qty}</span>
                <button type="button" className="h-7 w-7 rounded-lg bg-slate-100" aria-label={`More ${it.label}`} onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                <span className="w-20 text-right font-semibold">{formatBDT(Number(it.price) * l.qty)}</span>
              </li>
            ); })}
            {lines.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Scan or tap a product to start.</li>}
          </ul>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="flex gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Customer phone" placeholder="Customer phone (optional)" className="input py-2" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} />
              <button type="button" className="btn-secondary" onClick={lookup}>Find</button>
            </div>
            {customer && <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
              <span><strong>{customer.name}</strong>{Number(customer.advance) > 0 && <> · credit {formatBDT(customer.advance)}</>}</span>
              <span className="flex items-center gap-3">{Number(customer.advance) > 0 && <label className="flex items-center gap-1"><input type="checkbox" checked={useAdvance} onChange={(e) => setUseAdvance(e.target.checked)} /> Use credit</label>}
                <button type="button" className="text-slate-500 hover:text-rose-600" onClick={() => { setCustomer(null); setUseAdvance(false); }} aria-label="Remove customer">✕</button></span>
            </div>}
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-500">Discount</span>
            {[5, 10, 15, 20].map((p) => <button key={p} type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-medium hover:bg-slate-200" onClick={() => doc && setDiscount((Number(doc.subtotal) * p / 100).toFixed(2))}>{p}%</button>)}
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Discount amount" placeholder="৳" inputMode="decimal" className="input ml-auto w-24 py-1.5" />
          </div>

          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatBDT(doc?.subtotal ?? 0)}</dd></div>
            {Number(doc?.discount ?? 0) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd>−{formatBDT(doc!.discount)}</dd></div>}
            {advance > 0 && <div className="flex justify-between"><dt className="text-slate-500">Store credit</dt><dd>−{formatBDT(advance)}</dd></div>}
            <div className="flex justify-between text-2xl font-extrabold"><dt>Total</dt><dd data-testid="pos-total">{formatBDT(total)}</dd></div>
          </dl>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {TENDERS.map((t) => (
              <div key={t.key} className="rounded-xl border border-slate-200 p-2">
                <button type="button" className="flex w-full items-center justify-between text-xs font-semibold text-slate-600" onClick={() => exact(t.key)}>
                  <span>{t.label}</span><span className="text-slate-400">{t.hint ?? "exact"}</span>
                </button>
                <input value={tenders[t.key]} onChange={(e) => setTenders((x) => ({ ...x, [t.key]: e.target.value }))} aria-label={`${t.label} amount`} inputMode="decimal" placeholder="0" className="input mt-1 py-1.5" />
                {t.key !== "cash" && num(tenders[t.key]) > 0 && <input value={refs[t.key]} onChange={(e) => setRefs((x) => ({ ...x, [t.key]: e.target.value }))} aria-label={`${t.label} reference`} placeholder="TrxID / last 4" className="input mt-1 py-1 text-xs" />}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
            <span className="text-sm">{num(tenders.cash) >= cashDue ? "Change" : "Still due"}</span>
            <span className="text-xl font-extrabold" data-testid="pos-change">{formatBDT(num(tenders.cash) >= cashDue ? change : cashDue - num(tenders.cash))}</span>
          </div>
          <button type="button" onClick={complete} disabled={!covered || pending} className="btn-primary mt-3 w-full py-4 text-base">{pending ? "Completing…" : "Complete sale (F12)"}</button>
          {lines.length > 0 && <button type="button" onClick={reset} className="btn-ghost mt-1 w-full text-sm">Clear sale</button>}
        </aside>
      </div>

      {receipt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 print:static print:block print:bg-white print:p-0" role="dialog" aria-label="Sale complete">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl print:max-w-[80mm] print:rounded-none print:p-0 print:shadow-none">
            <div className="text-center print:hidden">
              <p className="text-sm font-semibold text-emerald-600">Sale complete</p>
              <p className="mt-1 text-4xl font-extrabold">{formatBDT(receipt.change)}</p>
              <p className="text-sm text-slate-500">change to give</p>
            </div>
            <div className="mt-5 border-t border-dashed border-slate-300 pt-4 font-mono text-xs print:mt-0 print:border-0 print:pt-0" data-testid="receipt">
              <p className="text-center text-sm font-bold">{storeName}</p>
              <p className="text-center">{registerName} · {receipt.at}</p>
              <p className="text-center">Invoice {receipt.number}</p>
              <div className="my-2 border-t border-dashed border-slate-400" />
              {receipt.lines.map((l, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{l.qty} × {l.label}</span><span>{(Number(l.price) * l.qty).toFixed(2)}</span></div>)}
              <div className="my-2 border-t border-dashed border-slate-400" />
              {Number(receipt.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>-{Number(receipt.discount).toFixed(2)}</span></div>}
              <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{Number(receipt.total).toFixed(2)}</span></div>
              {(Object.keys(receipt.tendered) as Tender[]).filter((t) => num(receipt.tendered[t]) > 0).map((t) => <div key={t} className="flex justify-between"><span>{t.toUpperCase()}</span><span>{num(receipt.tendered[t]).toFixed(2)}</span></div>)}
              <div className="flex justify-between"><span>CHANGE</span><span>{Number(receipt.change).toFixed(2)}</span></div>
              <p className="mt-3 text-center">Thank you for shopping!</p>
            </div>
            <div className="mt-5 flex gap-2 print:hidden">
              <button type="button" className="btn-secondary flex-1" onClick={() => window.print()}>Print receipt</button>
              <button type="button" className="btn-primary flex-1" onClick={reset} autoFocus>New sale (Esc)</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
