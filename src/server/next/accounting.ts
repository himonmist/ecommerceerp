import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireCtx } from "./session";
import { hasPermission } from "@/server/security/permissions";
import { ledgerStatus } from "@/server/services/accounting/ledger";

/** Require accounting.view; with `active`, send stores that haven't set up accounting to the overview. */
export async function requireAccounting(opts: { active?: boolean } = { active: true }) {
  const ctx = await requireCtx();
  if (!hasPermission(ctx.permissions, "accounting.view")) notFound();
  const status = await ledgerStatus(ctx);
  if (opts.active !== false && !status.active) redirect("/dashboard/accounting");
  return { ctx, status };
}

const LINKS: Record<string, (id: string) => string> = {
  sales_invoice: (id) => `/dashboard/erp/invoices/${id}`,
  purchase_bill: (id) => `/dashboard/erp/bills/${id}`,
  order: (id) => `/dashboard/orders/${id}`,
  customer_receipt: () => "/dashboard/erp/receipts",
  supplier_payment: () => "/dashboard/erp/payments",
  opening_customer: (id) => `/dashboard/erp/customers/${id}`,
  opening_stock: (id) => `/dashboard/products/${id}`,
};
export const sourceLink = (type: string | null, id: string | null) => (type && id && LINKS[type] ? LINKS[type](id) : null);

export const SOURCE_LABEL: Record<string, string> = {
  sales_invoice: "Sales invoice", customer_receipt: "Money receipt", sales_return: "Sales return", goods_receipt: "Goods receipt",
  purchase_bill: "Supplier bill", supplier_payment: "Supplier payment", purchase_return: "Purchase return", order: "Online order",
  stock_adjustment: "Stock adjustment", opening_stock: "Opening stock", opening_customer: "Customer opening", opening_supplier: "Supplier opening",
  ledger_opening: "Opening balances", voucher: "Manual voucher",
};
