import { describe, expect, it } from "vitest";
import { canTransition, nextStatuses, stockEffect, ORDER_STATUSES } from "@/lib/order-status";

describe("order state machine", () => {
  it("allows the happy path pending → delivered", () => {
    const path = ["pending", "confirmed", "preparing", "ready", "packed", "shipped", "out_for_delivery", "delivered"];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });

  it("allows cancelling only before shipment", () => {
    for (const s of ["pending", "confirmed", "preparing", "ready", "packed"]) expect(canTransition(s, "cancelled")).toBe(true);
    for (const s of ["shipped", "out_for_delivery", "delivered"]) expect(canTransition(s, "cancelled")).toBe(false);
  });

  it("treats cancelled and returned as terminal", () => {
    expect(nextStatuses("cancelled")).toEqual([]);
    expect(nextStatuses("returned")).toEqual([]);
  });

  it("rejects skipping straight from pending to delivered and unknown statuses", () => {
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("pending", "teleported")).toBe(false);
    expect(canTransition("nope", "confirmed")).toBe(false);
  });

  it("maps transitions to stock effects", () => {
    expect(stockEffect("packed", "cancelled")).toBe("release");
    expect(stockEffect("shipped", "returned")).toBe("release"); // RTO: goods never left our books
    expect(stockEffect("out_for_delivery", "delivered")).toBe("commit");
    expect(stockEffect("delivered", "returned")).toBe("restock");
    expect(stockEffect("pending", "confirmed")).toBe("none");
  });

  it("exposes every status", () => {
    expect(ORDER_STATUSES).toContain("out_for_delivery");
    expect(ORDER_STATUSES).toHaveLength(10);
  });
});
