import "server-only";
import Decimal from "decimal.js";
import type { Tx } from "@/server/db/tenant";
import { METHOD_ACCOUNT } from "./coa";
import { post, reverseSource, type Actor, type LineIn } from "./ledger";

const D = (v: { toString(): string } | string | number | null | undefined) => new Decimal(v == null ? 0 : v.toString());
const r2 = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const money = (method: string) => METHOD_ACCOUNT[method] ?? "cash";

/** Sales invoice: Dr AR / Cr Sales, VAT output, other income; Dr sales discount; Dr COGS / Cr Inventory. */
export async function postInvoice(tx: Tx, a: Actor, invoiceId: string) {
  const inv = await tx.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true } });
  const cost = inv.items.reduce((s, i) => s.plus(D(i.unitCost).times(i.qty)), new Decimal(0));
  const party = { partyType: "customer" as const, partyId: inv.customerId };
  const j = await post(tx, a, {
    date: inv.invoiceDate, description: `Sales invoice ${inv.number} — ${inv.customerName}`, reference: inv.number, sourceType: "sales_invoice", sourceId: inv.id,
    lines: [
      { key: "ar", debit: inv.total, ...party },
      { key: "sales_discount", debit: inv.discount },
      { key: "sales", credit: inv.subtotal },
      { key: "vat_out", credit: inv.vatTotal },
      { key: "other_income", credit: inv.additionalCharge, memo: "Additional charge" },
      { key: "cogs", debit: r2(cost) },
      { key: "inventory", credit: r2(cost) },
    ],
  });
  if (j) await tx.salesInvoice.update({ where: { id: inv.id }, data: { journalId: j.id } });
  return j;
}

/** Customer receipt: Dr money (or customer advance when applying advance) / Cr AR, Cr customer advance for any excess. */
export async function postReceipt(tx: Tx, a: Actor, receiptId: string) {
  const r = await tx.customerReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  const party = { partyType: "customer" as const, partyId: r.customerId };
  const lines: LineIn[] = r.method === "advance"
    ? [{ key: "customer_advance", debit: r.amount, ...party }, { key: "ar", credit: r.amount, ...party }]
    : [{ key: money(r.method), debit: r.amount, memo: r.reference ?? undefined },
       { key: "ar", credit: D(r.amount).minus(D(r.toAdvance)), ...party },
       { key: "customer_advance", credit: r.toAdvance, ...party }];
  const j = await post(tx, a, { date: r.date, description: `Money receipt ${r.number}`, reference: r.number, sourceType: "customer_receipt", sourceId: r.id, lines });
  if (j) await tx.customerReceipt.update({ where: { id: r.id }, data: { journalId: j.id } });
  return j;
}

/** Split a returned value into its net and VAT parts using the original line. */
function shares(line: { qty: number; lineTotal: { toString(): string }; unitPrice?: { toString(): string }; unitCost?: { toString(): string }; discount: { toString(): string } }, qty: number, price: { toString(): string }) {
  const net = D(price).times(line.qty).minus(D(line.discount));
  const total = r2(D(line.lineTotal).dividedBy(line.qty).times(qty));
  const netShare = r2(net.dividedBy(line.qty).times(qty));
  return { total, netShare, vatShare: total.minus(netShare) };
}

