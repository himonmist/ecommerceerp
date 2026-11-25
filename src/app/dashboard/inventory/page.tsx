import { requireCtx } from "@/server/next/session";
import { listMovements } from "@/server/services/inventory";
import { Empty, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Inventory" };
const TYPE: Record<string, string> = { opening: "Opening stock", sale: "Sale", sales_return: "Customer return", adjustment_in: "Adjustment +", adjustment_out: "Adjustment −", purchase: "Purchase / GRN", purchase_return: "Return to supplier", invoice_void: "Invoice voided", transfer_in: "Transfer in", transfer_out: "Transfer out" };

export default async function InventoryPage() {
  const ctx = await requireCtx();
  const moves = await listMovements(ctx, 100);
  return (
    <>
      <PageHeader title="Stock movements" subtitle="An append-only audit trail of every change to on-hand stock." />
      {moves.length === 0 ? <Empty title="No stock movements yet" body="Opening stock, sales, returns and adjustments will appear here." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100"><tr><th className="th">When</th><th className="th">Product</th><th className="th">Type</th><th className="th">Reference</th><th className="th text-right">Before</th><th className="th text-right">Change</th><th className="th text-right">After</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="td text-slate-500">{fmtDate(m.createdAt)}</td>
                  <td className="td"><span className="font-medium text-slate-900">{m.productName}</span><span className="block text-xs text-slate-500">{m.variantTitle}</span></td>
                  <td className="td">{TYPE[m.type] ?? m.type}</td>
                  <td className="td text-slate-500">{m.reference ?? m.notes ?? "—"}</td>
                  <td className="td text-right">{m.qtyBefore}</td>
                  <td className={`td text-right font-semibold ${m.qtyChange > 0 ? "text-emerald-700" : "text-rose-700"}`}>{m.qtyChange > 0 ? "+" : ""}{m.qtyChange}</td>
                  <td className="td text-right font-semibold">{m.qtyAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
