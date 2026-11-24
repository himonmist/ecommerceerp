"use client";
import { useActionState } from "react";
import { adjustStockAction } from "../../actions";
import { ActionForm, FormError, FormSuccess, Submit } from "@/components/form";

export function StockForm({ variants }: { variants: { id: string; title: string; onHand: number; reserved: number }[] }) {
  const [state, action] = useActionState(adjustStockAction, undefined);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="space-y-3">
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <div>
        <label className="label" htmlFor="variantId">Variant</label>
        <select id="variantId" name="variantId" className="input">
          {variants.map((v) => <option key={v.id} value={v.id}>{v.title} — {v.onHand} on hand, {v.reserved} reserved</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="change">Change (±)</label><input id="change" name="change" type="number" required className="input" placeholder="e.g. 10 or -2" /></div>
        <div><label className="label" htmlFor="reason">Reason</label><input id="reason" name="reason" required minLength={3} maxLength={200} className="input" placeholder="Stock count" /></div>
      </div>
      <Submit className="btn-secondary w-full" pendingText="Updating…">Apply adjustment</Submit>
    </ActionForm>
  );
}
