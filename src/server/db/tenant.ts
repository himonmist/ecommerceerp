import "server-only";
import { prisma } from "./client";
import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` in a transaction bound to one tenant. Postgres RLS policies read
 * `app.tenant_id`, so any query inside — ORM or raw SQL — can only see and
 * write that tenant's rows. The setting is transaction-local (safe with poolers).
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error("Invalid tenant id");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}
