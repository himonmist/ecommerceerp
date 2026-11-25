import "server-only";
import { postOrderDelivered, reverseOrder } from "./accounting/posting";
import { withTenant, type Tx } from "@/server/db/tenant";
import { AppError, fromZod } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation";
import { computeTotals, couponDiscount, lineTotal } from "@/lib/money";
import { canTransition, isOrderStatus, stockEffect, type OrderStatus } from "@/lib/order-status";
import { audit } from "./audit";
import { nextNumber } from "./sequences";

const PAGE_SIZE = 25;
const PUBLIC_CHANNELS = ["omni", "online"];

/** Public checkout. Prices, stock and coupons are always resolved server-side. */
export async function placeOrder(tenantId: string, raw: CheckoutInput & Record<string, unknown>, meta: { ip?: string | null }) {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;

  // Merge duplicate lines for the same variant.
  const qtyByVariant = new Map<string, number>();
  for (const i of input.items) qtyByVariant.set(i.variantId, (qtyByVariant.get(i.variantId) ?? 0) + i.qty);
  const variantIds = [...qtyByVariant.keys()];

  return withTenant(tenantId, async (tx) => {
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds }, product: { status: "active", channel: { in: PUBLIC_CHANNELS } } },
      include: { product: { select: { name: true } } },
    });
    if (variants.length !== variantIds.length) throw new AppError("NOT_FOUND", "Some items in your cart are no longer available.");
    const zone = await tx.shippingZone.findFirst({ where: { id: input.zoneId, enabled: true } });
    if (!zone) throw new AppError("NOT_FOUND", "Please choose a delivery area.");
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { isDefault: true } });

    // Atomic reservation: the conditional UPDATE locks the row, so concurrent checkouts cannot oversell.
    for (const v of variants) {
      const qty = qtyByVariant.get(v.id)!;
      const updated = await tx.$executeRaw`
        UPDATE stock_levels SET reserved = reserved + ${qty}
        WHERE variant_id = ${v.id}::uuid AND warehouse_id = ${warehouse.id}::uuid AND on_hand - reserved >= ${qty}`;
      if (updated !== 1) throw new AppError("INSUFFICIENT_STOCK", `Sorry, "${v.product.name}" doesn't have enough stock.`);
    }

    const lines = variants.map((v) => ({ v, qty: qtyByVariant.get(v.id)!, unitPrice: v.onlinePrice.toString() }));
    const pre = computeTotals(lines, zone.charge.toString(), "0");

    let couponId: string | null = null;
    let discount = "0";
    if (input.couponCode) {
      const coupon = await tx.coupon.findFirst({ where: { code: input.couponCode.toUpperCase(), isActive: true } });
      const expired = coupon?.expiresAt && coupon.expiresAt < new Date();
      discount = coupon && !expired ? couponDiscount({ ...coupon, value: coupon.value.toString(), minOrder: coupon.minOrder.toString() }, pre.subtotal) : "0";
      if (!coupon || expired || discount === "0.00") throw new AppError("COUPON_INVALID", "That coupon code isn't valid for this order.");
      const claimed = await tx.$executeRaw`
        UPDATE coupons SET used = used + 1 WHERE id = ${coupon.id}::uuid AND (usage_limit IS NULL OR used < usage_limit)`;
      if (claimed !== 1) throw new AppError("COUPON_INVALID", "That coupon has reached its usage limit.");
      couponId = coupon.id;
    }
    const totals = computeTotals(lines, zone.charge.toString(), discount);

    const customer = await tx.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: input.phone } },
      create: { tenantId, name: input.name, phone: input.phone, email: input.email ?? null, address: input.address },
      update: { name: input.name, address: input.address, ...(input.email ? { email: input.email } : {}) },
    });

    const order = await tx.order.create({
      data: {
        tenantId, number: await nextNumber(tx, tenantId, "order"), customerId: customer.id, warehouseId: warehouse.id,
        shippingName: input.name, shippingPhone: input.phone, shippingAddress: input.address, shippingZoneId: zone.id,
        subtotal: totals.subtotal, discount: totals.discount, shippingFee: totals.shipping, total: totals.total,
        couponId, notes: input.notes ?? null, ip: meta.ip ?? null,
        items: {
          create: lines.map(({ v, qty, unitPrice }) => ({
            tenantId, variantId: v.id, name: v.product.name, variantTitle: v.title, qty,
            unitPrice, unitCost: v.costPrice.toString(), lineTotal: lineTotal(unitPrice, qty),
          })),
        },
        events: { create: [{ tenantId, toStatus: "pending", note: "Order placed on storefront" }] },
      },
    });
    await audit(tx, { tenantId, actorType: "customer", ip: meta.ip }, "order.placed", "order", order.id, undefined, { number: order.number, total: totals.total });
    return order;
  });
}

