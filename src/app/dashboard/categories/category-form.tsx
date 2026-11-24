"use client";
import { useActionState } from "react";
import { createCategoryAction } from "../actions";
import { ActionForm, Field, FormError, FormSuccess, Submit } from "@/components/form";

export function CategoryForm({ parents }: { parents: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createCategoryAction, undefined);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <Field label="Name" name="name" required maxLength={80} error={state?.fields?.name} />
      <div>
        <label className="label" htmlFor="parentId">Parent (optional)</label>
        <select id="parentId" name="parentId" className="input"><option value="">None</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <Field label="Description" name="description" maxLength={500} />
      <Submit pendingText="Saving…">Create category</Submit>
    </ActionForm>
  );
}
