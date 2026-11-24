import { prisma } from "@/server/db/client";
import { seedPlans } from "@/server/services/plans";
import { registerStore } from "@/server/services/tenants";
import { getSessionContext, login } from "@/server/services/auth";
import type { Ctx } from "@/server/context";

export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await seedPlans(prisma);
}

let n = 0;
export async function makeStore(overrides: Partial<{ slug: string; email: string }> = {}) {
  n++;
  const slug = overrides.slug ?? `store-${n}-${Date.now().toString(36)}`;
  const email = overrides.email ?? `owner-${n}-${Date.now()}@example.com`;
  const password = "Str0ng!Passw0rd";
  const res = await registerStore({ name: "Owner", email, password, storeName: `Store ${n}`, slug }, { ip: "127.0.0.1" });
  const { token } = await login(email, password, { ip: "127.0.0.1" });
  const ctx = (await getSessionContext(token)) as Ctx;
  return { ...res, slug, email, password, token, ctx };
}
