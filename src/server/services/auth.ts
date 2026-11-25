import "server-only";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/errors";
import { dummyHash, verifyPassword } from "@/server/security/password";
import { generateToken, hashToken } from "@/server/security/tokens";
import type { Ctx } from "@/server/context";
import { ROLE_PRESETS } from "@/server/security/permissions";

export const SESSION_TTL_MS = 7 * 864e5;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const INVALID = () => new AppError("INVALID_CREDENTIALS", "Incorrect email or password.");

type Meta = { ip?: string | null; userAgent?: string | null };

export async function login(emailRaw: string, password: string, meta: Meta) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await verifyPassword(await dummyHash(), password); // equalise timing
    throw INVALID();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("ACCOUNT_LOCKED", "Too many failed attempts. Try again in 15 minutes.");
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    const failures = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failures >= MAX_FAILURES
        ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
        : { failedLoginCount: failures },
    });
    throw INVALID();
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { tenant: { createdAt: "asc" } },
  });
  const token = generateToken();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    prisma.session.create({
      data: {
        id: hashToken(token), userId: user.id, tenantId: membership?.tenantId ?? null,
        ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    }),
  ]);
  return { token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function getSessionContext(token: string | undefined | null): Promise<Ctx | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  if (!session.tenantId) return null;

  const [membership, tenant] = await Promise.all([
    prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } } }),
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
  ]);
  if (!membership || membership.status !== "active" || !tenant || tenant.status === "suspended") return null;
  const role = await withTenant(tenant.id, (tx) => tx.role.findUnique({ where: { id: membership.roleId } }));

  // Sliding expiry: renew when less than half the lifetime remains.
  if (session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2) {
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  }

  const trialOver = tenant.status === "trial" && !!tenant.trialEndsAt && tenant.trialEndsAt < new Date();
  return {
    tenantId: tenant.id,
    userId: session.userId,
    // Built-in roles always reflect the current presets, so new modules reach existing stores.
    permissions: role ? (role.isSystem && ROLE_PRESETS[role.name] ? [...ROLE_PRESETS[role.name]!] : role.permissions) : [],
    readOnly: trialOver || tenant.status === "read_only",
    ip: session.ip,
    user: { name: session.user.name, email: session.user.email },
    tenant: { name: tenant.name, slug: tenant.slug, status: tenant.status, trialEndsAt: tenant.trialEndsAt },
  };
}
