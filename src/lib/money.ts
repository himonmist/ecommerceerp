import Decimal from "decimal.js";

export type MoneyInput = string | number | { toString(): string };
const d = (v: MoneyInput) => new Decimal(v.toString());
const fmt = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

export function computeTotals(lines: { unitPrice: MoneyInput; qty: number }[], shipping: MoneyInput, discount: MoneyInput) {
  const subtotal = lines.reduce((acc, l) => acc.plus(d(l.unitPrice).times(l.qty)), new Decimal(0));
  const disc = Decimal.min(d(discount), subtotal);
  const total = subtotal.minus(disc).plus(d(shipping));
  return { subtotal: fmt(subtotal), discount: fmt(disc), shipping: fmt(d(shipping)), total: fmt(total) };
}

export function lineTotal(unitPrice: MoneyInput, qty: number) {
  return fmt(d(unitPrice).times(qty));
}

export function couponDiscount(c: { discountType: string; value: MoneyInput; minOrder: MoneyInput }, subtotal: MoneyInput) {
  const sub = d(subtotal);
  if (sub.lessThan(d(c.minOrder))) return "0.00";
  const raw = c.discountType === "percent" ? sub.times(d(c.value)).dividedBy(100) : d(c.value);
  return fmt(Decimal.min(raw, sub));
}

const bdt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatBDT(v: MoneyInput) {
  return `৳${bdt.format(Number(fmt(d(v))))}`;
}
