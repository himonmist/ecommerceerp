import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/next/session";
import { load } from "@/server/next/erp";
import { hasPermission } from "@/server/security/permissions";
import { currentShift, listRegisters, posCatalog } from "@/server/services/pos";
import { PageHeader } from "@/components/ui";
import { OpenShiftForm } from "../forms";
import { openShiftAction } from "../actions";
import { Register } from "./register";

export const metadata = { title: "Register" };

export default async function RegisterPage({ params }: { params: Promise<{ registerId: string }> }) {
  const ctx = await requireCtx();
  if (!hasPermission(ctx.permissions, "pos.use")) notFound();
  const { registerId } = await params;
  const reg = (await listRegisters(ctx)).find((r) => r.id === registerId);
  if (!reg) notFound();
  const shift = await load(registerId, () => currentShift(ctx, registerId));
  if (!shift) {
    return (
      <>
        <Link href="/dashboard/pos" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Registers</Link>
        <PageHeader title={reg.name} subtitle={`Sells from ${reg.location}`} />
        <section className="card max-w-md p-6"><h2 className="mb-1 font-bold">Open a shift</h2><p className="mb-4 text-sm text-slate-500">Count the cash in the drawer before you start selling.</p>
          {ctx.readOnly ? <p className="text-sm text-rose-600">Your store is read-only.</p> : <OpenShiftForm action={openShiftAction.bind(null, registerId)} />}</section>
      </>
    );
  }
  const catalog = await posCatalog(ctx, registerId);
  return <Register shiftId={shift.id} shiftNumber={shift.number} registerName={reg.name} storeName={ctx.tenant?.name ?? ""} catalog={catalog} />;
}
