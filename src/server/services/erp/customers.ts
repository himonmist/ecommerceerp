import "server-only";
import { postOpening } from "../accounting/posting";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { customerTypeSchema, erpCustomerSchema } from "@/lib/validation-erp";
import { audit } from "../audit";
import { nextNumber } from "../sequences";
import { D, money } from "./common";
import type { z } from "zod";

const PAGE = 25;

export async function createCustomerType(ctx: Ctx, raw: z.input<typeof customerTypeSchema>) {
  authorize(ctx, "sales.manage");
  const p = customerTypeSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      const t = await tx.customerType.create({ data: { tenantId: ctx.tenantId, ...p.data } });
      await audit(tx, ctx, "customer_type.created", "customer_type", t.id, undefined, { name: t.name });
      return t;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A customer type with that name already exists.");
    throw e;
  }
}

export async function listCustomerTypes(ctx: Ctx) {
  authorize(ctx, "sales.view", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.customerType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { customers: true } } } }));
}

export async function createCustomer(ctx: Ctx, raw: z.input<typeof erpCustomerSchema>) {
  authorize(ctx, "sales.manage");
  const p = erpCustomerSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const c = p.data;
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      if (c.customerTypeId && !(await tx.customerType.findUnique({ where: { id: c.customerTypeId } }))) throw new AppError("NOT_FOUND", "Customer type not found.");
      const seq = await nextNumber(tx, ctx.tenantId, "customer");
      const customer = await tx.customer.create({
        data: {
          tenantId: ctx.tenantId, name: c.name, phone: c.phone, email: c.email ?? null, address: c.address ?? null,
          city: c.city ?? null, district: c.district ?? null, customerTypeId: c.customerTypeId ?? null,
          membershipId: seq.replace("CMID-", `CMID-${new Date().getFullYear()}-`),
          creditLimit: c.creditLimit ?? "0", openingDue: c.openingBalance ?? "0",
        },
      });
      await postOpening(tx, ctx, { kind: "customer", sourceId: customer.id, amount: c.openingBalance ?? "0", label: customer.name });
      await audit(tx, ctx, "customer.created", "customer", customer.id, undefined, { name: customer.name, opening: c.openingBalance ?? "0" });
      return customer;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A customer with that phone number already exists.");
    throw e;
  }
}

/** Customers with outstanding receivable (opening + unpaid invoices) and advance. */
export async function listCustomers(ctx: Ctx, opts: { q?: string; page?: number } = {}) {
  authorize(ctx, "sales.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { membershipId: { contains: q, mode: "insensitive" as const } }] } : {};
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.customer.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE, take: PAGE, include: { customerType: { select: { name: true } } } });
    const total = await tx.customer.count({ where });
    const dues = await tx.$queryRaw<{ customer_id: string; due: string }[]>`
      SELECT customer_id, sum(total - paid - returned)::text AS due FROM sales_invoices
      WHERE status = 'posted' AND customer_id = ANY(${rows.map((r) => r.id)}::uuid[]) GROUP BY customer_id`;
    const dueBy = new Map(dues.map((d) => [d.customer_id, D(d.due)]));
    const items = rows.map((r) => ({
      ...r, outstanding: money(D(r.openingDue).plus(dueBy.get(r.id) ?? 0)), advance: money(D(r.advanceBalance)),
    }));
    return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
  });
}

export async function getCustomer(ctx: Ctx, id: string) {
  authorize(ctx, "sales.view", { write: false });
  const c = await withTenant(ctx.tenantId, (tx) => tx.customer.findUnique({ where: { id }, include: { customerType: true } }));
  if (!c) throw new AppError("NOT_FOUND", "Customer not found.");
  return c;
}

