"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { str, toState, type ActionState } from "@/server/next/action";
import { closeShift, createRegister, openShift, posSale, recordCashMovement } from "@/server/services/pos";
import { createTransfer, createWarehouse } from "@/server/services/warehouses";
import { lookupCustomerByPhone } from "@/server/services/erp/customers";

export type SaleResult =
  | { ok: true; invoiceId: string; number: string; total: string; change: string; paid: { method: string; amount: string }[] }
  | { ok: false; error: string };

/** Called directly from the register screen (no form round-trip). */
export async function posSaleAction(shiftId: string, payload: unknown): Promise<SaleResult> {
  const ctx = await requireCtx();
  try {
    const { invoice, change } = await posSale(ctx, shiftId, payload as never);
    revalidatePath(`/dashboard/pos/shifts/${shiftId}`);
    return { ok: true, invoiceId: invoice.id, number: invoice.number, total: invoice.total.toString(), change, paid: [] };
  } catch (e) {
    const s = toState(e);
    return { ok: false, error: s?.error ?? "Sale failed." };
  }
}

export async function findCustomerAction(phone: string) {
  const ctx = await requireCtx();
  return lookupCustomerByPhone(ctx, phone);
}

export async function createRegisterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await createRegister(ctx, { name: str(fd, "name"), warehouseId: str(fd, "warehouseId") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/pos");
  return { ok: true, message: "Register added." };
}

export async function openShiftAction(registerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await openShift(ctx, registerId, { openingFloat: str(fd, "openingFloat") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/dashboard/pos/${registerId}`);
  redirect(`/dashboard/pos/${registerId}`);
}

export async function cashMovementAction(shiftId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await recordCashMovement(ctx, shiftId, { type: str(fd, "type") as never, amount: str(fd, "amount"), reason: str(fd, "reason") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/dashboard/pos/shifts/${shiftId}`);
  return { ok: true, message: "Recorded." };
}

export async function closeShiftAction(shiftId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await closeShift(ctx, shiftId, { countedCash: str(fd, "countedCash"), notes: str(fd, "notes") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/pos", "layout");
  redirect(`/dashboard/pos/shifts/${shiftId}?closed=1`);
}

export async function createWarehouseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await createWarehouse(ctx, { name: str(fd, "name"), type: str(fd, "type") as never, address: str(fd, "address") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/locations");
  return { ok: true, message: "Location added." };
}

export async function createTransferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const items: { variantId: string; qty: string }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^items\[(\d{1,3})\]\[(variantId|qty)\]$/.exec(k);
    if (!m || typeof v !== "string") continue;
    const i = Number(m[1]);
    items[i] = { ...(items[i] ?? { variantId: "", qty: "" }), [m[2]!]: v };
  }
  try {
    await createTransfer(ctx, { fromWarehouseId: str(fd, "fromWarehouseId"), toWarehouseId: str(fd, "toWarehouseId"), date: str(fd, "date"),
      carrier: str(fd, "carrier"), notes: str(fd, "notes"), items: items.filter((x) => x && x.variantId) as never });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/locations", "layout");
  return { ok: true, message: "Transfer recorded — stock moved." };
}
