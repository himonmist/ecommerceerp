import "server-only";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/errors";
import { authorize } from "@/server/security/permissions";
import type { Ctx } from "@/server/context";
import { audit } from "./audit";

export const TOGGLEABLE = { erp: "Wholesale ERP (sales & purchase)" } as const;
export type ToggleableModule = keyof typeof TOGGLEABLE;

export async function enabledModules(ctx: Ctx): Promise<Set<string>> {
  const rows = await withTenant(ctx.tenantId, (tx) => tx.tenantModule.findMany({ where: { enabled: true } }));
  return new Set(rows.map((r) => r.module));
}

export async function setModuleEnabled(ctx: Ctx, module: string, enabled: boolean) {
  authorize(ctx, "settings.manage");
  if (!(module in TOGGLEABLE)) throw new AppError("VALIDATION", "Unknown module.");
  return withTenant(ctx.tenantId, async (tx) => {
    await tx.tenantModule.upsert({ where: { tenantId_module: { tenantId: ctx.tenantId, module } }, create: { tenantId: ctx.tenantId, module, enabled }, update: { enabled } });
    await audit(tx, ctx, enabled ? "module.enabled" : "module.disabled", "module", module);
  });
}

/** Lightweight variant list for ERP document pickers. */
export async function variantOptions(ctx: Ctx) {
  if (!ctx.permissions.includes("sales.view") && !ctx.permissions.includes("purchase.view")) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  const rows = await withTenant(ctx.tenantId, (tx) => tx.productVariant.findMany({
    where: { product: { status: { not: "archived" } } },
    include: { product: { select: { name: true } }, stockLevels: true },
    orderBy: { product: { name: "asc" } }, take: 3000,
  }));
  return rows.map((v) => ({
    id: v.id,
    label: v.title === "Default" ? v.product.name : `${v.product.name} · ${v.title}`,
    sku: v.sku ?? "",
    salePrice: (v.offlinePrice ?? v.onlinePrice).toString(),
    cost: v.costPrice.toString(),
    available: v.stockLevels.reduce((a, s) => a + s.onHand - s.reserved, 0),
  }));
}
export type VariantOption = Awaited<ReturnType<typeof variantOptions>>[number];
