"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { registerStore } from "@/server/services/tenants";
import { login, logout } from "@/server/services/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { clearSessionCookie, clientIp, sessionToken, setSessionCookie } from "@/server/next/session";
import { str, toState, type ActionState } from "@/server/next/action";

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  const input = { name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password"), storeName: str(fd, "storeName"), slug: str(fd, "slug") };
  try {
    await enforceRateLimit(`register:${ip ?? "unknown"}`, 5, 3600);
    await registerStore(input, { ip });
    const s = await login(input.email, input.password, { ip, userAgent: (await headers()).get("user-agent") });
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    return toState(e);
  }
  redirect("/dashboard?welcome=1");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  const email = str(fd, "email").trim().toLowerCase();
  try {
    await enforceRateLimit(`login:ip:${ip ?? "unknown"}`, 20, 600);
    await enforceRateLimit(`login:email:${email}`, 10, 600);
    const s = await login(email, str(fd, "password"), { ip, userAgent: (await headers()).get("user-agent") });
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    return toState(e);
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  const token = await sessionToken();
  if (token) await logout(token);
  await clearSessionCookie();
  redirect("/login");
}