/** Chronological statement; balance = receivable − advance. */
export async function customerStatement(ctx: Ctx, id: string) {
  authorize(ctx, "sales.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const c = await tx.customer.findUnique({ where: { id } });
    if (!c) throw new AppError("NOT_FOUND", "Customer not found.");
    const [invoices, receipts, returns, openingPaid] = [
      await tx.salesInvoice.findMany({ where: { customerId: id, status: "posted" } }),
      await tx.customerReceipt.findMany({ where: { customerId: id, status: "posted", method: { not: "advance" } } }),
      await tx.salesReturn.findMany({ where: { customerId: id } }),
      await tx.receiptAllocation.aggregate({ _sum: { amount: true }, where: { invoiceId: null, receipt: { customerId: id, status: "posted" } } }),
    ];
    const opening = D(c.openingDue).plus(D(openingPaid._sum.amount));
    type Row = { date: Date; at: Date; type: string; ref: string; debit: string; credit: string; balance?: string };
    const entries: Row[] = [
      ...invoices.map((i) => ({ date: i.invoiceDate, at: i.createdAt, type: "Invoice", ref: i.number, debit: money(D(i.total)), credit: "0.00" })),
      ...receipts.map((r) => ({ date: r.date, at: r.createdAt, type: "Receipt", ref: r.number, debit: "0.00", credit: money(D(r.amount)) })),
      ...returns.map((r) => ({ date: r.date, at: r.createdAt, type: "Return", ref: r.number, debit: "0.00", credit: money(D(r.reduceDue).plus(D(r.toAdvance))) })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.at.getTime() - b.at.getTime());
    let bal = D(0);
    const rows: Row[] = [];
    if (opening.greaterThan(0)) {
      bal = opening;
      rows.push({ date: c.createdAt, at: c.createdAt, type: "Opening balance", ref: "—", debit: money(opening), credit: "0.00", balance: money(bal) });
    }
    for (const e of entries) {
      bal = bal.plus(D(e.debit)).minus(D(e.credit));
      rows.push({ ...e, balance: money(bal) });
    }
    return { customer: c, rows, closing: money(bal) };
  });
}

const DAY = 864e5;
export async function customerAging(ctx: Ctx, asOf: Date = new Date()) {
  authorize(ctx, "sales.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const customers = await tx.customer.findMany({ orderBy: { name: "asc" } });
    const invoices = await tx.salesInvoice.findMany({ where: { status: "posted", customerId: { not: null } } });
    const by = new Map<string, { current: ReturnType<typeof D>; d31: ReturnType<typeof D>; d61: ReturnType<typeof D>; d90: ReturnType<typeof D> }>();
    for (const i of invoices) {
      const due = D(i.total).minus(D(i.paid)).minus(D(i.returned));
      if (due.lessThanOrEqualTo(0)) continue;
      const age = Math.floor((asOf.getTime() - i.invoiceDate.getTime()) / DAY);
      const b = by.get(i.customerId!) ?? { current: D(0), d31: D(0), d61: D(0), d90: D(0) };
      if (age <= 30) b.current = b.current.plus(due); else if (age <= 60) b.d31 = b.d31.plus(due); else if (age <= 90) b.d61 = b.d61.plus(due); else b.d90 = b.d90.plus(due);
      by.set(i.customerId!, b);
    }
    const rows = customers.map((c) => {
      const b = by.get(c.id) ?? { current: D(0), d31: D(0), d61: D(0), d90: D(0) };
      const opening = D(c.openingDue);
      const total = opening.plus(b.current).plus(b.d31).plus(b.d61).plus(b.d90);
      return { customerId: c.id, name: c.name, phone: c.phone, opening: money(opening), current: money(b.current), d31_60: money(b.d31), d61_90: money(b.d61), d90plus: money(b.d90), total: money(total), advance: money(D(c.advanceBalance)) };
    }).filter((r) => D(r.total).greaterThan(0) || D(r.advance).greaterThan(0));
    const sum = (k: keyof (typeof rows)[number]) => money(rows.reduce((a, r) => a.plus(D(r[k] as string)), D(0)));
    return { rows, totals: { opening: sum("opening"), current: sum("current"), d31_60: sum("d31_60"), d61_90: sum("d61_90"), d90plus: sum("d90plus"), total: sum("total") } };
  });
}

/** Exact phone lookup for the POS (normalises +88 / spaces). */
export async function lookupCustomerByPhone(ctx: Ctx, raw: string) {
  authorize(ctx, "pos.use", { write: false });
  const phone = raw.replace(/[\s-]/g, "").replace(/^\+?88/, "");
  if (!/^01[3-9]\d{8}$/.test(phone)) return null;
  const c = await withTenant(ctx.tenantId, (tx) => tx.customer.findUnique({ where: { tenantId_phone: { tenantId: ctx.tenantId, phone } } }));
  return c ? { id: c.id, name: c.name, phone: c.phone, advance: money(D(c.advanceBalance)) } : null;
}
