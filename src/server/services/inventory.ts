import "server-only";
import { postStockAdjustment } from "./accounting/posting";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { stockAdjustSchema } from "@/lib/validation";
import { audit } from "./audit";
import type { z } from "zod";

export async function adjustStock(ctx: Ctx, raw: z.input<typeof stockAdjustSchema>) {
  authorize(ctx, "inventory.manage");
  const parsed = stockAdjustSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const { variantId, change, reason } = parsed.data;
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.$queryRaw<{ warehouse_id: string; on_hand: number; reserved: number }[]>`
      SELECT sl.warehouse_id, sl.on_hand, sl.reserved FROM stock_levels sl
      JOIN warehouses w ON w.id = sl.warehouse_id AND w.is_default
      WHERE sl.variant_id = ${variantId}::uuid FOR UPDATE OF sl`;
    const row = rows[0];
    if (!row) throw new AppError("NOT_FOUND", "Variant not found.");
    const after = row.on_hand + change;
    if (after < row.reserved) {
      throw new AppError("INSUFFICIENT_STOCK", `Only ${row.on_hand - row.reserved} unreserved units can be removed.`);
    }
    await tx.stockLevel.update({
      where: { tenantId_variantId_warehouseId: { tenantId: ctx.tenantId, variantId, warehouseId: row.warehouse_id } },
      data: { onHand: after },
    });
    const movement = await tx.stockMovement.create({
      data: { tenantId: ctx.tenantId, variantId, warehouseId: row.warehouse_id, type: change > 0 ? "adjustment_in" : "adjustment_out",
        qtyChange: change, qtyBefore: row.on_hand, qtyAfter: after, sourceType: "adjustment", notes: reason, createdBy: ctx.userId },
    });
    const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { costPrice: true } });
    await postStockAdjustment(tx, ctx, { variantId, change, unitCost: variant.costPrice, reason, movementId: movement.id });
    await audit(tx, ctx, "stock.adjusted", "variant", variantId, { onHand: row.on_hand }, { onHand: after, reason });
    return movement;
  });
}

export async function listMovements(ctx: Ctx, limit = 50) {
  authorize(ctx, "catalog.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const moves = await tx.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(limit, 200) });
    const variants = await tx.productVariant.findMany({ where: { id: { in: moves.map((m) => m.variantId) } }, include: { product: { select: { name: true } } } });
    const byId = new Map(variants.map((v) => [v.id, v]));
    return moves.map((m) => ({ ...m, productName: byId.get(m.variantId)?.product.name ?? "—", variantTitle: byId.get(m.variantId)?.title ?? "" }));
  });
}
