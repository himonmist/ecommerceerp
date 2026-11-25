import { z } from "zod";
import { bdPhone } from "./validation";
import { PAYMENT_METHODS } from "./erp";

const money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 1250 or 1250.50");
const optMoney = z.preprocess((v) => (v === "" || v == null ? undefined : String(v)), money.optional());
const pct = z.preprocess((v) => (v === "" || v == null ? "0" : String(v)), z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).refine((x) => Number(x) <= 100, "Max 100%")).optional();
const optText = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().trim().max(max).optional());
const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v === "" || v == null ? undefined : v), uuid.optional());
const date = z.coerce.date().refine((d) => d.getFullYear() > 2000 && d.getFullYear() < 2100, "Enter a valid date");
const optDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), date.optional());

export const docLine = z.object({
  variantId: uuid,
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unitPrice: money,
  discount: optMoney,
  vatPct: pct,
});
export const docLines = z.array(docLine).min(1, "Add at least one item").max(200);

export const paymentLine = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: money.refine((v) => Number(v) > 0, "Amount must be more than 0"),
  reference: optText(100),
});

export const customerTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: optText(20),
  discountPct: pct,
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  description: optText(300),
});

export const erpCustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  phone: bdPhone,
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email().max(254).optional()),
  address: optText(400),
  city: optText(80),
  district: optText(80),
  customerTypeId: optUuid,
  creditLimit: optMoney,
  openingBalance: optMoney,
});

export const supplierTypeSchema = z.object({ name: z.string().trim().min(2).max(80), code: optText(20), description: optText(300) });

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  contactPerson: optText(120),
  phone: z.preprocess((v) => (v === "" ? undefined : v), bdPhone.optional()),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email().max(254).optional()),
  address: optText(400),
  supplierTypeId: optUuid,
  openingBalance: optMoney,
});

const docHeader = { discount: optMoney, additionalCharge: optMoney };

export const quotationSchema = z.object({
  customerId: uuid, date, validUntil: optDate, items: docLines, terms: optText(2000), ...docHeader,
});

export const invoiceSchema = z.object({
  customerId: optUuid,
  walkInName: optText(120),
  invoiceDate: date,
  dueDate: optDate,
  items: docLines,
  payments: z.array(paymentLine).max(10).default([]),
  useAdvance: z.coerce.boolean().default(false),
  notes: optText(1000),
  ...docHeader,
});

export const receiptSchema = z.object({
  customerId: uuid,
  date,
  method: z.enum(PAYMENT_METHODS),
  amount: money.refine((v) => Number(v) > 0, "Amount must be more than 0"),
  reference: optText(100),
  notes: optText(500),
  allocations: z.array(z.object({ invoiceId: uuid, amount: money })).max(200).optional(),
});

export const returnSchema = z.object({
  date,
  items: z.array(z.object({ itemId: uuid, qty: z.coerce.number().int().min(0).max(1_000_000) })).min(1).max(200),
  restock: z.coerce.boolean().default(true),
  reason: z.string().trim().min(3, "Give a reason").max(500),
});

export const purchaseOrderSchema = z.object({
  supplierId: uuid, orderDate: date, expectedDate: optDate,
  items: z.array(docLine.extend({ unitPrice: money })).min(1, "Add at least one item").max(200),
  terms: optText(2000), ...docHeader,
});

export const grnSchema = z.object({
  receivedDate: date,
  items: z.array(z.object({ poItemId: uuid, qty: z.coerce.number().int().min(0).max(1_000_000) })).min(1),
  notes: optText(500),
});

export const billFromGrnSchema = z.object({ billDate: date, dueDate: optDate, supplierBillNo: optText(60), ...docHeader });

export const directBillSchema = z.object({
  supplierId: uuid, billDate: date, dueDate: optDate, supplierBillNo: optText(60),
  items: docLines, payments: z.array(paymentLine).max(10).default([]), notes: optText(1000), ...docHeader,
});

export const supplierPaymentSchema = receiptSchema.omit({ customerId: true, allocations: true }).extend({
  supplierId: uuid,
  allocations: z.array(z.object({ billId: uuid, amount: money })).max(200).optional(),
});

// ── Accounting ──
const amountPos = money.refine((v) => Number(v) > 0, "Amount must be more than 0");
const vHeader = { date, description: z.string().trim().min(3, "Describe this entry").max(300), reference: optText(100), status: z.enum(["draft", "approved"]).default("approved") };
export const voucherSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CV"), moneyAccountId: uuid, lines: z.array(z.object({ accountId: uuid, amount: amountPos, memo: optText(200) })).min(1).max(50), ...vHeader }),
  z.object({ type: z.literal("DV"), moneyAccountId: uuid, lines: z.array(z.object({ accountId: uuid, amount: amountPos, memo: optText(200) })).min(1).max(50), ...vHeader }),
  z.object({ type: z.literal("TM"), fromAccountId: uuid, toAccountId: uuid, amount: amountPos, ...vHeader }),
  z.object({ type: z.literal("JV"), lines: z.array(z.object({ accountId: uuid, debit: optMoney, credit: optMoney, memo: optText(200) })).min(2).max(100), ...vHeader }),
]);
export const accountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  nature: z.enum(["asset", "liability", "equity", "income", "expense"]),
  groupName: optText(80),
  kind: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(["cash", "bank", "wallet"]).optional()),
  description: optText(300),
});
