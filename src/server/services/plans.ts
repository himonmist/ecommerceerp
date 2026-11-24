import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

import { PLAN_SEED } from "./plans.data";
export { PLAN_SEED };

export async function seedPlans(db: PrismaClient) {
  for (const p of PLAN_SEED) {
    await db.plan.upsert({ where: { code: p.code }, create: { ...p, features: [...p.features] }, update: { ...p, features: [...p.features] } });
  }
}

export async function listPlans(db: PrismaClient) {
  return db.plan.findMany({ orderBy: { sortOrder: "asc" } });
}
