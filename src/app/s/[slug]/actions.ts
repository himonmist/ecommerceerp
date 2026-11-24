"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { placeOrder } from "@/server/services/orders";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { clientIp } from "@/server/next/session";
import { str, toState, type ActionState } from "@/server/next/action";
import { AppError } from "@/server/errors";
import { slugSchema } from "@/lib/validation";

export async function checkoutAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  let target: string;
  try {
    const s = slugSchema.parse(slug);
    const tenant = await prisma.tenant.findUnique({ where: { slug: s }, select: { id: true, status: true } });
    if (!tenant || tenant.status === "suspended") throw new AppError("NOT_FOUND", "Store not found.");
    await enforceRateLimit(`checkout:${tenant.id}:${ip ?? "unknown"}`, 10, 600);
    let items: unknown;
    try { items = JSON.parse(str(fd, "items") || "[]"); } catch { throw new AppError("VALIDATION", "Your cart could not be read. Please refresh."); }
    const order = await placeOrder(tenant.id, {
      name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"), address: str(fd, "address"),
      zoneId: str(fd, "zoneId"), couponCode: str(fd, "couponCode"), notes: str(fd, "notes"), items: items as never,
    }, { ip });
    target = `/s/${s}/order/${order.id}`;
  } catch (e) {
    return toState(e);
  }
  redirect(target);
}
