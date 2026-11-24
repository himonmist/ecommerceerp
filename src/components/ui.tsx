import Link from "next/link";
import { STATUS_LABEL, isOrderStatus } from "@/lib/order-status";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800", confirmed: "bg-sky-100 text-sky-800", preparing: "bg-indigo-100 text-indigo-800",
  ready: "bg-violet-100 text-violet-800", packed: "bg-fuchsia-100 text-fuchsia-800", shipped: "bg-blue-100 text-blue-800",
  out_for_delivery: "bg-cyan-100 text-cyan-800", delivered: "bg-emerald-100 text-emerald-800", cancelled: "bg-slate-200 text-slate-700",
  returned: "bg-rose-100 text-rose-800", active: "bg-emerald-100 text-emerald-800", draft: "bg-slate-200 text-slate-700",
  archived: "bg-slate-100 text-slate-500", paid: "bg-emerald-100 text-emerald-800", unpaid: "bg-amber-100 text-amber-800", refunded: "bg-rose-100 text-rose-800",
};

export function StatusBadge({ status }: { status: string }) {
  const label = isOrderStatus(status) ? STATUS_LABEL[status] : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`badge ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700"}`}>{label}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-2xl">✦</div>
      <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Pagination({ page, pages, base, params }: { page: number; pages: number; base: string; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${q}`;
  };
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-slate-500">Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-secondary" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-secondary" href={href(page + 1)}>Next</Link>}
      </div>
    </nav>
  );
}

export const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" }).format(d);
