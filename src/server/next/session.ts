import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionContext } from "@/server/services/auth";
import type { Ctx } from "@/server/context";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-lv_session" : "lv_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Cached per request so layouts and pages share one lookup. */
export const currentCtx = cache(async (): Promise<Ctx | null> => {
  const ctx = await getSessionContext(await sessionToken());
  if (ctx) ctx.ip = await clientIp();
  return ctx;
});

export async function requireCtx(): Promise<Ctx> {
  const ctx = await currentCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
