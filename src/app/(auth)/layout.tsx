import Link from "next/link";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit"><Logo /></Link>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">{children}</main>
        <p className="text-xs text-slate-400">© {new Date().getFullYear()} Link Vision Software Solution</p>
      </div>
      <aside className="relative isolate hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="absolute inset-0 -z-10 grid-bg opacity-70" />
        <div className="absolute -right-24 -top-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-brand-600/50 to-accent-500/30 blur-3xl animate-glow" />
        <blockquote className="max-w-md">
          <p className="text-2xl font-semibold leading-snug">&ldquo;We moved our orders out of Messenger and finally know what&apos;s in stock.&rdquo;</p>
          <footer className="mt-4 text-sm text-slate-400">Built for growing merchants in Bangladesh</footer>
        </blockquote>
        <ul className="mt-10 space-y-3 text-sm text-slate-300">
          {["Database-level tenant isolation", "Argon2id passwords & account lockout", "Encrypted, HttpOnly sessions"].map((t) => (
            <li key={t} className="flex items-center gap-2"><Icon.shield className="h-4 w-4 text-accent-400" />{t}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
