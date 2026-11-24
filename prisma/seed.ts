import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLAN_SEED } from "../src/server/services/plans.data";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });
  for (const p of PLAN_SEED) {
    await prisma.plan.upsert({ where: { code: p.code }, create: { ...p, features: [...p.features] }, update: { ...p, features: [...p.features] } });
  }
  console.warn(`Seeded ${PLAN_SEED.length} plans`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
