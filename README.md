# Link Vision Commerce

**By Link Vision Software Solution.** A multi-tenant commerce platform for growing businesses in Bangladesh: online storefront, catalogue, real-time inventory and orders, with an ERP roadmap (sales/purchase, POS, double-entry accounting).

**Live:** https://linkvision-commerce.vercel.app

![Landing page](docs/screenshots/landing-hero.png)

![ERP direct invoice](docs/screenshots/erp-new-invoice.png)

This is **Phase 1 (MVP)** of the PRD in [`docs/vendrdesk-analysis/02-PRD.md`](docs/vendrdesk-analysis/02-PRD.md). The database follows the reference design in [`04-DATABASE.md`](docs/vendrdesk-analysis/04-DATABASE.md).

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, React 19 Server Components & Server Actions), TypeScript, Tailwind CSS 4 |
| Data | PostgreSQL 16 · Prisma 7 (`@prisma/adapter-pg`) · Zod 4 |
| Security | Postgres FORCE row-level security per tenant, argon2id, opaque DB sessions, CSP nonces, rate limiting, append-only audit trails |
| Quality | Vitest unit + integration tests against real Postgres (coverage gate), Playwright E2E (desktop + mobile), ESLint, `tsc`, CodeQL, `npm audit` in CI |
| Hosting | Vercel + Neon Postgres |

## What's in Phase 1

- **Tenancy & accounts.** Self-serve store signup with a 10-day trial (read-only after it ends). Owner, Manager and Staff roles with permission checks. Account lockout, rate limits, audit log.
- **Catalogue.** Products with variants, separate online and offline/POS prices, cost price, categories, brands, sales channel, SEO slug, plan product limits.
- **Inventory.** Default warehouse plus a multi-warehouse model. Opening stock, adjustments and low-stock alerts. An **immutable stock-movement ledger**.
- **Storefront.** `/s/{store}` (or `{store}.ROOT_DOMAIN`): catalogue, search, categories, product pages, cart, cash-on-delivery checkout, delivery zones, coupons.
- **Orders.** 10-stage lifecycle (pending → … → delivered / cancelled / returned) with automatic stock effects:
  - checkout **reserves** stock atomically, so concurrent shoppers can't oversell
  - cancel or return-to-origin **releases** the reservation
  - delivery **commits** the sale and marks COD orders paid
  - a return after delivery **restocks**

## Phase 2 — Wholesale ERP (sales & purchase)

You can switch the module on or off in **Settings → Modules**. It's on by default for new stores.

- **Sales**
  - customer types (default discount and credit days)
  - customers with a membership ID, credit limit (0 = no limit) and opening balance
  - price quotations: draft → sent → accepted/rejected, converted into an invoice exactly once
  - direct invoices with line discounts, VAT, a document discount and extra charges
  - split payments and use of customer advance; walk-in sales must be paid in full; credit limits are enforced; stock goes out atomically
  - money receipts settle the opening balance, then the oldest invoices (or invoices you pick); extra money becomes advance
  - customer returns with optional restock; voiding an unpaid invoice puts the stock back
  - printable statements and documents
- **Purchase**
  - supplier types and suppliers with an opening payable
  - purchase orders → goods receipts (GRN, partial deliveries allowed) → bills from those receipts; stock rises when goods arrive, and moving-average cost updates
  - direct bills (stock in) with payment at the counter
  - supplier payments with automatic or manual allocation and supplier advance
  - returns to supplier (debit notes)
- **Reports:** receivable and payable aging (opening, 0–30, 31–60, 61–90, 90+ days) and customer statements of account.
- **Integrity**
  - every document number comes from a per-store sequence (INV-, QT-, MR-, SR-, PO-, GRN-, BILL-, SP-, PR-)
  - stock changes write to the append-only movement ledger
  - money columns have database CHECK constraints (for example paid + returned ≤ total)
  - all 21 ERP tables are under FORCE row-level security and are reachable only through the `lv_app` role
- **Next (Phase 3):** double-entry accounting. Invoices, receipts, bills and payments already carry a `journal_id` slot for ledger posting.

## Getting started

```bash
cp .env.example .env              # point DATABASE_URL at a Postgres 16 database
npm install                       # also runs `prisma generate`
npm run db:migrate                # schema + RLS + reference data (plans)
npm run dev                       # http://localhost:3000
```

### Tests (TDD)

```bash
echo 'DATABASE_URL="postgresql://USER:PASS@localhost:5432/lv_test"' > .env.test
npx prisma migrate deploy         # with DATABASE_URL pointing at the test DB
npm test                          # unit + integration (real Postgres)
npm run test:coverage             # enforces ≥85% lines / ≥75% branches
npm run build && npm run test:e2e # Playwright E2E against a production build (uses E2E_DATABASE_URL)
```

## Project layout

```
prisma/                schema.prisma, migrations (init → security/RLS → seed plans), seed.ts
src/lib/               pure domain logic: order state machine, money, validation (shared by client & server)
src/server/db/         Prisma client + withTenant() (sets app.tenant_id for RLS)
src/server/security/   argon2id, tokens, RBAC, rate limiting
src/server/services/   domain services: tenants, auth, catalog, inventory, orders, coupons, storefront, audit
src/server/next/       Next.js glue: session cookies, action error mapping
src/app/               landing, auth, /dashboard, /s/[slug] storefront, /api/health
tests/unit|integration|e2e
```

## Deployment (Vercel + Neon)

Set these environment variables on Vercel:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** connection string (used by migrations) |
| `APP_URL` | Public URL, e.g. `https://your-app.vercel.app` |
| `ROOT_DOMAIN` | Optional. Set it for `{store}.ROOT_DOMAIN` storefront subdomains (needs a wildcard domain) |

Migrations run with `npm run db:migrate` (`prisma migrate deploy`) before promoting a release.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the threat model and the security controls at each SDLC stage.
