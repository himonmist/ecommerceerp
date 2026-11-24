export type ErrorCode =
  | "VALIDATION" | "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "UNAUTHENTICATED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "PLAN_LIMIT" | "TRIAL_EXPIRED" | "INSUFFICIENT_STOCK"
  | "INVALID_TRANSITION" | "COUPON_INVALID" | "RATE_LIMITED";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400, INVALID_CREDENTIALS: 401, ACCOUNT_LOCKED: 423, UNAUTHENTICATED: 401, FORBIDDEN: 403,
  NOT_FOUND: 404, CONFLICT: 409, PLAN_LIMIT: 402, TRIAL_EXPIRED: 402, INSUFFICIENT_STOCK: 409,
  INVALID_TRANSITION: 409, COUPON_INVALID: 422, RATE_LIMITED: 429,
};

/** Errors whose message is safe to show to end users. Anything else is logged and replaced. */
export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
  }
  get status() { return STATUS[this.code]; }
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "P2002";
}

export function fromZod(error: { issues: { path: PropertyKey[]; message: string }[] }): AppError {
  const fields: Record<string, string> = {};
  for (const i of error.issues) {
    const k = i.path.map(String).join(".") || "form";
    fields[k] ??= i.message;
  }
  return new AppError("VALIDATION", "Please check the highlighted fields.", fields);
}
