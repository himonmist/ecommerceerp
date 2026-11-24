"use client";
import { useActionState, useState } from "react";
import { registerAction } from "../actions";
import { ActionForm, Field, FormError, Submit } from "@/components/form";

const toSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, undefined);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const f = state?.fields ?? {};
  return (
    <ActionForm action={action} state={state} className="space-y-5" noValidate>
      <FormError message={state?.error} />
      <Field label="Your name" name="name" autoComplete="name" required maxLength={100} error={f.name} />
      <Field label="Store name" name="storeName" required maxLength={100} error={f.storeName}
        onChange={(e) => { if (!touched) setSlug(toSlug(e.target.value)); }} />
      <Field label="Store address" name="slug" required maxLength={40} value={slug} error={f.slug}
        onChange={(e) => { setTouched(true); setSlug(toSlug(e.target.value)); }}
        hint={slug ? `Your store will live at /s/${slug}` : "Lowercase letters, numbers and hyphens"} />
      <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={254} error={f.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128}
        error={f.password} hint="At least 10 characters with upper & lowercase letters and a number" />
      <Submit pendingText="Creating your store…">Create my store</Submit>
      <p className="text-center text-xs text-slate-500">10-day free trial · No card required</p>
    </ActionForm>
  );
}
