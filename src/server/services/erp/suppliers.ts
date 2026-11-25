import "server-only";
import { postOpening } from "../accounting/posting";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { supplierSchema, supplierTypeSchema } from "@/lib/validation-erp";
import { audit } from "../audit";
import { D, money } from "./common";
import type { z } from "zod";

export async function createSupplierType(ctx: Ctx, raw: z.input<typeof supplierTypeSchema>) {
  authorize(ctx, "purchase.manage");
  const p = supplierTypeSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      const t = await tx.supplierType.create({ data: { tenantId: ctx.tenantId, ...p.data } });
      await audit(tx, ctx, "supplier_type.created", "supplier_type", t.id, undefined, { name: t.name });
      return t;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A supplier type with that name already exists.");
    throw e;
  }
}

export async function listSupplierTypes(ctx: Ctx) {
  authorize(ctx, "purchase.view", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.supplierType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { suppliers: true } } } }));
}

export async function createSupplier(ctx: Ctx, raw: z.input<typeof supplierSchema>) {
  authorize(ctx, "purchase.manage");
  const p = supplierSchema.safeParse(raw);
  if (!p.success) throw fromZod(p.error);
  const s = p.data;
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      if (s.supplierTypeId && !(await tx.supplierType.findUnique({ where: { id: s.supplierTypeId } }))) throw new AppError("NOT_FOUND", "Supplier type not found.");
      const sup = await tx.supplier.create({
        data: { tenantId: ctx.tenantId, name: s.name, contactPerson: s.contactPerson ?? null, phone: s.phone ?? null, email: s.email ?? null,
          address: s.address ?? null, supplierTypeId: s.supplierTypeId ?? null, openingDue: s.openingBalance ?? "0" },
      });
      await postOpening(tx, ctx, { kind: "supplier", sourceId: sup.id, amount: s.openingBalance ?? "0", label: sup.name });
      await audit(tx, ctx, "supplier.created", "supplier", sup.id, undefined, { name: sup.name, opening: s.openingBalance ?? "0" });
      return sup;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A supplier with that name already exists.");
    throw e;
  }
}

export async function listSuppliers(ctx: Ctx, opts: { q?: string; page?: number } = {}) {
  authorize(ctx, "purchase.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { contactPerson: { contains: q, mode: "insensitive" as const } }] } : {};
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.supplier.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * 25, take: 25, include: { supplierType: { select: { name: true } } } });
    const total = await tx.supplier.count({ where });
    const dues = await tx.$queryRaw<{ supplier_id: string; due: string }[]>`
      SELECT supplier_id, sum(total - paid - returned)::text AS due FROM purchase_bills
      WHERE status = 'posted' AND supplier_id = ANY(${rows.map((r) => r.id)}::uuid[]) GROUP BY supplier_id`;
    const dueBy = new Map(dues.map((d) => [d.supplier_id, D(d.due)]));
    const items = rows.map((r) => ({ ...r, payable: money(D(r.openingDue).plus(dueBy.get(r.id) ?? 0)), advance: money(D(r.advanceBalance)) }));
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
}

const DAY = 864e5;
export async function supplierAging(ctx: Ctx, asOf: Date = new Date()) {
  authorize(ctx, "purchase.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const suppliers = await tx.supplier.findMany({ orderBy: { name: "asc" } });
    const bills = await tx.purchaseBill.findMany({ where: { status: "posted" } });
    type B = { current: ReturnType<typeof D>; d31: ReturnType<typeof D>; d61: ReturnType<typeof D>; d90: ReturnType<typeof D> };
    const zero = (): B => ({ current: D(0), d31: D(0), d61: D(0), d90: D(0) });
    const by = new Map<string, B>();
    for (const b of bills) {
      const due = D(b.total).minus(D(b.paid)).minus(D(b.returned));
      if (due.lessThanOrEqualTo(0)) continue;
      const age = Math.floor((asOf.getTime() - b.billDate.getTime()) / DAY);
      const x = by.get(b.supplierId) ?? zero();
      if (age <= 30) x.current = x.current.plus(due); else if (age <= 60) x.d31 = x.d31.plus(due); else if (age <= 90) x.d61 = x.d61.plus(due); else x.d90 = x.d90.plus(due);
      by.set(b.supplierId, x);
    }
    const rows = suppliers.map((s) => {
      const x = by.get(s.id) ?? zero();
      const opening = D(s.openingDue);
      const total = opening.plus(x.current).plus(x.d31).plus(x.d61).plus(x.d90);
      return { supplierId: s.id, name: s.name, phone: s.phone, opening: money(opening), current: money(x.current), d31_60: money(x.d31), d61_90: money(x.d61), d90plus: money(x.d90), total: money(total), advance: money(D(s.advanceBalance)) };
    }).filter((r) => D(r.total).greaterThan(0) || D(r.advance).greaterThan(0));
    const sum = (k: keyof (typeof rows)[number]) => money(rows.reduce((a, r) => a.plus(D(r[k] as string)), D(0)));
    return { rows, totals: { opening: sum("opening"), current: sum("current"), d31_60: sum("d31_60"), d61_90: sum("d61_90"), d90plus: sum("d90plus"), total: sum("total") } };
  });
}
