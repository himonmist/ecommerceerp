import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { registerStore } from "@/server/services/tenants";
import { getSessionContext, login, logout } from "@/server/services/auth";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

describe("store registration", () => {
  it("provisions tenant, owner role, membership, default warehouse, zones and a trial", async () => {
    const s = await makeStore();
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId } });
    expect(t.status).toBe("trial");
    expect(t.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 9 * 864e5);
    const data = await withTenant(s.tenantId, async (tx) => ({
      roles: await tx.role.findMany(),
      wh: await tx.warehouse.findMany(),
      zones: await tx.shippingZone.findMany(),
      subs: await tx.subscription.findMany({ include: { plan: true } }),
      audit: await tx.auditLog.findMany({ where: { action: "tenant.registered" } }),
    }));
    expect(data.roles.find((r) => r.name === "Owner")?.permissions).toContain("settings.manage");
    expect(data.wh.filter((w) => w.isDefault)).toHaveLength(1);
    expect(data.zones.length).toBeGreaterThanOrEqual(2);
    expect(data.subs[0]?.plan.code).toBe("launch");
    expect(data.audit).toHaveLength(1);
  });

  it("rejects a duplicate slug or email without leaking which one", async () => {
    const s = await makeStore();
    await expect(registerStore({ name: "Xavier", email: "new@example.com", password: "Str0ng!Passw0rd", storeName: "Xavier Store", slug: s.slug }, {}))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(registerStore({ name: "Xavier", email: s.email, password: "Str0ng!Passw0rd", storeName: "Xavier Store", slug: "brand-new-slug" }, {}))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("never stores plaintext passwords", async () => {
    const s = await makeStore();
    const u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(u.passwordHash).not.toContain(s.password);
    expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
});

describe("login & sessions", () => {
  it("issues an opaque session whose raw token is never stored", async () => {
    const s = await makeStore();
    const rows = await prisma.session.findMany({ where: { userId: s.userId } });
    expect(rows.some((r) => r.id === s.token)).toBe(false);
    expect(s.ctx.tenantId).toBe(s.tenantId);
    expect(s.ctx.permissions).toContain("orders.manage");
  });

  it("uses a generic error for wrong password and unknown email", async () => {
    const s = await makeStore();
    await expect(login(s.email, "nope-nope", {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(login("ghost@example.com", "nope-nope", {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("locks the account after 5 failures, even with the right password", async () => {
    const s = await makeStore();
    for (let i = 0; i < 5; i++) await login(s.email, "bad", {}).catch(() => undefined);
    await expect(login(s.email, s.password, {})).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
  });

  it("invalidates the session on logout and rejects expired sessions", async () => {
    const s = await makeStore();
    await logout(s.token);
    expect(await getSessionContext(s.token)).toBeNull();
    const { token } = await login(s.email, s.password, {});
    await prisma.session.updateMany({ where: { userId: s.userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSessionContext(token)).toBeNull();
    expect(await getSessionContext("garbage")).toBeNull();
  });
});

describe("row-level security", () => {
  it("isolates tenants even for raw SQL", async () => {
    const a = await makeStore();
    const b = await makeStore();
    const seenByA = await withTenant(a.tenantId, (tx) => tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM warehouses`);
    expect(seenByA.every((r) => r.tenant_id === a.tenantId)).toBe(true);
    expect(seenByA.some((r) => r.tenant_id === b.tenantId)).toBe(false);
  });

  it("returns nothing and refuses writes without a tenant context", async () => {
    await makeStore();
    expect(await prisma.warehouse.count()).toBe(0);
    await expect(
      prisma.brand.create({ data: { tenantId: "0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a", name: "X" } }),
    ).rejects.toThrow();
  });

  it("refuses to write a row for another tenant from inside a tenant context", async () => {
    const a = await makeStore();
    const b = await makeStore();
    await expect(withTenant(a.tenantId, (tx) => tx.brand.create({ data: { tenantId: b.tenantId, name: "Sneaky" } }))).rejects.toThrow();
  });
});
