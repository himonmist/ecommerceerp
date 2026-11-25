import Link from "next/link";
import { requireAccounting } from "@/server/next/accounting";
import { listAccounts } from "@/server/services/accounting/accounts";
import { hasPermission } from "@/server/security/permissions";
import { formatBDT } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { AccountForm } from "../forms";
import { createAccountAction } from "../actions";

export const metadata = { title: "Chart of accounts" };
const NATURES = [["asset", "Assets"], ["liability", "Liabilities"], ["equity", "Equity"], ["income", "Income"], ["expense", "Expenses"]] as const;

export default async function Accounts() {
  const { ctx } = await requireAccounting();
  const accounts = await listAccounts(ctx);
  const canManage = hasPermission(ctx.permissions, "accounting.manage") && !ctx.readOnly;
  return (
    <>
      <PageHeader title="Chart of accounts" subtitle="Balances shown on each account's normal side." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {NATURES.map(([n, label]) => {
            const items = accounts.filter((a) => a.nature === n);
            const sign = n === "asset" || n === "expense" ? 1 : -1;
            const total = items.reduce((s, a) => s + Number(a.balance) * sign, 0);
            return (
              <section key={n} className="card overflow-x-auto">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="font-bold">{label}</h2><span className="text-sm font-semibold">{formatBDT(total)}</span></div>
                <table className="w-full"><tbody className="divide-y divide-slate-100">
                  {items.map((a) => (
                    <tr key={a.id}><td className="td w-20 font-mono text-slate-500">{a.code}</td>
                      <td className="td"><Link className="font-medium text-slate-900 hover:text-brand-700" href={`/dashboard/accounting/reports/general-ledger?account=${a.id}`}>{a.name}</Link>
                        {a.systemKey && <span className="ml-2 badge bg-slate-100 text-slate-500">system</span>}{a.kind && <span className="ml-2 badge bg-brand-50 text-brand-700">{a.kind}</span>}</td>
                      <td className="td text-slate-500">{a.groupName}</td><td className="td text-right font-semibold">{formatBDT(Number(a.balance) * sign)}</td></tr>
                  ))}
                </tbody></table>
              </section>
            );
          })}
        </div>
        {canManage && <section className="card h-fit p-6"><h2 className="mb-4 font-bold">Add account</h2><AccountForm action={createAccountAction} /></section>}
      </div>
    </>
  );
}
