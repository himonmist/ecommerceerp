import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { hasPermission } from "@/server/security/permissions";
import { listTransfers, listWarehouses, stockMatrix } from "@/server/services/warehouses";
import { Empty, PageHeader, Pagination } from "@/components/ui";
import { TransferForm } from "../../pos/forms";
import { createTransferAction } from "../../pos/actions";

export const metadata = { title: "Stock transfers" };

export default async function Transfers({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const data = await listTransfers(ctx, { page: Number(sp.page) || 1 });
  const canManage = hasPermission(ctx.permissions, "inventory.manage") && !ctx.readOnly;
  const locations = canManage ? await listWarehouses(ctx) : [];
  const variants = canManage ? (await stockMatrix(ctx, {})).rows : [];
  return (
    <>
      <Link href="/dashboard/locations" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Locations</Link>
      <PageHeader title="Stock transfers" subtitle="Move stock between warehouses and showrooms with a transfer challan." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {data.items.length === 0 ? <Empty title="No transfers yet" body="Replenish a showroom from the warehouse with a transfer." /> : (
            <div className="card overflow-x-auto"><table className="w-full">
              <thead className="border-b border-slate-100"><tr><th className="th">Challan</th><th className="th">Date</th><th className="th">From</th><th className="th">To</th><th className="th text-right">Units</th><th className="th">Carrier</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.items.map((t) => <tr key={t.id}><td className="td font-mono">{t.number}</td><td className="td">{t.date.toISOString().slice(0, 10)}</td><td className="td">{t.from}</td><td className="td">{t.to}</td><td className="td text-right font-semibold">{t.units}</td><td className="td">{t.carrier ?? "—"}</td></tr>)}</tbody></table></div>
          )}
          <Pagination page={data.page} pages={data.pages} base="/dashboard/locations/transfers" params={{}} />
        </div>
        {canManage && locations.length > 1 && <section className="card h-fit p-6"><h2 className="mb-4 font-bold">New transfer</h2>
          <TransferForm action={createTransferAction} locations={locations.map((l) => ({ id: l.id, label: l.name }))} variants={variants.map((v) => ({ id: v.id, label: `${v.label} (${v.total})` }))} /></section>}
        {canManage && locations.length < 2 && <p className="text-sm text-slate-500">Add a second location to start transferring stock.</p>}
      </div>
    </>
  );
}
