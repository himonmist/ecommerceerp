import { requireCtx } from "@/server/next/session";
import { listCoupons } from "@/server/services/coupons";
import { formatBDT } from "@/lib/money";
import { Empty, PageHeader } from "@/components/ui";
import { CouponForm } from "./coupon-form";
import { toggleCouponAction } from "../actions";

export const metadata = { title: "Coupons" };

export default async function CouponsPage() {
  const ctx = await requireCtx();
  const coupons = await listCoupons(ctx);
  return (
    <>
      <PageHeader title="Coupons" subtitle="Discounts are validated and counted on the server at checkout." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {coupons.length === 0 ? <Empty title="No coupons yet" body="Create a code like EID10 for 10% off." /> : (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100"><tr><th className="th">Code</th><th className="th">Discount</th><th className="th">Min. order</th><th className="th">Used</th><th className="th">Expires</th><th className="th"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {coupons.map((c) => (
                    <tr key={c.id}>
                      <td className="td font-mono font-semibold">{c.code}</td>
                      <td className="td">{c.discountType === "percent" ? `${c.value.toString()}%` : formatBDT(c.value)}</td>
                      <td className="td">{formatBDT(c.minOrder)}</td>
                      <td className="td">{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                      <td className="td text-slate-500">{c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : "Never"}</td>
                      <td className="td text-right">
                        <form action={toggleCouponAction.bind(null, c.id, !c.isActive)}>
                          <button className={c.isActive ? "btn-secondary" : "btn-primary"}>{c.isActive ? "Disable" : "Enable"}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <section className="card h-fit p-6"><h2 className="mb-4 font-bold">New coupon</h2><CouponForm /></section>
      </div>
    </>
  );
}
