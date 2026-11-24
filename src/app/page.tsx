import Link from "next/link";
import { connection } from "next/server";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { PLAN_SEED } from "@/server/services/plans.data";

const NAV = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Modules", "#modules"],
  ["Security", "#security"],
  ["Pricing", "#pricing"],
] as const;

const FEATURES = [
  { icon: Icon.store, title: "Beautiful storefront in minutes", body: "Claim your store link, add products and start taking orders. Mobile-first pages built for Facebook and Instagram traffic." },
  { icon: Icon.box, title: "Real-time inventory", body: "Every sale, return and adjustment writes an immutable stock movement. Atomic reservations make overselling impossible." },
  { icon: Icon.cart, title: "Orders without the chaos", body: "One timeline from Pending to Delivered. Clear status flow, COD settlement and full order history per customer." },
  { icon: Icon.truck, title: "Delivery zones built in", body: "Inside Dhaka, suburbs, outside Dhaka — set charges once and checkout calculates totals correctly every time." },
  { icon: Icon.tag, title: "Coupons that can't be abused", body: "Percent or fixed discounts with minimum order, usage limits and expiry, enforced server-side at checkout." },
  { icon: Icon.users, title: "Team roles & audit trail", body: "Owner, Manager and Staff roles with granular permissions. Every change is recorded with who, what and when." },
];

const MODULES = [
  { title: "Online Storefront", desc: "Catalogue, cart, checkout, delivery zones", live: true, span: "md:col-span-2" },
  { title: "Orders & Fulfilment", desc: "10-stage lifecycle with stock effects", live: true, span: "" },
  { title: "Inventory & Warehouses", desc: "Movements, adjustments, low-stock alerts", live: true, span: "" },
  { title: "Wholesale ERP", desc: "Invoices, quotations, challans, supplier bills", live: false, span: "" },
  { title: "Point of Sale", desc: "Shifts, barcode checkout, split tender", live: false, span: "" },
  { title: "Double-entry Accounting", desc: "Vouchers, ledgers, P&L, balance sheet, VAT", live: false, span: "md:col-span-2" },
];

const SECURITY = [
  ["Tenant isolation in the database", "PostgreSQL row-level security on every business table — even a coding mistake can't read another store's data."],
  ["Modern password security", "Argon2id hashing, account lockout and rate-limited sign-in protect against credential stuffing."],
  ["Strict browser protections", "Per-request CSP nonces, HSTS, clickjacking and MIME-sniffing protection on every page."],
  ["Tamper-evident records", "Stock movements, order events and audit logs are append-only, enforced by database triggers."],
  ["Opaque, rotating sessions", "256-bit HttpOnly session cookies; only a SHA-256 fingerprint is ever stored server-side."],
  ["Tested at every stage", "Test-driven development and automated CI with dependency audits and end-to-end checks before every deploy."],
];

const FAQ = [
  ["Do I need a credit card to start?", "No. Every store starts with a 10-day free trial with full access. After that, choose a plan and pay with bKash."],
  ["Can I use my own domain?", "Yes. Your store gets a free link instantly, and paid plans can connect a custom domain."],
  ["Is my data safe from other stores?", "Each store's data is isolated at the database level with row-level security, on top of application checks."],
  ["Will you add ERP, POS and accounting?", "Yes — they are on the roadmap and will plug into the same products, stock and orders you manage today."],
];

const BARS = ["h-[38%]", "h-[52%]", "h-[44%]", "h-[67%]", "h-[58%]", "h-[79%]", "h-[72%]", "h-[91%]", "h-[84%]", "h-full", "h-[88%]", "h-[96%]"];

