import { describe, expect, it } from "vitest";
import { computeTotals, couponDiscount, formatBDT } from "@/lib/money";

describe("pricing", () => {
  it("sums line items and shipping exactly (no float drift)", () => {
    const t = computeTotals([{ unitPrice: "0.10", qty: 3 }, { unitPrice: "1910.00", qty: 1 }], "70", "0");
    expect(t.subtotal).toBe("1910.30");
    expect(t.total).toBe("1980.30");
  });

  it("caps discount at subtotal so total never goes negative", () => {
    const t = computeTotals([{ unitPrice: "100", qty: 1 }], "0", "500");
    expect(t.discount).toBe("100.00");
    expect(t.total).toBe("0.00");
  });

  it("computes percent and fixed coupons with min-order rule", () => {
    expect(couponDiscount({ discountType: "percent", value: "10", minOrder: "0" }, "1999.99")).toBe("200.00");
    expect(couponDiscount({ discountType: "fixed", value: "150", minOrder: "1000" }, "999.99")).toBe("0.00");
    expect(couponDiscount({ discountType: "fixed", value: "150", minOrder: "1000" }, "1000")).toBe("150.00");
  });

  it("formats taka", () => {
    expect(formatBDT("1234567.5")).toBe("৳1,234,567.50");
    expect(formatBDT("-41100")).toBe("−৳41,100.00");
    expect(formatBDT("-0.004")).toBe("৳0.00");
  });
});
