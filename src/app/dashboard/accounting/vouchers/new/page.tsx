import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccounting } from "@/server/next/accounting";
import { listAccounts } from "@/server/services/accounting/accounts";
import { PageHeader } from "@/components/ui";
import { VoucherForm } from "../../forms";
import { createVoucherAction } from "../../actions";

export const metadata = { title: "New voucher" };
const TITLE = { CV: "Income / receipt voucher", DV: "Expense / payment voucher", JV: "Journal voucher", TM: "Transfer money" } as const;

export default async function NewVoucher({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { ctx } = await requireAccounting();
  const type = (await searchParams).type as keyof typeof TITLE;
  if (!TITLE[type]) notFound();
  const accounts = (await listAccounts(ctx)).filter((a) => a.isActive).map((a) => ({ id: a.id, code: a.code, name: a.name, nature: a.nature, kind: a.kind }));
  return (
    <>
      <Link href="/dashboard/accounting/journals" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Entries</Link>
      <PageHeader title={TITLE[type]} subtitle="Posts straight to the ledger unless saved as a draft." />
      <div className="mb-6 flex flex-wrap gap-2">{(Object.keys(TITLE) as (keyof typeof TITLE)[]).map((t) => <Link key={t} href={`?type=${t}`} className={`rounded-full px-4 py-1.5 text-sm font-medium ${t === type ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{t}</Link>)}</div>
      <VoucherForm key={type} action={createVoucherAction} accounts={accounts} type={type} />
    </>
  );
}
