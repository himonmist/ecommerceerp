import "server-only";
import type { Tx } from "@/server/db/tenant";
import type { Ctx } from "@/server/context";
import type { Prisma } from "@/generated/prisma/client";

type Actor = Pick<Ctx, "tenantId" | "userId" | "ip"> | { tenantId: string; actorType: "system" | "customer"; ip?: string | null };

const toJson = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

export async function audit(tx: Tx, actor: Actor, action: string, entityType: string, entityId: string | null, before?: unknown, after?: unknown) {
  const isUser = "userId" in actor;
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      actorType: isUser ? "user" : actor.actorType,
      actorId: isUser ? actor.userId : null,
      action, entityType, entityId,
      before: toJson(before), after: toJson(after),
      ip: actor.ip ?? null,
    },
  });
}
