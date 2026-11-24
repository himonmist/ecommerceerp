import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError, fromZod, isUniqueViolation } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { couponSchema } from "@/lib/validation";
import { audit } from "./audit";
import type { z } from "zod";

export async function createCoupon(ctx: Ctx, raw: z.input<typeof couponSchema>) {
  authorize(ctx, "marketing.manage");
  const parsed = couponSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const c = parsed.data;
  if (c.discountType === "percent" && Number(c.value) > 100) throw new AppError("VALIDATION", "Percent discounts cannot exceed 100.", { value: "Max 100" });
  try {
    return await withTenant(ctx.tenantId, async (tx) => {
      const coupon = await tx.coupon.create({
        data: { tenantId: ctx.tenantId, code: c.code, discountType: c.discountType, value: c.value, minOrder: c.minOrder ?? "0",
          usageLimit: c.usageLimit ?? null, expiresAt: c.expiresAt ?? null },
      });
      await audit(tx, ctx, "coupon.created", "coupon", coupon.id, undefined, { code: coupon.code });
      return coupon;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "That coupon code already exists.");
    throw e;
  }
}

export async function listCoupons(ctx: Ctx) {
  authorize(ctx, "marketing.manage", { write: false });
  return withTenant(ctx.tenantId, (tx) => tx.coupon.findMany({ orderBy: { code: "asc" } }));
}

export async function setCouponActive(ctx: Ctx, id: string, isActive: boolean) {
  authorize(ctx, "marketing.manage");
  return withTenant(ctx.tenantId, async (tx) => {
    const found = await tx.coupon.findUnique({ where: { id } });
    if (!found) throw new AppError("NOT_FOUND", "Coupon not found.");
    const c = await tx.coupon.update({ where: { id }, data: { isActive } });
    await audit(tx, ctx, isActive ? "coupon.enabled" : "coupon.disabled", "coupon", id);
    return c;
  });
}
