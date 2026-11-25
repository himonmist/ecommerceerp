import "server-only";
import type { Tx } from "@/server/db/tenant";

/** Document prefixes. Sequences are created on first use, so new document types reach existing stores. */
export const PREFIXES = {
  order: "ORD-", customer: "CMID-", quotation: "QT-", invoice: "INV-", receipt: "MR-", sales_return: "SR-",
  purchase_order: "PO-", grn: "GRN-", bill: "BILL-", supplier_payment: "SP-", purchase_return: "PR-",
  journal: "JE-", shift: "SH-", transfer: "TRN-", CV: "CV-", DV: "DV-", JV: "JV-", TM: "TM-",
} as const;
export type DocType = keyof typeof PREFIXES;
export const DEFAULT_SEQUENCES = [{ docType: "order", prefix: PREFIXES.order }] as const;

/** Atomically allocate the next document number (the row lock serialises concurrent callers). */
export async function nextNumber(tx: Tx, tenantId: string, docType: DocType, pad = 6): Promise<string> {
  const rows = await tx.$queryRaw<{ prefix: string; value: number }[]>`
    INSERT INTO document_sequences (tenant_id, doc_type, prefix, next_value)
    VALUES (${tenantId}::uuid, ${docType}, ${PREFIXES[docType]}, 2)
    ON CONFLICT (tenant_id, doc_type) DO UPDATE SET next_value = document_sequences.next_value + 1
    RETURNING prefix, next_value - 1 AS value`;
  const row = rows[0];
  if (!row) throw new Error(`Could not allocate a number for ${docType}`);
  return `${row.prefix}${String(row.value).padStart(pad, "0")}`;
}
