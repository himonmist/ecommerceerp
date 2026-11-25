import Decimal from "decimal.js";

type M = string | number | { toString(): string };
const d = (v: M | undefined | null) => new Decimal(v == null || v === "" ? 0 : v.toString());
const f = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

export type DocLineInput = { qty: number; unitPrice: M; discount?: M; vatPct?: M };

/**
 * Document maths shared by quotations, invoices, purchase orders and bills.
 * line net = qty × price − line discount; VAT on net; total = Σnet + ΣVAT − doc discount + charges.
 */
export function computeDocument(lines: DocLineInput[], opts: { discount?: M; additionalCharge?: M }) {
  let subtotal = new Decimal(0);
  let vatTotal = new Decimal(0);
  const out = lines.map((l, i) => {
    const gross = d(l.unitPrice).times(l.qty);
    const disc = d(l.discount);
    if (disc.greaterThan(gross)) throw new Error(`Line ${i + 1}: discount is larger than the line value`);
    const net = new Decimal(f(gross.minus(disc)));
    const vat = new Decimal(f(net.times(d(l.vatPct)).dividedBy(100)));
    subtotal = subtotal.plus(net);
    vatTotal = vatTotal.plus(vat);
    return { net: f(net), vat: f(vat), lineTotal: f(net.plus(vat)) };
  });
  const beforeDiscount = subtotal.plus(vatTotal);
  const discount = Decimal.min(d(opts.discount), beforeDiscount);
  const charge = d(opts.additionalCharge);
  return { lines: out, subtotal: f(subtotal), vatTotal: f(vatTotal), discount: f(discount), additionalCharge: f(charge), total: f(beforeDiscount.minus(discount).plus(charge)) };
}

/** Allocate an amount across dues in the given (oldest-first) order. */
export function allocateFIFO(amount: M, dues: { id: string; due: M }[]) {
  let left = d(amount);
  const allocations: { id: string; amount: string }[] = [];
  for (const x of dues) {
    if (left.lessThanOrEqualTo(0)) break;
    const due = d(x.due);
    if (due.lessThanOrEqualTo(0)) continue;
    const take = Decimal.min(due, left);
    allocations.push({ id: x.id, amount: f(take) });
    left = left.minus(take);
  }
  return { allocations, remainder: f(left) };
}

export const PAYMENT_METHODS = ["cash", "bank", "bkash", "nagad", "card", "cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", bank: "Bank transfer", bkash: "bKash", nagad: "Nagad", card: "Card", cheque: "Cheque" };

export function paymentStatus(total: M, paid: M, returned: M = 0): "unpaid" | "partial" | "paid" {
  const due = d(total).minus(d(paid)).minus(d(returned));
  if (due.lessThanOrEqualTo(0)) return "paid";
  return d(paid).greaterThan(0) ? "partial" : "unpaid";
}
