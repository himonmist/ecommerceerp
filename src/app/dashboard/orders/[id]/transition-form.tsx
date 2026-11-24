"use client";
import { useActionState } from "react";
import { transitionOrderAction } from "../../actions";
import { ActionForm, FormError, FormSuccess, Submit } from "@/components/form";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

export function TransitionForm({ orderId, next }: { orderId: string; next: OrderStatus[] }) {
  const [state, action] = useActionState(transitionOrderAction.bind(null, orderId), undefined);
  if (next.length === 0) return <p className="text-sm text-slate-500">This order is closed — no further status changes.</p>;
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="space-y-3">
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <label className="label" htmlFor="note">Note (optional)</label>
      <input id="note" name="note" maxLength={500} className="input" placeholder="e.g. Called customer, confirmed address" />
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <Submit key={s} name="to" value={s} pendingText="Updating…" className={s === "cancelled" || s === "returned" ? "btn-secondary text-rose-700" : "btn-primary"}>
            Mark {STATUS_LABEL[s].toLowerCase()}
          </Submit>
        ))}
      </div>
    </ActionForm>
  );
}