/** Customer return: Dr sales returns + VAT output / Cr AR, customer advance or cash refund; restock Dr Inventory / Cr COGS. */
export async function postSalesReturn(tx: Tx, a: Actor, returnId: string) {
  const ret = await tx.salesReturn.findUniqueOrThrow({ where: { id: returnId }, include: { items: true, invoice: { include: { items: true } } } });
  let net = new Decimal(0); let cost = new Decimal(0); let total = new Decimal(0);
  for (const ri of ret.items) {
    const it = ret.invoice.items.find((x) => x.id === ri.invoiceItemId)!;
    const s = shares(it, ri.qty, it.unitPrice);
    net = net.plus(s.netShare); total = total.plus(s.total);
    cost = cost.plus(D(it.unitCost).times(ri.qty));
  }
  total = D(ret.amount); // the document's own rounding wins; VAT absorbs any cent difference
  const party = { partyType: "customer" as const, partyId: ret.customerId };
  return post(tx, a, {
    date: ret.date, description: `Sales return ${ret.number} on ${ret.invoice.number}`, reference: ret.number, sourceType: "sales_return", sourceId: ret.id,
    lines: [
      { key: "sales_returns", debit: net },
      { key: "vat_out", debit: total.minus(net) },
      { key: "ar", credit: ret.reduceDue, ...party },
      { key: "customer_advance", credit: ret.toAdvance, ...party },
      { key: "cash", credit: ret.refundAmount, memo: "Cash refund" },
      ...(ret.restock ? [{ key: "inventory", debit: r2(cost) }, { key: "cogs", credit: r2(cost) }] : []),
    ],
  });
}

/** Goods receipt: Dr Inventory / Cr Goods Received Not Invoiced. */
export async function postGoodsReceipt(tx: Tx, a: Actor, grnId: string) {
  const g = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: grnId }, include: { items: true } });
  const value = r2(g.items.reduce((s, i) => s.plus(D(i.unitCost).times(i.qty)), new Decimal(0)));
  return post(tx, a, {
    date: g.receivedDate, description: `Goods receipt ${g.number}`, reference: g.number, sourceType: "goods_receipt", sourceId: g.id,
    lines: [{ key: "inventory", debit: value }, { key: "grni", credit: value, partyType: "supplier", partyId: g.supplierId }],
  });
}

/** Supplier bill. From a goods receipt it clears GRNI (difference to inventory); direct bills debit inventory. */
export async function postBill(tx: Tx, a: Actor, billId: string) {
  const b = await tx.purchaseBill.findUniqueOrThrow({ where: { id: billId } });
  const party = { partyType: "supplier" as const, partyId: b.supplierId };
  const stockLines: LineIn[] = [];
  if (b.grnId) {
    const items = await tx.goodsReceiptItem.findMany({ where: { grnId: b.grnId } });
    const grniValue = r2(items.reduce((s, i) => s.plus(D(i.unitCost).times(i.qty)), new Decimal(0)));
    stockLines.push({ key: "grni", debit: grniValue, ...party }, { key: "inventory", debit: D(b.subtotal).minus(grniValue), memo: "Bill vs receipt valuation difference" });
  } else {
    stockLines.push({ key: "inventory", debit: b.subtotal });
  }
  const j = await post(tx, a, {
    date: b.billDate, description: `Supplier bill ${b.number}${b.supplierBillNo ? ` (${b.supplierBillNo})` : ""}`, reference: b.number, sourceType: "purchase_bill", sourceId: b.id,
    lines: [
      ...stockLines,
      { key: "vat_in", debit: b.vatTotal },
      { key: "purchase_charges", debit: b.additionalCharge },
      { key: "purchase_discount", credit: b.discount },
      { key: "ap", credit: b.total, ...party },
    ],
  });
  if (j) await tx.purchaseBill.update({ where: { id: b.id }, data: { journalId: j.id } });
  return j;
}

/** Supplier payment: Dr AP (and supplier advance for any excess) / Cr money. */
export async function postSupplierPayment(tx: Tx, a: Actor, paymentId: string) {
  const p = await tx.supplierPayment.findUniqueOrThrow({ where: { id: paymentId } });
  const party = { partyType: "supplier" as const, partyId: p.supplierId };
  const j = await post(tx, a, {
    date: p.date, description: `Supplier payment ${p.number}`, reference: p.number, sourceType: "supplier_payment", sourceId: p.id,
    lines: [
      { key: "ap", debit: D(p.amount).minus(D(p.toAdvance)), ...party },
      { key: "supplier_advance", debit: p.toAdvance, ...party },
      { key: money(p.method), credit: p.amount, memo: p.reference ?? undefined },
    ],
  });
  if (j) await tx.supplierPayment.update({ where: { id: p.id }, data: { journalId: j.id } });
  return j;
}

