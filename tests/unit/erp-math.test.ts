import { describe, expect, it } from "vitest";
import { allocateFIFO, computeDocument } from "@/lib/erp";

describe("computeDocument", () => {
  it("applies line discount, then VAT, then document discount and charges", () => {
    const d = computeDocument(
      [{ qty: 2, unitPrice: "1000", discount: "100", vatPct: "15" }, { qty: 3, unitPrice: "33.33", discount: "0", vatPct: "0" }],
      { discount: "50", additionalCharge: "120" },
    );
    expect(d.lines[0]).toEqual({ net: "1900.00", vat: "285.00", lineTotal: "2185.00" });
    expect(d.lines[1]).toEqual({ net: "99.99", vat: "0.00", lineTotal: "99.99" });
    expect(d.subtotal).toBe("1999.99");
    expect(d.vatTotal).toBe("285.00");
    expect(d.total).toBe("2354.99"); // 1999.99 + 285 − 50 + 120
  });

  it("rejects a line discount above the line value and caps document discount", () => {
    expect(() => computeDocument([{ qty: 1, unitPrice: "10", discount: "11", vatPct: "0" }], {})).toThrow(/discount/i);
    expect(computeDocument([{ qty: 1, unitPrice: "10", discount: "0", vatPct: "0" }], { discount: "99" }).total).toBe("0.00");
  });
});

describe("allocateFIFO", () => {
  it("settles the oldest dues first and returns the remainder", () => {
    const r = allocateFIFO("1500", [{ id: "a", due: "1000" }, { id: "b", due: "800" }, { id: "c", due: "200" }]);
    expect(r.allocations).toEqual([{ id: "a", amount: "1000.00" }, { id: "b", amount: "500.00" }]);
    expect(r.remainder).toBe("0.00");
  });

  it("puts any excess into the remainder and skips zero dues", () => {
    const r = allocateFIFO("100", [{ id: "a", due: "0" }, { id: "b", due: "40.50" }]);
    expect(r.allocations).toEqual([{ id: "b", amount: "40.50" }]);
    expect(r.remainder).toBe("59.50");
  });
});
