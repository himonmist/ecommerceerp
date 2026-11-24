import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCtx } from "@/server/next/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentCtx()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in to manage your store.</p>
      <div className="mt-8"><LoginForm /></div>
      <p className="mt-6 text-sm text-slate-600">New to Link Vision? <Link href="/register" className="font-semibold text-brand-600 hover:underline">Create a store</Link></p>
    </>
  );
}
