import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireCtx } from "./session";
import { enabledModules } from "@/server/services/modules";
import { AppError } from "@/server/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Require a session and the ERP module; otherwise send the user to Settings. */
export async function requireErp() {
  const ctx = await requireCtx();
  if (!(await enabledModules(ctx)).has("erp")) redirect("/dashboard/settings?module=erp");
  return ctx;
}

/** Load a record by route id; malformed ids and NOT_FOUND become a 404 page. */
export async function load<T>(id: string, fn: () => Promise<T>): Promise<T> {
  if (!UUID.test(id)) notFound();
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}

export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
