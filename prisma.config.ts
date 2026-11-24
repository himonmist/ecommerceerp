import { defineConfig } from "prisma/config";

// DATABASE_URL is the pooled runtime URL; DIRECT_URL (optional) is used for migrations.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
});