function DashboardMock() {
  const orders = [
    ["ORD-000128", "Nusrat J.", "৳4,388", "Delivered", "bg-emerald-400/15 text-emerald-300"],
    ["ORD-000127", "Rahim U.", "৳1,910", "Shipped", "bg-sky-400/15 text-sky-300"],
    ["ORD-000126", "Tania A.", "৳2,650", "Confirmed", "bg-amber-400/15 text-amber-300"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-brand-600/40 via-accent-500/20 to-transparent blur-2xl animate-glow" />
      <div className="relative animate-float rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" /></div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-slate-400">Link Vision · Dashboard</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[["Revenue", "৳3.38L", "+18%"], ["Orders", "1,284", "+12%"], ["Low stock", "7", "items"]].map(([k, v, d]) => (
            <div key={k} className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-[11px] text-slate-400">{k}</p>
              <p className="mt-1 text-lg font-bold text-white">{v}</p>
              <p className="text-[11px] text-emerald-300">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <div className="flex h-24 items-end gap-1.5">
            {BARS.map((h, i) => <div key={i} className={`flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-accent-400 ${h}`} />)}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {orders.map(([n, c, t, s, cls]) => (
            <div key={n} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
              <span className="font-mono text-slate-300">{n}</span>
              <span className="text-slate-400">{c}</span>
              <span className="font-semibold text-white">{t}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-6 -left-6 hidden animate-fade-up items-center gap-3 rounded-2xl border border-white/10 bg-white p-3 pr-5 shadow-2xl [animation-delay:600ms] sm:flex">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-white"><Icon.cart className="h-5 w-5" /></span>
        <span><span className="block text-xs font-semibold text-slate-900">New order · ৳4,388</span><span className="block text-[11px] text-slate-500">Inside Dhaka · Cash on delivery</span></span>
      </div>
      <div className="absolute -right-4 -top-5 hidden animate-fade-up items-center gap-2 rounded-2xl border border-white/10 bg-white p-3 shadow-2xl [animation-delay:900ms] sm:flex">
        <Icon.shield className="h-5 w-5 text-brand-600" /><span className="text-xs font-semibold text-slate-900">Stock reserved atomically</span>
      </div>
    </div>
  );
}

export default async function Home() {
  await connection(); // render per request so the CSP nonce is applied to framework scripts
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6" aria-label="Main">
          <Link href="/" aria-label="Link Vision Commerce home"><Logo dark /></Link>
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map(([l, h]) => <li key={h}><a href={h} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">{l}</a></li>)}
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white sm:block">Log in</Link>
            <Link href="/register" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 shadow-lg transition hover:bg-brand-50">Start free</Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate bg-ink-950 pb-24 pt-32 text-white sm:pb-32 sm:pt-40">
        <div className="absolute inset-0 -z-10 grid-bg [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="absolute -top-40 left-1/2 -z-10 h-[38rem] w-[58rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-700/40 via-accent-500/25 to-brand-500/30 blur-3xl animate-glow" />
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> By Link Vision Software Solution
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Run your whole business <span className="text-gradient">from one vision.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Launch a fast online store, track every unit of stock, and move orders from checkout to doorstep — with bank-grade security from day one.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/register" className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-brand-600/30 transition hover:brightness-110">
                Start your 10-day free trial <Icon.arrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a href="#features" className="rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/5">See what&apos;s inside</a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              {["No card required", "Pay in bKash", "Live in minutes"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Icon.check className="h-4 w-4 text-accent-400" />{t}</li>
              ))}
            </ul>
          </div>
          <DashboardMock />
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50/60 py-6" aria-label="Built for local commerce">
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-12 whitespace-nowrap text-sm font-semibold uppercase tracking-widest text-slate-400">
            {[0, 1].flatMap((k) =>
              ["Cash on Delivery", "bKash", "Nagad", "Steadfast", "Pathao", "RedX", "Meta Pixel", "Bangla QR", "Mushak VAT", "Multi-warehouse", "Role-based access"].map((x) => <span key={`${k}-${x}`}>{x}</span>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {[["< 5 min", "from sign-up to a live store"], ["0", "oversold orders — stock is reserved atomically"], ["10", "order stages with automatic stock effects"], ["256-bit", "opaque, rotating session tokens"]].map(([v, l]) => (
            <div key={l} className="card p-6">
              <dt className="text-3xl font-extrabold tracking-tight text-brand-700">{v}</dt>
              <dd className="mt-2 text-sm text-slate-600">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">Everything to sell properly</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Simple where it should be. Powerful where Facebook selling breaks down.</h2>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: I, title, body }) => (
            <article key={title} className="group card relative overflow-hidden p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-600/5">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full transition group-hover:bg-brand-100/60" />
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-600/25"><I className="h-6 w-6" /></span>
              <h3 className="relative mt-5 text-lg font-bold">{title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-20 bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Live in three steps</h2>
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {[["Claim your store", "Pick a name and your free store link."], ["Add products", "Set online and in-store prices, variants and opening stock in seconds."], ["Take orders", "Customers check out on your storefront; orders land in your dashboard instantly."]].map(([t, d], i) => (
              <li key={t} className="card relative p-7">
                <span className="text-5xl font-black text-brand-100">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-bold">{t}</h3>
                <p className="mt-2 text-sm text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="modules" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">One platform, growing with you</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Start with a store. Grow into a complete ERP.</h2>
          </div>
          <Link href="/register" className="btn-secondary">Create your store <Icon.arrow className="h-4 w-4" /></Link>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.title} className={`relative overflow-hidden rounded-3xl border p-7 ${m.span} ${m.live ? "border-brand-100 bg-gradient-to-br from-brand-50 to-white" : "border-slate-200 bg-white"}`}>
              <span className={`badge ${m.live ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{m.live ? "Live now" : "Coming next"}</span>
              <h3 className="mt-4 text-xl font-bold">{m.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="security" className="relative isolate scroll-mt-20 overflow-hidden bg-ink-950 py-24 text-white">
        <div className="absolute inset-0 -z-10 grid-bg opacity-60" />
        <div className="absolute -left-40 top-10 -z-10 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent-400"><Icon.lock className="h-4 w-4" /> Secure by design</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Your customers&apos; data deserves bank-grade protection.</h2>
            <p className="mt-4 text-slate-300">Security is built into every layer and every stage of how we build — not bolted on later.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
                <Icon.shield className="h-6 w-6 text-accent-400" />
                <h3 className="mt-4 font-bold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">Pricing</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Start free. Pay when you&apos;re ready to grow.</h2>
          <p className="mt-4 text-slate-600">10 days of full access. Yearly plans include two months free.</p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLAN_SEED.map((p) => {
            const hot = p.code === "build";
            return (
              <div key={p.code} className={`relative flex flex-col rounded-3xl border p-8 ${hot ? "border-brand-500 bg-ink-950 text-white shadow-2xl shadow-brand-600/20 lg:-translate-y-3" : "border-slate-200 bg-white"}`}>
                {hot && <span className="absolute -top-3 left-8 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1 text-xs font-bold text-white">Most popular</span>}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">৳{Number(p.priceMonthly).toLocaleString("en-US")}</span>
                  <span className={hot ? "text-slate-400" : "text-slate-500"}>{p.code === "launch" ? "for 10 days" : "/month"}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><Icon.check className={`mt-0.5 h-4 w-4 shrink-0 ${hot ? "text-accent-400" : "text-brand-600"}`} />{f}</li>)}
                </ul>
                <Link href="/register" className={`mt-8 ${hot ? "btn bg-white text-ink-950 hover:bg-brand-50" : "btn-primary"}`}>{p.code === "launch" ? "Start free trial" : `Choose ${p.name}`}</Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Questions, answered</h2>
          <div className="mt-10 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group card p-5 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {q}<Icon.plus className="h-5 w-5 text-slate-400 transition group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-600 via-brand-700 to-ink-950 px-8 py-16 text-center text-white shadow-2xl">
          <div className="absolute inset-0 grid-bg opacity-40" />
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Your next order is one link away.</h2>
            <p className="mx-auto mt-4 max-w-xl text-brand-100">Replace spreadsheets and Messenger chaos with one clear dashboard.</p>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-brand-700 shadow-xl transition hover:bg-brand-50">
              Create my store <Icon.arrow className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Link Vision Software Solution. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
