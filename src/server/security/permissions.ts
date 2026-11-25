import { AppError } from "@/server/errors";
import type { Ctx } from "@/server/context";

export const PERMISSIONS = [
  "dashboard.view",
  "catalog.view", "catalog.manage",
  "inventory.manage",
  "orders.view", "orders.manage",
  "customers.view",
  "marketing.manage",
  "sales.view", "sales.manage",
  "purchase.view", "purchase.manage",
  "accounting.view", "accounting.manage", "accounting.verify",
  "pos.use", "pos.manage",
  "settings.manage",
  "team.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, Permission[]> = {
  Owner: [...PERMISSIONS],
  Manager: ["dashboard.view", "catalog.view", "catalog.manage", "inventory.manage", "orders.view", "orders.manage", "customers.view", "marketing.manage",
    "sales.view", "sales.manage", "purchase.view", "purchase.manage", "accounting.view", "accounting.manage", "pos.use", "pos.manage"],
  Staff: ["dashboard.view", "catalog.view", "orders.view", "orders.manage", "customers.view", "sales.view", "purchase.view", "pos.use"],
};

export const hasPermission = (granted: readonly string[], p: Permission) => granted.includes(p);

/** Authorise a mutation: permission + subscription not read-only. */
export function authorize(ctx: Ctx, p: Permission, opts: { write?: boolean } = { write: true }) {
  if (!hasPermission(ctx.permissions, p)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  if (opts.write !== false && ctx.readOnly) throw new AppError("TRIAL_EXPIRED", "Your trial has ended. Choose a plan to keep making changes.");
}
