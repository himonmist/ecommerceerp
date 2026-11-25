"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { str, toState, type ActionState } from "@/server/next/action";
import { createCustomer, createCustomerType } from "@/server/services/erp/customers";
import { createInvoice, voidInvoice } from "@/server/services/erp/invoices";
import { recordReceipt, voidReceipt } from "@/server/services/erp/receipts";
import { createSalesReturn } from "@/server/services/erp/sales-returns";
import { convertQuotation, createQuotation, setQuotationStatus } from "@/server/services/erp/quotations";
import { createSupplier, createSupplierType } from "@/server/services/erp/suppliers";
import { cancelPurchaseOrder, createPurchaseOrder, receiveGoods } from "@/server/services/erp/purchase-orders";
import { createBillFromGrn, createDirectBill } from "@/server/services/erp/bills";
import { recordSupplierPayment, voidSupplierPayment } from "@/server/services/erp/supplier-payments";
import { createPurchaseReturn } from "@/server/services/erp/purchase-returns";
import { setModuleEnabled } from "@/server/services/modules";

/** Collect `prefix[i][field]` form fields into an ordered array of objects. */
function rows(fd: FormData, prefix: string) {
  const re = new RegExp(`^${prefix}\\[(\\d{1,3})\\]\\[(\\w+)\\]$`);
  const map = new Map<number, Record<string, string>>();
  for (const [k, v] of fd.entries()) {
    const m = re.exec(k);
    if (!m || typeof v !== "string") continue;
    const i = Number(m[1]);
    map.set(i, { ...(map.get(i) ?? {}), [m[2]!]: v });
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([, r]) => r);
}
const lines = (fd: FormData) => rows(fd, "items") as never;
const pays = (fd: FormData) => rows(fd, "payments").filter((p) => p.amount) as never;
const qtyRows = (fd: FormData) => rows(fd, "ret").map((r) => ({ itemId: r.id!, qty: r.qty || "0" })) as never;

async function run(fn: () => Promise<unknown>, paths: string[], message?: string): Promise<ActionState> {
  try {
    await fn();
  } catch (e) {
    return toState(e);
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

// ── Sales ──
export async function createCustomerAction(_: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => createCustomer(ctx, {
    name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"), address: str(fd, "address"), city: str(fd, "city"),
    district: str(fd, "district"), customerTypeId: str(fd, "customerTypeId"), creditLimit: str(fd, "creditLimit"), openingBalance: str(fd, "openingBalance"),
  }), ["/dashboard/erp/customers"], "Customer added.");
}

export async function createCustomerTypeAction(_: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => createCustomerType(ctx, { name: str(fd, "name"), code: str(fd, "code"), discountPct: str(fd, "discountPct"), creditDays: str(fd, "creditDays") as never, description: str(fd, "description") }),
    ["/dashboard/erp/customers"], "Customer type added.");
}

export async function createInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let id: string;
  try {
    const inv = await createInvoice(ctx, {
      customerId: str(fd, "customerId"), walkInName: str(fd, "walkInName"), invoiceDate: str(fd, "invoiceDate"), dueDate: str(fd, "dueDate"),
      items: lines(fd), payments: pays(fd), useAdvance: fd.get("useAdvance") === "on", notes: str(fd, "notes"),
      discount: str(fd, "discount"), additionalCharge: str(fd, "additionalCharge"),
    });
    id = inv.id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/erp", "layout");
  redirect(`/dashboard/erp/invoices/${id}?created=1`);
}

export async function voidInvoiceAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const r = await run(() => voidInvoice(ctx, id, str(fd, "reason") || "Voided"), ["/dashboard/erp", "/dashboard/erp/invoices"]);
  if (!r?.ok) return r;
  redirect(`/dashboard/erp/invoices/${id}?voided=1`); // the void form disappears, so confirm at page level
}

export async function receiptAction(_: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  const alloc = rows(fd, "alloc").filter((a) => a.amount && Number(a.amount) > 0).map((a) => ({ invoiceId: a.id!, amount: a.amount! }));
  return run(() => recordReceipt(ctx, {
    customerId: str(fd, "customerId"), date: str(fd, "date"), method: str(fd, "method") as never, amount: str(fd, "amount"),
    reference: str(fd, "reference"), notes: str(fd, "notes"), allocations: alloc.length ? alloc : undefined,
  }), ["/dashboard/erp", "/dashboard/erp/receipts", "/dashboard/erp/invoices"], "Payment received.");
}

export async function voidReceiptAction(id: string) {
  const ctx = await requireCtx();
  await voidReceipt(ctx, id);
  revalidatePath("/dashboard/erp", "layout");
}

export async function salesReturnAction(invoiceId: string, _: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => createSalesReturn(ctx, invoiceId, { date: str(fd, "date"), items: qtyRows(fd), restock: fd.get("restock") === "on", reason: str(fd, "reason") }),
    [`/dashboard/erp/invoices/${invoiceId}`], "Return recorded.");
}

