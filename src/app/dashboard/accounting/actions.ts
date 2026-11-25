"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { str, toState, type ActionState } from "@/server/next/action";
import { initializeLedger } from "@/server/services/accounting/ledger";
import { approveVoucher, cancelVoucher, createVoucher, verifyVoucher } from "@/server/services/accounting/vouchers";
import { createAccount, setPeriodLock } from "@/server/services/accounting/accounts";

function rows(fd: FormData, prefix: string) {
  const re = new RegExp(`^${prefix}\\[(\\d{1,3})\\]\\[(\\w+)\\]$`);
  const map = new Map<number, Record<string, string>>();
  for (const [k, v] of fd.entries()) {
    const m = re.exec(k);
    if (!m || typeof v !== "string") continue;
    map.set(Number(m[1]), { ...(map.get(Number(m[1])) ?? {}), [m[2]!]: v });
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([, r]) => r);
}

export async function setupLedgerAction(): Promise<void> {
  const ctx = await requireCtx();
  await initializeLedger(ctx);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/accounting?setup=1");
}

export async function createVoucherAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const type = str(fd, "type");
  const head = { date: str(fd, "date"), description: str(fd, "description"), reference: str(fd, "reference"), status: (fd.get("asDraft") === "on" ? "draft" : "approved") as "draft" | "approved" };
  const lines = rows(fd, "lines").filter((l) => l.accountId);
  let id: string;
  try {
    const input = type === "TM" ? { type, ...head, fromAccountId: str(fd, "fromAccountId"), toAccountId: str(fd, "toAccountId"), amount: str(fd, "amount") }
      : type === "JV" ? { type, ...head, lines }
      : { type, ...head, moneyAccountId: str(fd, "moneyAccountId"), lines };
    id = (await createVoucher(ctx, input as never)).id;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/accounting", "layout");
  redirect(`/dashboard/accounting/journals/${id}?created=1`);
}

export async function journalAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const op = str(fd, "op");
  try {
    if (op === "approve") await approveVoucher(ctx, id);
    else if (op === "verify") await verifyVoucher(ctx, id);
    else if (op === "cancel") await cancelVoucher(ctx, id, str(fd, "reason") || "Cancelled");
    else return { error: "Unknown action." };
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/accounting", "layout");
  redirect(`/dashboard/accounting/journals/${id}?done=${op}`);
}

export async function createAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  try {
    await createAccount(ctx, { name: str(fd, "name"), nature: str(fd, "nature") as never, groupName: str(fd, "groupName"), kind: str(fd, "kind") as never, description: str(fd, "description") });
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/accounting/accounts");
  return { ok: true, message: "Account created." };
}

export async function periodLockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const date = fd.get("reopen") === "1" ? null : str(fd, "lockedThrough");
  try {
    await setPeriodLock(ctx, date);
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/dashboard/accounting");
  return { ok: true, message: date ? `Books closed through ${date}.` : "Period reopened." };
}
