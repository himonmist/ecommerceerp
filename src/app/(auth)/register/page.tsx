import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCtx } from "@/server/next/session";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create your store" };

export default async function RegisterPage() {
  if (await currentCtx()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Create your store</h1>
      <p className="mt-2 text-sm text-slate-600">Launch in minutes. Full access for 10 days.</p>
      <div className="mt-8"><RegisterForm /></div>
      <p className="mt-6 text-sm text-slate-600">Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link></p>
    </>
  );
}