/** Return to supplier: Dr AP / supplier advance; Cr Inventory + VAT input. */
export async function postPurchaseReturn(tx: Tx, a: Actor, returnId: string) {
  const ret = await tx.purchaseReturn.findUniqueOrThrow({ where: { id: returnId }, include: { items: true, bill: { include: { items: true } } } });
  let net = new Decimal(0);
  for (const ri of ret.items) {
    const it = ret.bill.items.find((x) => x.id === ri.billItemId)!;
    net = net.plus(shares(it, ri.qty, it.unitCost).netShare);
  }
  const party = { partyType: "supplier" as const, partyId: ret.supplierId };
  return post(tx, a, {
    date: ret.date, description: `Return to supplier ${ret.number} on ${ret.bill.number}`, reference: ret.number, sourceType: "purchase_return", sourceId: ret.id,
    lines: [
      { key: "ap", debit: ret.reduceDue, ...party },
      { key: "supplier_advance", debit: ret.toAdvance, ...party },
      { key: "inventory", credit: net },
      { key: "vat_in", credit: D(ret.amount).minus(net) },
    ],
  });
}

/** Online order delivered (cash on delivery): Dr COD receivable / Cr Sales, shipping income; Dr discount; COGS. */
export async function postOrderDelivered(tx: Tx, a: Actor, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const cost = r2(o.items.reduce((s, i) => s.plus(D(i.unitCost).times(i.qty)), new Decimal(0)));
  return post(tx, a, {
    date: new Date(), description: `Online order ${o.number} delivered`, reference: o.number, sourceType: "order", sourceId: o.id,
    lines: [
      { key: money(o.paymentMethod), debit: o.total },
      { key: "sales_discount", debit: o.discount },
      { key: "sales", credit: o.subtotal },
      { key: "other_income", credit: o.shippingFee, memo: "Delivery charge" },
      { key: "cogs", debit: cost },
      { key: "inventory", credit: cost },
    ],
  });
}

export const reverseOrder = (tx: Tx, a: Actor, orderId: string, reason: string) => reverseSource(tx, a, "order", orderId, reason);

/** Stock count / breakage at moving-average cost. */
export async function postStockAdjustment(tx: Tx, a: Actor, p: { variantId: string; change: number; unitCost: { toString(): string }; reason: string; movementId: string }) {
  const value = r2(D(p.unitCost).times(Math.abs(p.change)));
  const lines: LineIn[] = p.change > 0
    ? [{ key: "inventory", debit: value }, { key: "inventory_gain", credit: value }]
    : [{ key: "shrinkage", debit: value }, { key: "inventory", credit: value }];
  return post(tx, a, { date: new Date(), description: `Stock adjustment: ${p.reason}`, sourceType: "stock_adjustment", sourceId: p.movementId, lines });
}

/** Opening stock and opening party balances against Opening Balance Equity. */
export async function postOpening(tx: Tx, a: Actor, p: { kind: "stock" | "customer" | "supplier"; sourceId: string; amount: { toString(): string }; label: string }) {
  const v = D(p.amount);
  if (v.lessThanOrEqualTo(0)) return null;
  const lines: LineIn[] = p.kind === "stock" ? [{ key: "inventory", debit: v }, { key: "opening_equity", credit: v }]
    : p.kind === "customer" ? [{ key: "ar", debit: v, partyType: "customer", partyId: p.sourceId }, { key: "opening_equity", credit: v }]
    : [{ key: "opening_equity", debit: v }, { key: "ap", credit: v, partyType: "supplier", partyId: p.sourceId }];
  return post(tx, a, { date: new Date(), description: `Opening balance — ${p.label}`, sourceType: `opening_${p.kind}`, sourceId: p.sourceId, lines });
}
