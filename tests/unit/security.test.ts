import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hasPermission, PERMISSIONS } from "@/server/security/permissions";

describe("password hashing", () => {
  it("uses argon2id and verifies correctly", async () => {
    const h = await hashPassword("Str0ng!Passw0rd");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Str0ng!Passw0rd")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });

  it("returns false (not throw) for malformed hashes", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("tokens", () => {
  it("generates 256-bit url-safe tokens and stable SHA-256 hashes", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});

describe("permissions", () => {
  it("grants by exact permission and denies otherwise", () => {
    expect(hasPermission(["catalog.view"], "catalog.view")).toBe(true);
    expect(hasPermission(["catalog.view"], "catalog.manage")).toBe(false);
    expect(PERMISSIONS).toContain("orders.manage");
  });
});
