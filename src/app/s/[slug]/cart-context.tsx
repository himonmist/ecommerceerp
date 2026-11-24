"use client";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type CartLine = { variantId: string; qty: number; name: string; title: string; price: string; image: string | null; productSlug: string };
type Cart = { lines: CartLine[]; add: (l: CartLine) => void; setQty: (variantId: string, qty: number) => void; clear: () => void; count: number; ready: boolean };

const Ctx = createContext<Cart | null>(null);
const MAX_QTY = 99;
const MAX_LINES = 50;
const EMPTY: CartLine[] = [];
const EVENT = "lv-cart-change";

// localStorage-backed external store. Snapshots are cached per raw string so React sees stable references.
const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();
function read(key: string): CartLine[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { return EMPTY; }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.lines;
  let lines = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      lines = parsed.filter((l): l is CartLine => !!l && typeof l.variantId === "string" && Number.isInteger(l.qty) && l.qty > 0).slice(0, MAX_LINES);
    }
  } catch { lines = EMPTY; }
  cache.set(key, { raw, lines });
  return lines;
}
function write(key: string, lines: CartLine[]) {
  try { localStorage.setItem(key, JSON.stringify(lines)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVENT, cb); };
}
const noopSubscribe = () => () => {};

export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const key = `lv-cart:${slug}`;
  const lines = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const add = useCallback((l: CartLine) => {
    const cur = read(key);
    const found = cur.find((c) => c.variantId === l.variantId);
    write(key, found
      ? cur.map((c) => (c.variantId === l.variantId ? { ...c, qty: Math.min(MAX_QTY, c.qty + l.qty) } : c))
      : [...cur, { ...l, qty: Math.min(MAX_QTY, l.qty) }].slice(0, MAX_LINES));
  }, [key]);
  const setQty = useCallback((id: string, qty: number) => {
    const cur = read(key);
    write(key, qty <= 0 ? cur.filter((c) => c.variantId !== id) : cur.map((c) => (c.variantId === id ? { ...c, qty: Math.min(MAX_QTY, qty) } : c)));
  }, [key]);
  const clear = useCallback(() => write(key, []), [key]);
  const value = useMemo(() => ({ lines, add, setQty, clear, count: lines.reduce((a, l) => a + l.qty, 0), ready }), [lines, add, setQty, clear, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}

export function CartCount() {
  const { count, ready } = useCart();
  if (!ready || count === 0) return null;
  return <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white" data-testid="cart-count">{count}</span>;
}
