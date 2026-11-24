import "server-only";
import type { Tx } from "@/server/db/tenant";

export const DEFAULT_SEQUENCES = [{ docType: "order", prefix: "ORD-" }] as const;

/** Atomically allocate the next document number (row lock serialises concurrent callers). */
export async function nextNumber(tx: Tx, tenantId: string, docType: string, pad = 6): Promise<string> {
  const rows = await tx.$queryRaw<{ prefix: string; value: number }[]>`
    UPDATE document_sequences SET next_value = next_value + 1
    WHERE tenant_id = ${tenantId}::uuid AND doc_type = ${docType}
    RETURNING prefix, next_value - 1 AS value`;
  const row = rows[0];
  if (!row) throw new Error(`No sequence configured for ${docType}`);
  return `${row.prefix}${String(row.value).padStart(pad, "0")}`;
}
