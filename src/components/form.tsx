"use client";
import { createContext, useContext, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";

const PendingCtx = createContext(false);

/**
 * Form bound to a server action that keeps the user's input when the action
 * returns an error (React resets forms submitted via the `action` prop).
 * Without JavaScript it still posts via `action` (progressive enhancement).
 */
export function ActionForm({ action, state, resetOnSuccess = false, children, ...rest }: {
  action: (fd: FormData) => void;
  state?: { ok?: boolean } | undefined;
  resetOnSuccess?: boolean;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnSuccess && state?.ok) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <PendingCtx.Provider value={pending}>
      <form ref={ref} {...rest} action={action} aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          start(() => action(fd));
        }}>
        {children}
      </form>
    </PendingCtx.Provider>
  );
}

export function usePending() {
  const { pending } = useFormStatus();
  return useContext(PendingCtx) || pending;
}

export function Field({ label, name, error, hint, ...props }: { label: string; name: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={name} className="input" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} {...props} />
      {error ? <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Submit({ children, className = "btn-primary w-full", pendingText = "Please wait…", ...rest }: { children: React.ReactNode; className?: string; pendingText?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const pending = usePending();
  return <button type="submit" className={className} disabled={pending} {...rest}>{pending ? pendingText : children}</button>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{message}</div>;
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>;
}
