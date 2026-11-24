import "server-only";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";

/** Fixed-window limiter stored in Postgres (works across serverless instances). */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; count: number }> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`;
  const count = Number(rows[0]?.count ?? 0);
  return { ok: count <= limit, count };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.");
}
