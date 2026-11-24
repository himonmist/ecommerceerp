import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { dashboardStats } from "@/server/services/orders";
import { formatBDT } from "@/lib/money";
import { Icon } from "@/components/icons";
import { PageHeader, StatusBadge, fmtDate, Empty } from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireCtx();
  const [stats, sp] = await Promise.all([dashboardStats(ctx), searchParams]);
  const cards = [
    { label: "Delivered revenue", value: formatBDT(stats.revenue), icon: Icon.chart, tint: "from-brand-500 to-accent-500" },
    { label: "Total orders", value: stats.ordersTotal.toLocaleString("en-US"), icon: Icon.cart, tint: "from-violet-500 to-fuchsia-500" },
    { label: "Pending orders", value: stats.pending.toLocaleString("en-US"), icon: Icon.bolt, tint: "from-amber-500 to-orange-500" },
    { label: "Low-stock variants", value: stats.lowStock.toLocaleString("en-US"), icon: Icon.box, tint: "from-rose-500 to-pink-500" },
  ];
  return (
    <>
      <PageHeader title={`Welcome${sp.welcome ? "" : " back"}, ${ctx.user?.name.split(" ")[0] ?? ""}`} subtitle={`${ctx.tenant?.name} · ${stats.today} order${stats.today === 1 ? "" : "s"} today`}
        action={<Link href="/dashboard/products/new" className="btn-primary"><Icon.plus className="h-4 w-4" />Add product</Link>} />
      {sp.welcome && (
        <div className="mb-8 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-6">
          <h2 className="font-bold text-slate-900">Your store is live 🎉</h2>
          <p className="mt-1 text-sm text-slate-600">Next: add your first product, then share your store link with customers.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/products/new" className="btn-primary">Add first product</Link>
            <a href={`/s/${ctx.tenant?.slug}`} target="_blank" rel="noopener" className="btn-secondary">Open storefront</a>
          </div>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: I, tint }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white`}><I className="h-5 w-5" /></span>
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent orders</h2>
          <Link href="/dashboard/orders" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link>
        </div>
        {stats.recent.length === 0 ? (
          <Empty title="No orders yet" body="Share your storefront link — new orders will appear here instantly." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100"><tr><th className="th">Order</th><th className="th">Customer</th><th className="th">Placed</th><th className="th">Total</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="td font-mono font-semibold"><Link href={`/dashboard/orders/${o.id}`} className="text-brand-700 hover:underline">{o.number}</Link></td>
                    <td className="td">{o.shippingName}</td>
                    <td className="td text-slate-500">{fmtDate(o.placedAt)}</td>
                    <td className="td font-semibold">{formatBDT(o.total)}</td>
                    <td className="td"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
