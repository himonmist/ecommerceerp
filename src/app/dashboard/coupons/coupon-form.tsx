"use client";
import { useActionState } from "react";
import { createCouponAction } from "../actions";
import { ActionForm, Field, FormError, FormSuccess, Submit } from "@/components/form";

export function CouponForm() {
  const [state, action] = useActionState(createCouponAction, undefined);
  const f = state?.fields ?? {};
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <Field label="Code" name="code" required maxLength={32} placeholder="EID10" error={f.code} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="discountType">Type</label>
          <select id="discountType" name="discountType" className="input"><option value="percent">Percent %</option><option value="fixed">Fixed ৳</option></select></div>
        <Field label="Value" name="value" required inputMode="decimal" error={f.value} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min. order ৳" name="minOrder" inputMode="decimal" error={f.minOrder} />
        <Field label="Usage limit" name="usageLimit" type="number" min={1} error={f.usageLimit} />
      </div>
      <Field label="Expires on" name="expiresAt" type="date" error={f.expiresAt} />
      <Submit pendingText="Saving…">Create coupon</Submit>
    </ActionForm>
  );
}