async function applyStockEffect(tx: Tx, ctx: Ctx, order: { id: string; number: string; warehouseId: string }, effect: ReturnType<typeof stockEffect>) {
  if (effect === "none") return;
  const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
  for (const item of items) {
    const rows = await tx.$queryRaw<{ on_hand: number; reserved: number }[]>`
      SELECT on_hand, reserved FROM stock_levels
      WHERE variant_id = ${item.variantId}::uuid AND warehouse_id = ${order.warehouseId}::uuid FOR UPDATE`;
    const lvl = rows[0];
    if (!lvl) throw new Error("Stock level missing for order item");
    const key = { tenantId_variantId_warehouseId: { tenantId: ctx.tenantId, variantId: item.variantId, warehouseId: order.warehouseId } };
    const base = { tenantId: ctx.tenantId, variantId: item.variantId, warehouseId: order.warehouseId, sourceType: "order", sourceId: order.id, reference: order.number, createdBy: ctx.userId };
    if (effect === "release") {
      await tx.stockLevel.update({ where: key, data: { reserved: { decrement: item.qty } } });
    } else if (effect === "commit") {
      await tx.stockLevel.update({ where: key, data: { onHand: { decrement: item.qty }, reserved: { decrement: item.qty } } });
      await tx.stockMovement.create({ data: { ...base, type: "sale", qtyChange: -item.qty, qtyBefore: lvl.on_hand, qtyAfter: lvl.on_hand - item.qty } });
    } else {
      await tx.stockLevel.update({ where: key, data: { onHand: { increment: item.qty } } });
      await tx.stockMovement.create({ data: { ...base, type: "sales_return", qtyChange: item.qty, qtyBefore: lvl.on_hand, qtyAfter: lvl.on_hand + item.qty } });
    }
  }
}

export async function transitionOrder(ctx: Ctx, orderId: string, to: OrderStatus, note?: string) {
  authorize(ctx, "orders.manage");
  if (!isOrderStatus(to)) throw new AppError("INVALID_TRANSITION", "Unknown status.");
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new AppError("NOT_FOUND", "Order not found.");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const from = order.status as OrderStatus;
    if (!canTransition(from, to)) throw new AppError("INVALID_TRANSITION", `An order can't move from ${from} to ${to}.`);

    await applyStockEffect(tx, ctx, order, stockEffect(from, to));
    let paymentStatus = order.paymentStatus;
    if (to === "delivered" && order.paymentMethod === "cod") paymentStatus = "paid";
    if (to === "returned" && from === "delivered" && order.paymentStatus === "paid") paymentStatus = "refunded";

    const updated = await tx.order.update({ where: { id: orderId }, data: { status: to, paymentStatus } });
    if (to === "delivered") await postOrderDelivered(tx, ctx, orderId);
    if (to === "returned" && from === "delivered") await reverseOrder(tx, ctx, orderId, "Returned after delivery");
    await tx.orderEvent.create({ data: { tenantId: ctx.tenantId, orderId, fromStatus: from, toStatus: to, note: note?.slice(0, 500) ?? null, actorId: ctx.userId } });
    await audit(tx, ctx, "order.status_changed", "order", orderId, { status: from }, { status: to });
    return updated;
  });
}

export async function getOrder(ctx: Ctx, id: string) {
  authorize(ctx, "orders.view", { write: false });
  const o = await withTenant(ctx.tenantId, (tx) => tx.order.findUnique({
    where: { id },
    include: { items: true, events: { orderBy: { createdAt: "asc" } }, customer: true, shippingZone: true, coupon: { select: { code: true } } },
  }));
  if (!o) throw new AppError("NOT_FOUND", "Order not found.");
  return o;
}

export async function listOrders(ctx: Ctx, opts: { status?: string; q?: string; page?: number }) {
  authorize(ctx, "orders.view", { write: false });
  const page = Math.max(1, Math.min(opts.page ?? 1, 10_000));
  const q = opts.q?.trim().slice(0, 100);
  const where = {
    ...(opts.status && isOrderStatus(opts.status) ? { status: opts.status } : {}),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" as const } },
      { shippingPhone: { contains: q } },
      { shippingName: { contains: q, mode: "insensitive" as const } },
    ] } : {}),
  };
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.order.findMany({ where, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { _count: { select: { items: true } } } });
    const total = await tx.order.count({ where });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function dashboardStats(ctx: Ctx) {
  authorize(ctx, "dashboard.view", { write: false });
  return withTenant(ctx.tenantId, async (tx) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const counts = await tx.$queryRaw<{ total: bigint; pending: bigint; today: bigint; revenue: string | null }[]>`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE status = 'pending')::bigint AS pending,
             count(*) FILTER (WHERE placed_at >= ${startOfDay})::bigint AS today,
             (sum(total) FILTER (WHERE status = 'delivered'))::text AS revenue
      FROM orders`;
    const productsCount = await tx.product.count({ where: { status: { not: "archived" } } });
    const lowStockRows = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM product_variants v
      JOIN products p ON p.id = v.product_id AND p.status <> 'archived'
      JOIN stock_levels s ON s.variant_id = v.id
      WHERE s.on_hand - s.reserved <= v.low_stock_threshold`;
    const recent = await tx.order.findMany({ orderBy: { placedAt: "desc" }, take: 6 });
    const c = counts[0];
    return {
      ordersTotal: Number(c?.total ?? 0), pending: Number(c?.pending ?? 0), today: Number(c?.today ?? 0), productsCount,
      revenue: c?.revenue ?? "0",
      lowStock: Number(lowStockRows[0]?.n ?? 0),
      recent,
    };
  });
}
