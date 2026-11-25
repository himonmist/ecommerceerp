import "server-only";
import type { Tx } from "@/server/db/tenant";

export type Nature = "asset" | "liability" | "equity" | "income" | "expense";
type Seed = { code: string; name: string; nature: Nature; group: string; key?: string; kind?: "cash" | "bank" | "wallet" };

/** Default chart of accounts for a Bangladeshi trading business. `key` marks accounts the posting engine uses. */
export const COA: Seed[] = [
  { code: "1010", name: "Cash on Hand", nature: "asset", group: "Cash & Bank", key: "cash", kind: "cash" },
  { code: "1020", name: "Bank Account", nature: "asset", group: "Cash & Bank", key: "bank", kind: "bank" },
  { code: "1030", name: "bKash", nature: "asset", group: "Cash & Bank", key: "bkash", kind: "wallet" },
  { code: "1040", name: "Nagad", nature: "asset", group: "Cash & Bank", key: "nagad", kind: "wallet" },
  { code: "1050", name: "Card Clearing", nature: "asset", group: "Cash & Bank", key: "card", kind: "bank" },
  { code: "1060", name: "COD Receivable (Couriers)", nature: "asset", group: "Current Assets", key: "cod" },
  { code: "1100", name: "Accounts Receivable", nature: "asset", group: "Current Assets", key: "ar" },
  { code: "1200", name: "Inventory", nature: "asset", group: "Current Assets", key: "inventory" },
  { code: "1300", name: "VAT Input Receivable", nature: "asset", group: "Current Assets", key: "vat_in" },
  { code: "1400", name: "Supplier Advances", nature: "asset", group: "Current Assets", key: "supplier_advance" },
  { code: "1500", name: "Furniture & Equipment", nature: "asset", group: "Fixed Assets" },
  { code: "2100", name: "Accounts Payable", nature: "liability", group: "Current Liabilities", key: "ap" },
  { code: "2150", name: "Goods Received Not Invoiced", nature: "liability", group: "Current Liabilities", key: "grni" },
  { code: "2200", name: "VAT Output Payable", nature: "liability", group: "Current Liabilities", key: "vat_out" },
  { code: "2300", name: "Customer Advances", nature: "liability", group: "Current Liabilities", key: "customer_advance" },
  { code: "2400", name: "Salaries Payable", nature: "liability", group: "Current Liabilities" },
  { code: "2500", name: "Bank Loan", nature: "liability", group: "Long-term Liabilities" },
  { code: "3000", name: "Owner's Capital", nature: "equity", group: "Equity", key: "capital" },
  { code: "3100", name: "Opening Balance Equity", nature: "equity", group: "Equity", key: "opening_equity" },
  { code: "3200", name: "Retained Earnings", nature: "equity", group: "Equity", key: "retained_earnings" },
  { code: "3300", name: "Owner's Drawings", nature: "equity", group: "Equity", key: "drawings" },
  { code: "4000", name: "Sales Revenue", nature: "income", group: "Revenue", key: "sales" },
  { code: "4010", name: "Sales Returns", nature: "income", group: "Revenue", key: "sales_returns" },
  { code: "4020", name: "Sales Discounts", nature: "income", group: "Revenue", key: "sales_discount" },
  { code: "4100", name: "Shipping & Other Income", nature: "income", group: "Other Income", key: "other_income" },
  { code: "4200", name: "Purchase Discounts", nature: "income", group: "Other Income", key: "purchase_discount" },
  { code: "4300", name: "Inventory Gain", nature: "income", group: "Other Income", key: "inventory_gain" },
  { code: "5000", name: "Cost of Goods Sold", nature: "expense", group: "Cost of Sales", key: "cogs" },
  { code: "5100", name: "Inventory Shrinkage", nature: "expense", group: "Cost of Sales", key: "shrinkage" },
  { code: "5200", name: "Freight & Purchase Charges", nature: "expense", group: "Cost of Sales", key: "purchase_charges" },
  { code: "6000", name: "Rent", nature: "expense", group: "Operating Expenses" },
  { code: "6100", name: "Salaries & Wages", nature: "expense", group: "Operating Expenses" },
  { code: "6200", name: "Utilities", nature: "expense", group: "Operating Expenses" },
  { code: "6300", name: "Transport & Delivery", nature: "expense", group: "Operating Expenses" },
  { code: "6400", name: "Marketing & Ads", nature: "expense", group: "Operating Expenses" },
  { code: "6500", name: "Bank & Payment Charges", nature: "expense", group: "Operating Expenses" },
  { code: "6600", name: "Cash Over / Short", nature: "expense", group: "Operating Expenses", key: "cash_short" },
  { code: "6900", name: "Miscellaneous Expenses", nature: "expense", group: "Operating Expenses", key: "misc_expense" },
];

export const SYSTEM_KEYS = COA.filter((a) => a.key).map((a) => a.key!) ;

/** Insert any missing default accounts (idempotent). */
export async function seedAccounts(tx: Tx, tenantId: string) {
  // Explicit tenant filter: this also runs outside withTenant (signup), where RLS may not apply.
  const existing = await tx.account.findMany({ where: { tenantId }, select: { code: true, systemKey: true } });
  const codes = new Set(existing.map((e) => e.code));
  const keys = new Set(existing.map((e) => e.systemKey).filter(Boolean));
  const missing = COA.filter((a) => !codes.has(a.code) && !(a.key && keys.has(a.key)));
  if (missing.length) {
    await tx.account.createMany({ data: missing.map((a) => ({ tenantId, code: a.code, name: a.name, nature: a.nature, groupName: a.group, systemKey: a.key ?? null, kind: a.kind ?? null })) });
  }
  // Accounts that gained a system key in a later release keep their code and get the key.
  for (const a of COA.filter((x) => x.key && !keys.has(x.key) && codes.has(x.code))) {
    await tx.account.updateMany({ where: { tenantId, code: a.code, systemKey: null }, data: { systemKey: a.key } });
  }
}

/** Money account used for each payment method. */
export const METHOD_ACCOUNT: Record<string, string> = { cash: "cash", bank: "bank", cheque: "bank", bkash: "bkash", nagad: "nagad", card: "card", cod: "cod" };
