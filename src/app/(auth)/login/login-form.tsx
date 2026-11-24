"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";
import { ActionForm, Field, FormError, Submit } from "@/components/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <ActionForm action={action} state={state} className="space-y-5" noValidate>
      <FormError message={state?.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <Submit pendingText="Signing in…">Sign in</Submit>
    </ActionForm>
  );
}
