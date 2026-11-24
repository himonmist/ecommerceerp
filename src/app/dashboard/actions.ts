"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { str, toState, type ActionState } from "@/server/next/action";
import { archiveProduct, createCategory, createProduct, updateProduct } from "@/server/services/catalog";
import { adjustStock } from "@/server/services/inventory";
import { transitionOrder } from "@/server/services/orders";
import { createCoupon, setCouponActive } from "@/server/services/coupons";
import { AppError } from "@/server/errors";
import type { OrderStatus } from "@/lib/order-status";

function parseVariants(fd: FormData) {
  const rows = new Map<number, Record<string, string>>();
  for (const [k, v] of fd.entries()) {
    const m = /^variants\[(\d{1,2})\]\[(\w+)\]$/.exec(k);
    if (!m || typeof v !== "string") continue;
    const i = Number(m[1]);
    rows.set(i, { ...(rows.get(i) ?? {}), [m[2]!]: v });
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, r]) => r);
}

function productFields(fd: FormData) {
  return {
    name: str(fd, "name"), categoryId: str(fd, "categoryId"), brandName: str(fd, "brandName"),
    channel: str(fd, "channel") as "omni" | "online" | "offline", status: str(fd, "status") as "draft" | "active" | "archived",
    shortDescription: str(fd, "shortDescription"), description: str(fd, "description"), imageUrl: str(fd, "imageUrl"),
    isFeatured: fd.get("isFeatured") === "on",
  };
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  let id: string;
  try {
    const p = await createProduct(ctx, { ...productFields(fd), variants: parseVariants(fd) as never });
    id = p.id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/products");
  redirect(`/dashboard/products/${id}?created=1`);
}

export async function updateProductAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await updateProduct(ctx, id, { ...productFields(fd), variants: parseVariants(fd) as never });
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/dashboard/products/${id}`);
  return { ok: true, message: "Product saved." };
}

export async function archiveProductAction(id: string) {
  const ctx = await requireCtx();
  await archiveProduct(ctx, id);
  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function adjustStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await adjustStock(ctx, { variantId: str(fd, "variantId"), change: str(fd, "change") as unknown as number, reason: str(fd, "reason") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Stock updated." };
}

export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await createCategory(ctx, { name: str(fd, "name"), description: str(fd, "description"), parentId: str(fd, "parentId") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/categories");
  return { ok: true, message: "Category created." };
}

export async function transitionOrderAction(orderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    const to = str(fd, "to");
    if (!to) throw new AppError("VALIDATION", "Choose a status.");
    await transitionOrder(ctx, orderId, to as OrderStatus, str(fd, "note") || undefined);
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/orders");
  return { ok: true, message: "Order updated." };
}

export async function createCouponAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await createCoupon(ctx, {
      code: str(fd, "code"), discountType: str(fd, "discountType") as "percent" | "fixed", value: str(fd, "value"),
      minOrder: str(fd, "minOrder"), usageLimit: str(fd, "usageLimit") as unknown as number, expiresAt: str(fd, "expiresAt") as unknown as Date,
    });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/coupons");
  return { ok: true, message: "Coupon created." };
}

export async function toggleCouponAction(id: string, active: boolean) {
  const ctx = await requireCtx();
  await setCouponActive(ctx, id, active);
  revalidatePath("/dashboard/coupons");
}
