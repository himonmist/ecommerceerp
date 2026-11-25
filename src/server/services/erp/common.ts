import "server-only";
import Decimal from "decimal.js";
import type { Tx } from "@/server/db/tenant";
import type { Ctx } from "@/server/context";
import { AppError } from "@/server/errors";
import { computeDocument } from "@/lib/erp";

export const D = (v: { toString(): string } | string | number | null | undefined) => new Decimal(v == null || v === "" ? 0 : v.toString());
export const money = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const asDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));

export async function defaultWarehouseId(tx: Tx) {
  const wh = await tx.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } });
  if (!wh) throw new Error("Tenant has no default warehouse");
  return wh.id;
}

/** Load the variants on a document; every one must exist in this tenant and belong to a non-archived product. */
export async function loadVariants(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await tx.productVariant.findMany({ where: { id: { in: unique }, product: { status: { not: "archived" } } }, include: { product: { select: { name: true } } } });
  if (rows.length !== unique.length) throw new AppError("NOT_FOUND", "One or more items were not found.");
  return new Map(rows.map((r) => [r.id, r]));
}

type Line = { variantId: string; qty: number; unitPrice: string; discount?: string; vatPct?: string };

/** Compute a document and build its line rows (description defaults to product · variant). */
export function buildLines(lines: Line[], variants: Map<string, { title: string; product: { name: string } }>, header: { discount?: string; additionalCharge?: string }) {
  let doc;
  try {
    doc = computeDocument(lines, header);
  } catch (e) {
    throw new AppError("VALIDATION", (e as Error).message);
  }
  const rows = lines.map((l, i) => {
    const v = variants.get(l.variantId)!;
    return {
      variantId: l.variantId,
      description: v.title === "Default" ? v.product.name : `${v.product.name} · ${v.title}`,
      qty: l.qty, unitPrice: l.unitPrice, discount: l.discount ?? "0", vatPct: l.vatPct ?? "0",
      lineTotal: doc.lines[i]!.lineTotal, net: doc.lines[i]!.net,
    };
  });
  return { doc, rows };
}

type Move = { variantId: string; warehouseId: string; qty: number; type: string; sourceType: string; sourceId: string; reference?: string; notes?: string };

/** Atomically remove available (unreserved) stock and record the movement. */
export async function stockOut(tx: Tx, ctx: Ctx, m: Move, name = "this item") {
  const rows = await tx.$queryRaw<{ on_hand: number }[]>`
    UPDATE stock_levels SET on_hand = on_hand - ${m.qty}
    WHERE variant_id = ${m.variantId}::uuid AND warehouse_id = ${m.warehouseId}::uuid AND on_hand - reserved >= ${m.qty}
    RETURNING on_hand`;
  if (!rows[0]) throw new AppError("INSUFFICIENT_STOCK", `Not enough stock for ${name}.`);
  const after = rows[0].on_hand;
  await tx.stockMovement.create({
    data: { tenantId: ctx.tenantId, variantId: m.variantId, warehouseId: m.warehouseId, type: m.type, qtyChange: -m.qty,
      qtyBefore: after + m.qty, qtyAfter: after, sourceType: m.sourceType, sourceId: m.sourceId, reference: m.reference, notes: m.notes, createdBy: ctx.userId },
  });
}

/** Add stock, record the movement and (for purchases) update the moving-average cost. */
export async function stockIn(tx: Tx, ctx: Ctx, m: Move & { unitCost?: Decimal }) {
  const rows = await tx.$queryRaw<{ on_hand: number }[]>`
    INSERT INTO stock_levels (tenant_id, variant_id, warehouse_id, on_hand, reserved)
    VALUES (${ctx.tenantId}::uuid, ${m.variantId}::uuid, ${m.warehouseId}::uuid, ${m.qty}, 0)
    ON CONFLICT (tenant_id, variant_id, warehouse_id) DO UPDATE SET on_hand = stock_levels.on_hand + ${m.qty}
    RETURNING on_hand`;
  const after = rows[0]!.on_hand;
  const before = after - m.qty;
  if (m.unitCost) {
    const v = await tx.productVariant.findUniqueOrThrow({ where: { id: m.variantId }, select: { costPrice: true } });
    const newCost = before > 0 ? D(v.costPrice).times(before).plus(m.unitCost.times(m.qty)).dividedBy(after) : m.unitCost;
    await tx.productVariant.update({ where: { id: m.variantId }, data: { costPrice: money(newCost) } });
  }
  await tx.stockMovement.create({
    data: { tenantId: ctx.tenantId, variantId: m.variantId, warehouseId: m.warehouseId, type: m.type, qtyChange: m.qty,
      qtyBefore: before, qtyAfter: after, sourceType: m.sourceType, sourceId: m.sourceId, reference: m.reference, notes: m.notes, createdBy: ctx.userId },
  });
}

/** Lock rows of a table by id inside the transaction (serialises concurrent payments on the same document). */
export async function lockIds(tx: Tx, table: "sales_invoices" | "purchase_bills" | "customers" | "suppliers" | "purchase_orders" | "quotations", ids: string[]) {
  if (ids.length === 0) return;
  // table is a fixed union of identifiers, never user input
  await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) FOR UPDATE`, ids);
}
