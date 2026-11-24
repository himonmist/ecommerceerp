import "server-only";
import { AppError } from "@/server/errors";

export type ActionState = { ok?: boolean; error?: string; fields?: Record<string, string>; message?: string } | undefined;

/** Convert thrown errors into a safe state for forms. Unknown errors are logged, never leaked. */
export function toState(e: unknown): ActionState {
  if (e instanceof AppError) return { error: e.message, fields: e.fields };
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
  console.error("[action] unexpected error", e);
  return { error: "Something went wrong. Please try again." };
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