export async function createQuotationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let id: string;
  try {
    const q = await createQuotation(ctx, {
      customerId: str(fd, "customerId"), date: str(fd, "date"), validUntil: str(fd, "validUntil"), items: lines(fd),
      terms: str(fd, "terms"), discount: str(fd, "discount"), additionalCharge: str(fd, "additionalCharge"),
    });
    id = q.id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/erp/quotations");
  redirect(`/dashboard/erp/quotations/${id}`);
}

export async function quotationStatusAction(id: string, _: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => setQuotationStatus(ctx, id, str(fd, "status") as never), [`/dashboard/erp/quotations/${id}`], "Status updated.");
}

export async function convertQuotationAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let invId: string;
  try {
    invId = (await convertQuotation(ctx, id, { invoiceDate: str(fd, "invoiceDate") })).id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/erp", "layout");
  redirect(`/dashboard/erp/invoices/${invId}?created=1`);
}

// ── Purchase ──
export async function createSupplierAction(_: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => createSupplier(ctx, {
    name: str(fd, "name"), contactPerson: str(fd, "contactPerson"), phone: str(fd, "phone"), email: str(fd, "email"),
    address: str(fd, "address"), supplierTypeId: str(fd, "supplierTypeId"), openingBalance: str(fd, "openingBalance"),
  }), ["/dashboard/erp/suppliers"], "Supplier added.");
}

export async function createSupplierTypeAction(_: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => createSupplierType(ctx, { name: str(fd, "name"), code: str(fd, "code"), description: str(fd, "description") }), ["/dashboard/erp/suppliers"], "Supplier type added.");
}

export async function createPurchaseOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let id: string;
  try {
    id = (await createPurchaseOrder(ctx, {
      supplierId: str(fd, "supplierId"), orderDate: str(fd, "orderDate"), expectedDate: str(fd, "expectedDate"), items: lines(fd),
      terms: str(fd, "terms"), discount: str(fd, "discount"), additionalCharge: str(fd, "additionalCharge"),
    })).id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/erp/purchase-orders");
  redirect(`/dashboard/erp/purchase-orders/${id}`);
}

export async function receiveGoodsAction(poId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const items = rows(fd, "rcv").map((r) => ({ poItemId: r.id!, qty: r.qty || "0" })) as never;
  const r = await run(() => receiveGoods(ctx, poId, { receivedDate: str(fd, "receivedDate"), items, notes: str(fd, "notes") }), ["/dashboard/erp", "/dashboard/products"]);
  if (!r?.ok) return r;
  redirect(`/dashboard/erp/purchase-orders/${poId}?received=1`); // the form may disappear once fully received
}

export async function cancelPurchaseOrderAction(id: string) {
  const ctx = await requireCtx();
  await cancelPurchaseOrder(ctx, id);
  revalidatePath(`/dashboard/erp/purchase-orders/${id}`);
}

export async function billFromGrnAction(grnId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let id: string;
  try {
    id = (await createBillFromGrn(ctx, grnId, { billDate: str(fd, "billDate"), dueDate: str(fd, "dueDate"), supplierBillNo: str(fd, "supplierBillNo") })).id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/erp", "layout");
  redirect(`/dashboard/erp/bills/${id}?created=1`);
}

export async function createDirectBillAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let id: string;
  try {
    id = (await createDirectBill(ctx, {
      supplierId: str(fd, "supplierId"), billDate: str(fd, "billDate"), dueDate: str(fd, "dueDate"), supplierBillNo: str(fd, "supplierBillNo"),
      items: lines(fd), payments: pays(fd), notes: str(fd, "notes"), discount: str(fd, "discount"), additionalCharge: str(fd, "additionalCharge"),
    })).id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/erp", "layout");
  redirect(`/dashboard/erp/bills/${id}?created=1`);
}

export async function supplierPaymentAction(_: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  const alloc = rows(fd, "alloc").filter((a) => a.amount && Number(a.amount) > 0).map((a) => ({ billId: a.id!, amount: a.amount! }));
  return run(() => recordSupplierPayment(ctx, {
    supplierId: str(fd, "supplierId"), date: str(fd, "date"), method: str(fd, "method") as never, amount: str(fd, "amount"),
    reference: str(fd, "reference"), notes: str(fd, "notes"), allocations: alloc.length ? alloc : undefined,
  }), ["/dashboard/erp", "/dashboard/erp/payments", "/dashboard/erp/bills"], "Payment recorded.");
}

export async function voidSupplierPaymentAction(id: string) {
  const ctx = await requireCtx();
  await voidSupplierPayment(ctx, id);
  revalidatePath("/dashboard/erp", "layout");
}

export async function purchaseReturnAction(billId: string, _: ActionState, fd: FormData) {
  const ctx = await requireCtx();
  return run(() => createPurchaseReturn(ctx, billId, { date: str(fd, "date"), items: qtyRows(fd), restock: true, reason: str(fd, "reason") }),
    [`/dashboard/erp/bills/${billId}`], "Return to supplier recorded.");
}

// ── Settings ──
export async function toggleModuleAction(module: string, enabled: boolean) {
  const ctx = await requireCtx();
  await setModuleEnabled(ctx, module, enabled);
  revalidatePath("/dashboard", "layout");
}
