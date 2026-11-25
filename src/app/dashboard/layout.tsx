import Link from "next/link";
import { requireCtx } from "@/server/next/session";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { DashboardNav } from "./nav";
import { daysUntil } from "@/lib/dates";
import { enabledModules } from "@/server/services/modules";
import { logoutAction } from "../(auth)/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const daysLeft = ctx.tenant?.trialEndsAt ? daysUntil(ctx.tenant.trialEndsAt) : null;
  const modules = await enabledModules(ctx);
  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="bg-ink-950 p-4 print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-2"><Link href="/dashboard"><Logo dark /></Link></div>
        <div className="mt-6 hidden rounded-2xl border border-white/10 bg-white/5 p-3 lg:block">
          <p className="truncate text-sm font-semibold text-white">{ctx.tenant?.name}</p>
          <a href={`/s/${ctx.tenant?.slug}`} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-200 hover:text-white">
            View storefront <Icon.external className="h-3 w-3" />
          </a>
        </div>
        <div className="mt-4 lg:mt-6 lg:flex-1"><DashboardNav erp={modules.has("erp")} /></div>
        <form action={logoutAction} className="mt-4 hidden lg:block">
          <div className="mb-3 truncate px-3 text-xs text-slate-500">{ctx.user?.email}</div>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white">
            <Icon.logout className="h-5 w-5" />Sign out
          </button>
        </form>
      </aside>
      <div className="min-w-0">
        {ctx.readOnly ? (
          <div className="bg-rose-600 px-6 py-2.5 print:hidden text-center text-sm font-medium text-white">Your trial has ended — your store is read-only. Choose a plan in Settings to keep selling.</div>
        ) : ctx.tenant?.status === "trial" && daysLeft !== null ? (
          <div className="bg-brand-600 px-6 py-2.5 print:hidden text-center text-sm font-medium text-white">Free trial · {daysLeft} day{daysLeft === 1 ? "" : "s"} left. Everything is unlocked.</div>
        ) : null}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
