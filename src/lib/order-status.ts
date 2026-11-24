export const ORDER_STATUSES = [
  "pending", "confirmed", "preparing", "ready", "packed",
  "shipped", "out_for_delivery", "delivered", "cancelled", "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", preparing: "Preparing", ready: "Ready",
  packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for delivery",
  delivered: "Delivered", cancelled: "Cancelled", returned: "Returned",
};

export function isOrderStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}

export function nextStatuses(from: string): OrderStatus[] {
  return isOrderStatus(from) ? TRANSITIONS[from] : [];
}

export function canTransition(from: string, to: string): boolean {
  return isOrderStatus(to) && nextStatuses(from).includes(to);
}

/** What a transition does to inventory. */
export type StockEffect = "none" | "release" | "commit" | "restock";
export function stockEffect(from: OrderStatus, to: OrderStatus): StockEffect {
  if (to === "cancelled") return "release";
  if (to === "delivered") return "commit";
  if (to === "returned") return from === "delivered" ? "restock" : "release";
  return "none";
}
