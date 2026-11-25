import "server-only";
import { seedLedger } from "./accounting/ledger";
import { prisma } from "@/server/db/client";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { hashPassword } from "@/server/security/password";
import { ROLE_PRESETS } from "@/server/security/permissions";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { audit } from "./audit";
import { DEFAULT_SEQUENCES } from "./sequences";

export const TRIAL_DAYS = 10;
export const MODULES = ["storefront", "erp", "pos", "meta", "marketing", "inbox", "sms", "fraud", "finance"] as const;
const DEFAULT_ZONES = [
  { name: "Inside Dhaka", charge: "70", eta: "1–2 days", sortOrder: 1 },
  { name: "Dhaka Suburbs", charge: "100", eta: "2–3 days", sortOrder: 2 },
  { name: "Outside Dhaka", charge: "130", eta: "3–5 days", sortOrder: 3 },
];

const CONFLICT = new AppError("CONFLICT", "That email or store address is already registered.");

export async function registerStore(raw: RegisterInput, meta: { ip?: string | null }) {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;

  const [emailTaken, slugTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.tenant.findUnique({ where: { slug: input.slug }, select: { id: true } }),
  ]);
  if (emailTaken || slugTaken) throw CONFLICT;

  const passwordHash = await hashPassword(input.password);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "launch" } });
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 864e5);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
      const tenant = await tx.tenant.create({
        data: { slug: input.slug, name: input.storeName, ownerUserId: user.id, trialEndsAt, contactEmail: input.email },
      });
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      const roles = [];
      for (const [name, permissions] of Object.entries(ROLE_PRESETS)) {
        roles.push(await tx.role.create({ data: { tenantId: tenant.id, name, permissions, isSystem: true } }));
      }
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, roleId: roles.find((r) => r.name === "Owner")!.id } });
      await tx.warehouse.create({ data: { tenantId: tenant.id, name: "Main Warehouse", isDefault: true } });
      await tx.shippingZone.createMany({ data: DEFAULT_ZONES.map((z) => ({ ...z, tenantId: tenant.id })) });
      await tx.documentSequence.createMany({ data: DEFAULT_SEQUENCES.map((s) => ({ ...s, tenantId: tenant.id })) });
      await tx.tenantModule.createMany({ data: MODULES.map((m) => ({ tenantId: tenant.id, module: m, enabled: m === "storefront" || m === "erp" })) });
      await seedLedger(tx, tenant.id);
      await tx.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: "trialing", currentPeriodStart: now, currentPeriodEnd: trialEndsAt },
      });
      await audit(tx, { tenantId: tenant.id, userId: user.id, ip: meta.ip }, "tenant.registered", "tenant", tenant.id, undefined, { slug: tenant.slug });
      return { tenantId: tenant.id, userId: user.id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw CONFLICT;
    throw e;
  }
}
