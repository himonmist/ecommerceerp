import { headers } from "next/headers";
import { requireCtx } from "@/server/next/session";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { formatBDT } from "@/lib/money";
import { PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { FormSuccess } from "@/components/form";
import { TOGGLEABLE, enabledModules } from "@/server/services/modules";
import { hasPermission } from "@/server/security/permissions";
import { toggleModuleAction } from "../erp/actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const modules = await enabledModules(ctx);
  const canSettings = hasPermission(ctx.permissions, "settings.manage") && !ctx.readOnly;
  const host = (await headers()).get("host") ?? "";
  const [plans, data] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    withTenant(ctx.tenantId, async (tx) => ({
      sub: await tx.subscription.findFirst({ include: { plan: true }, orderBy: { currentPeriodStart: "desc" } }),
      zones: await tx.shippingZone.findMany({ orderBy: { sortOrder: "asc" } }),
      audit: await tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      roles: await tx.role.findMany({ orderBy: { name: "asc" } }),
    })),
  ]);
  const proto = host.startsWith("localhost") ? "http" : "https";
  return (
    <>
      <PageHeader title="Settings" subtitle="Store, plan, delivery and security overview." />
      {sp.module === "erp" && !modules.has("erp") && <div className="mb-6"><FormSuccess message="Turn on the Wholesale ERP module below to use sales invoices, purchase orders and supplier bills." /></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6 lg:col-span-2">
          <h2 className="font-bold">Modules</h2>
          <p className="mt-1 text-sm text-slate-500">Turning a module off hides its menus. Your records are kept.</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {Object.entries(TOGGLEABLE).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between py-3">
                <span><span className="font-semibold">{label}</span><span className={`ml-3 badge ${modules.has(key) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{modules.has(key) ? "On" : "Off"}</span></span>
                {canSettings && <form action={toggleModuleAction.bind(null, key, !modules.has(key))}><button className={modules.has(key) ? "btn-secondary" : "btn-primary"}>{modules.has(key) ? "Turn off" : "Turn on"}</button></form>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-6">
          <h2 className="font-bold">Store</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Name</dt><dd className="font-medium">{ctx.tenant?.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Storefront</dt><dd className="truncate font-mono text-brand-700"><a href={`/s/${ctx.tenant?.slug}`} target="_blank" rel="noopener">{proto}://{host}/s/{ctx.tenant?.slug}</a></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge status={ctx.tenant?.status ?? ""} /></dd></div>
          </dl>
        </section>
        <section className="card p-6">
          <h2 className="font-bold">Plan</h2>
          <p className="mt-2 text-sm text-slate-600">Current: <strong>{data.sub?.plan.name}</strong>{data.sub ? ` · until ${data.sub.currentPeriodEnd.toISOString().slice(0, 10)}` : ""}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id} className={`rounded-xl border p-3 text-sm ${data.sub?.planId === p.id ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                <p className="font-semibold">{p.name}</p><p className="text-slate-500">{formatBDT(p.priceMonthly)}/mo</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Plan upgrades with bKash payment are coming in the next release. Contact Link Vision support to upgrade now.</p>
        </section>
        <section className="card p-6">
          <h2 className="font-bold">Delivery zones</h2>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {data.zones.map((z) => <li key={z.id} className="flex justify-between py-2"><span>{z.name} <span className="text-slate-400">· {z.eta}</span></span><span className="font-semibold">{formatBDT(z.charge)}</span></li>)}
          </ul>
        </section>
        <section className="card p-6">
          <h2 className="font-bold">Roles & permissions</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {data.roles.map((r) => <li key={r.id}><p className="font-semibold">{r.name}</p><p className="text-xs text-slate-500">{r.permissions.join(" · ")}</p></li>)}
          </ul>
        </section>
        <section className="card p-6 lg:col-span-2">
          <h2 className="font-bold">Recent activity (audit log)</h2>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {data.audit.map((a) => <li key={a.id} className="flex justify-between gap-4 py-2"><span className="font-mono text-xs">{a.action}</span><span className="text-slate-500">{a.actorType}{a.ip ? ` · ${a.ip}` : ""}</span><span className="text-slate-400">{fmtDate(a.createdAt)}</span></li>)}
          </ul>
        </section>
      </div>
    </>
  );
}
