import { describe, expect, it } from "vitest";
import { registerSchema, productSchema, checkoutSchema, slugify, isReservedSlug } from "@/lib/validation";

describe("validation", () => {
  const base = { name: "Nadia Rahman", email: "Nadia@Example.com", password: "Str0ng!Passw0rd", storeName: "Nadia Fashion", slug: "nadia-fashion" };

  it("normalises email and accepts a strong registration", () => {
    const r = registerSchema.parse(base);
    expect(r.email).toBe("nadia@example.com");
  });

  it("rejects weak passwords, bad slugs and reserved slugs", () => {
    expect(registerSchema.safeParse({ ...base, password: "password" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, slug: "Bad Slug" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, slug: "-x" }).success).toBe(false);
    expect(isReservedSlug("admin")).toBe(true);
    expect(registerSchema.safeParse({ ...base, slug: "www" }).success).toBe(false);
  });

  it("slugifies names", () => {
    expect(slugify("  Akij 32 Pcs Dinner Set (GD) A-Grade! ")).toBe("akij-32-pcs-dinner-set-gd-a-grade");
  });

  it("requires at least one variant with a non-negative price", () => {
    const ok = productSchema.safeParse({ name: "Mug", variants: [{ title: "Default", onlinePrice: "250", stock: 4 }] });
    expect(ok.success).toBe(true);
    expect(productSchema.safeParse({ name: "Mug", variants: [] }).success).toBe(false);
    expect(productSchema.safeParse({ name: "Mug", variants: [{ title: "D", onlinePrice: "-1", stock: 0 }] }).success).toBe(false);
    expect(productSchema.safeParse({ name: "Mug", variants: [{ title: "D", onlinePrice: "1.234", stock: 0 }] }).success).toBe(false);
  });

  it("validates Bangladeshi phone numbers at checkout and caps quantities", () => {
    const item = { variantId: "0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a", qty: 1 };
    const c = { name: "Rahim", phone: "01712345678", address: "House 1, Road 2, Dhanmondi", zoneId: item.variantId, items: [item] };
    expect(checkoutSchema.safeParse(c).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...c, phone: "12345" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...c, items: [{ ...item, qty: 0 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...c, items: [{ ...item, qty: 1000 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...c, phone: "+8801712345678" }).data?.phone).toBe("01712345678");
  });
});
