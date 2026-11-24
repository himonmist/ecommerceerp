# PRD — Unified Commerce + ERP Platform for Bangladeshi SMEs
*(reverse-engineered from VendrDesk. Working name: "the Platform")*

| | |
|---|---|
| Status | Draft v1.0 — 2026-11-24 |
| Basis | Read-only walkthrough of VendrDesk (323 screens), see `01-FEATURES.md` |
| Scope | Multi-tenant SaaS: online storefront, POS, wholesale ERP, double-entry accounting, logistics, Meta social commerce, AI agents |

---

## 1. Problem

Small and mid-size merchants in Bangladesh usually run several disconnected tools at once:

- a Facebook page plus Messenger for taking orders
- a notebook or Excel sheet for stock
- a separate accounting tool (or none)
- manual courier booking on the Pathao, Steadfast and RedX portals
- bKash screenshots as proof of payment

The result is lost orders, fake COD orders that cost return fees, stock that never matches, and no real P&L. Wholesale and retail businesses with a showroom need both an **online store** and an **offline ERP** (invoices, challans, supplier bills, credit customers), and they need both to share one inventory and one ledger.

## 2. Vision

One workspace where a merchant can **sell online, sell in-store, buy from suppliers, ship with local couriers, and see audited books**, with every transaction posting automatically to a double-entry ledger. AI agents can operate the store, but a human approves every change.

## 3. Goals & success metrics

| Goal | Metric (target, 12 months) |
|---|---|
| Fast onboarding | Signup → live storefront with ≥1 product in **< 15 min** (p50) |
| Activation | 60% of trials finish the setup checklist (logo, products, delivery, pixel) |
| Paid conversion | 12% of trials → paid within 30 days |
| Ops efficiency | 80% of online orders auto-dispatched to a courier with no manual booking |
| Fraud savings | 30% fewer RTO (return-to-origin) orders for merchants using the risk checker |
| Book accuracy | Trial balance always balances (0 unbalanced vouchers; enforced by the system) |
| Reliability | 99.9% storefront uptime; checkout p95 < 1.5 s |

**Non-goals for v1:** payroll; manufacturing/BOM; marketplace aggregation (Daraz); international tax regimes beyond BD VAT (Mushak).

## 4. Personas

1. **Owner-operator (Nadia, F-commerce fashion seller).** Sells from a phone. Needs a storefront, COD, courier booking and fraud checks. Pays in bKash.
2. **Showroom + wholesale owner (Crown-Living-type crockery/furniture business).** Runs a showroom POS and wholesale credit customers, keeps 2,000+ SKUs and several warehouses, has bank loans. Needs a full ERP and accounting.
3. **Accountant / finance staff.** Posts vouchers, reconciles banks, closes the day book, produces the Balance Sheet, P&L and VAT returns.
4. **Store staff / cashier.** Uses the POS, processes orders and packs shipments. Gets only the permissions they need.
5. **Marketer.** Runs Meta ads, campaigns, coupons, loyalty and affiliates.
6. **Developer / integrator.** Uses the API keys, webhooks and payments API.
7. **AI agent (Claude/ChatGPT via MCP).** Reads freely. Every write is a proposal that waits for approval.
8. **Platform admin (internal).** Manages tenants, plans, KYB review, payouts, support.

## 5. Scope by module & requirements

Priority: **P0** = MVP, **P1** = GA, **P2** = later. Requirement IDs are used for traceability.

### 5.1 Tenancy, auth, billing (P0)
- TEN-1 Self-serve signup: pick a template, claim `slug.platform.com`, store is live instantly.
- TEN-2 Custom domain with automatic TLS (P1).
- TEN-3 Plans: trial (10 days, full access, then read-only), Build, Dominate, vertical plans. Monthly or yearly. Product limits, seat limits and notification quotas enforced per plan.
- TEN-4 Subscription payment through bKash. Invoices kept in history. Cancel and change plan.
- TEN-5 **Capability modules** can be toggled per tenant. Turning a module off hides its UI and routes but never deletes data.
- TEN-6 Prepaid **wallet** for metered services (SMS, AI, courier fees), with a top-up flow and a ledger.
- AUTH-1 Email/password sign-in, remember-me, password reset. Session security (CSRF, rate limits).
- AUTH-2 **RBAC**: built-in role presets plus custom roles. Permission matrix of resource × {view, create, update, delete, verify}.
- AUTH-3 **Audit log** of every mutation with a field diff and **one-click revert** (P1).
- AUTH-4 Transfer store ownership (needs re-authentication).

### 5.2 Catalog & inventory (P0)
- CAT-1 Products: name, slug, descriptions, images, category/brand/manufacturer, SKU, barcode, cost price, **online price and offline/POS price**, sales channel (omni/online/offline), SEO, status.
- CAT-2 Variants (colour/size and so on), each with its own price, SKU and stock.
- CAT-3 Nested categories with mega-menu metadata.
- INV-1 Multiple warehouses/locations. Stock is kept per location.
- INV-2 Every stock change creates an immutable **stock movement** (sale, purchase, return, adjustment, transfer, POS) with prev/change/new and a source reference.
- INV-3 Stock adjustments (numbered, printable audit certificate), transfer challans between locations, receivable-stock view.
- INV-4 Low-stock threshold per item, low-stock and out-of-stock alerts, **auto-restock** that creates requisitions or POs.
- INV-5 Serial and batch tracking on invoice lines (P1).
- INV-6 Importers: CSV, spreadsheet template, Shopify API, plus scrapers for other local platforms (P1).

### 5.3 Online storefront (P0)
- SF-1 Themes (5). Section-based homepage builder with desktop/tablet/mobile preview, undo/redo, publish.
- SF-2 Product listing and detail, quick view, cart, checkout (address, district/zone, delivery charge, payment method), guest or account checkout.
- SF-3 Customer accounts: order history, saved addresses, order tracking.
- SF-4 Landing pages, blog, standard policy pages, SEO (meta tags, sitemap), announcement bar.
- SF-5 Reviews from verified buyers, with moderation.
- SF-6 Abandoned-cart capture and recovery (WhatsApp/SMS).
- SF-7 AI Studio: natural-language edits to the homepage layout (P2).

### 5.4 Orders, POS, returns (P0)
- ORD-1 Order lifecycle: `pending → confirmed → preparing → ready → packed → shipped → out_for_delivery → delivered`, with branches to `cancelled`, `returned` and `failed`. Each transition records a timeline entry with a note.
- ORD-2 Bulk status changes and batch invoice printing.
- ORD-3 Payment status per order (unpaid, partial, paid, refunded), mark as paid, refunds.
- ORD-4 Returns and exchanges: request → approve (refund amount, restock) or reject (reason).
- POS-1 Register **shifts**: open with float, cash drops, close with a counted amount, variance report.
- POS-2 Barcode scan, category grid, customer lookup by phone, quick discounts, coupons, tenders (cash, card, bKash, Nagad, split, store credit), receipt printing. Keyboard shortcuts.
- POS-3 Restaurant extension: KOT/kitchen display, tables, opening hours (P2).

### 5.5 ERP sales & purchase (P0 for invoices and bills, P1 for the rest)
- ERP-S1 Direct invoice: price lists, line discount and VAT, additional charges, adjustments, split payments, due date. A credit sale creates a receivable.
- ERP-S2 Quotations: status workflow, convert to invoice.
- ERP-S3 Delivery challans linked to an invoice or order.
- ERP-S4 Customer payments (single and **batch with FIFO auto-allocation**), advances, credit and debit memos, sales returns with credit notes.
- ERP-S5 Customer types with default discount and credit days. Credit limit per customer, enforced as a warning or a block.
- ERP-P1 Requisition → PO → GRN → bill (three-way match). **Direct bill** shortcut for stock-in.
- ERP-P2 Supplier payments (single and batch), supplier credits (debit memos), purchase returns, refunds.
- ERP-X1 All ERP documents get configurable numbering (prefix, year, sequence), a print layout with document branding (BIN, trade licence), and CSV/XLSX import.

### 5.6 Accounting (P0 core, P1 advanced)
- ACC-1 Chart of accounts with 5 natures and groups. System accounts are seeded: Cash, Bank, AR, AP, Inventory, Sales, COGS, VAT payable/receivable, Customer Advances, Supplier Advances, Retained Earnings.
- ACC-2 **Every business event posts a balanced journal** (invoice, payment, bill, return, POS sale, payout, adjustment, depreciation). Unbalanced entries are rejected at the database level.
- ACC-3 Manual vouchers: CV (receipt), DV (payment), JV (journal), TM (transfer). Workflow: draft → approved → verified, or cancelled (cancelling creates a reversing entry; nothing is hard-deleted once verified).
- ACC-4 Recurring journal templates on a scheduler.
- ACC-5 Bank accounts with statements. **Bank reconciliation** by CSV import with an auto-matcher (exact, ±3 days). PDC cheque register.
- ACC-6 **Period locking**: Day Book close and lock, reopen with a reason (audited).
- ACC-7 Fixed assets with straight-line and declining-balance depreciation, posted monthly (P1).
- ACC-8 Loans and credit facilities: disbursal posting, EMI split into principal, interest and charges (P1).
- ACC-9 Reports: GL, trial balance, balance sheet, P&L, cash flow / daily balance flow, account balances, day book, expense breakdown, AR/AP aging, customer and supplier ledgers, **Mushak 6.3 VAT summary**, stock valuation, dead stock, staff performance. All reports can be printed and exported to Excel.
- ACC-10 Historical import of GL, P&L and supplier summaries so merchants can migrate from other systems (P1).

### 5.7 Logistics (P0)
- LOG-1 Courier integrations: Steadfast, Pathao, RedX (P0); eCourier, Paperfly, Sundarban (P1). Store credentials per tenant, encrypted.
- LOG-2 Create a consignment from an order, get the tracking code, print labels in bulk.
- LOG-3 Status sync through webhook or polling. Delivered or returned updates the order.
- LOG-4 **COD reconciliation**: the courier payout is posted to the ledger and matched to orders.
- LOG-5 Auto-dispatch when an order is paid or confirmed (configurable).
- LOG-6 Shipping zones with district presets, weight tiers, free-delivery threshold, store pickup.

### 5.8 Payments (P0 COD + manual bKash; P1 gateways)
- PAY-1 Gateways: bKash, Nagad, SSLCommerz, UddoktaPay, Stripe, COD. Per-tenant credentials, or a platform-collected mode.
- PAY-2 Payment links and QR codes (static wallet QRs decoded from a photo).
- PAY-3 Merchant **KYB** (business profile, bank account, documents) with an admin review workflow.
- PAY-4 Settlements: platform-collected funds go into a merchant balance, with daily settlement and withdrawal requests (bank, bKash, Nagad), and holds.
- PAY-5 Disputes and chargebacks.
- PAY-6 Public **Payments API**: create payment → `checkout_url`, Idempotency-Key, test and live keys, signed webhooks, sandbox scenario simulator, delivery log with replay.

### 5.9 Fraud & security (P1)
- FR-1 Phone risk score built from the delivery/return history pooled across tenants and couriers. Shown on the order and checked before dispatch.
- FR-2 Rules: require an advance payment above a risk threshold; block COD.
- FR-3 Blacklist (phone, IP), IP firewall, suspicious-activity log, fraud reports.

### 5.10 Marketing & growth (P1)
- MKT-1 Coupons (% or fixed, minimum order, limit, expiry).
- MKT-2 Loyalty points (earn per ৳100, redeem rate, min/max redeem).
- MKT-3 Affiliates and influencers: links and codes, commission, cookie window, hold period, payouts.
- MKT-4 Campaign banners with schedule and countdown.
- MKT-5 Automations: triggers (order placed, abandoned cart, keyword) → actions (WhatsApp, Messenger, SMS).
- MKT-6 Broadcasts. SMS through a gateway API or **Android SIM device pairing**.
- MKT-7 Sales targets per month.
- MKT-8 AI flyer generator and product-opportunity finder (P2).

### 5.11 Meta & social commerce (P1)
- META-1 Pixel plus server-side **Conversions API** with event dedup, and an event log.
- META-2 Catalog XML feed and catalogue linking.
- META-3 Ads: link the ad account, AI campaign draft from a prompt, push to Meta, read insights, sync custom audiences.
- META-4 Unified inbox (Facebook, Instagram, WhatsApp, web chat), quick replies, AI auto-reply.
- META-5 Messenger bot profile (Get Started, persistent menu), comment-to-DM, ref links and QR, WhatsApp Cloud API order notifications and Flows.
- META-6 Ad Spy competitor library (P2).

### 5.12 AI agents (P1)
- AI-1 Per-store AI token. **MCP server** exposing about 77 tools (catalogue, orders, analytics, marketing, ads).
- AI-2 Policy: scopes, require-human-approval, rate limit, log retention.
- AI-3 **Proposal queue**: write tools create `agent_actions`, which a human approves (then they execute) or rejects. Everything is audited.
- AI-4 In-app copilot chat that uses the same tools.

### 5.13 Developer platform (P1)
- DEV-1 API keys (test/live, hashed, prefix shown), scoped.
- DEV-2 Outbound webhooks per event, HMAC-signed, retried with backoff, replayable.
- DEV-3 Request logs (last N).

### 5.14 Support & help (P0)
- SUP-1 Tickets with category, priority and threaded replies. Admin console.
- SUP-2 In-app help center, contextual tutorial videos, onboarding checklist.

## 6. Key user flows

1. **Signup → first sale:** choose template → claim slug → add logo and 1 product → set delivery zones → share link → customer checks out with COD → order appears with an alert sound → confirm → "Create Shipment (Steadfast)" → tracking code → delivered → COD payout reconciled.
2. **Wholesale credit sale:** Direct Invoice → pick credit customer (limit check) → items via scanner → partial payment → invoice posts Dr AR / Cr Sales / Cr VAT and Dr COGS / Cr Inventory → later Batch Payment settles the oldest invoices first.
3. **Procure-to-pay:** low-stock alert → Auto-Restock → PO → GRN (partial) → bill → batch supplier payment by cheque → PDC register → bank statement CSV auto-match → reconcile.
4. **Month end:** recurring journals post rent → depreciation run → close day books → trial balance → P&L, balance sheet, Mushak 6.3.
5. **AI-assisted ops:** owner asks Claude "create a 10% Eid coupon" → MCP tool creates a proposal → owner approves in Agent Actions → coupon is created → audit entry written.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Multi-tenancy | Every row is scoped by `tenant_id`, enforced in the ORM layer **and** with Postgres RLS. No cross-tenant reads, except the anonymised shared fraud signal. |
| Money | Store as integer paisa or `NUMERIC(18,2)`. No floats. Currency per tenant (BDT by default). |
| Ledger integrity | Journals are immutable once verified. Corrections are reversals. Sum(debit) = Sum(credit) per journal, enforced by a constraint or trigger. |
| Performance | Storefront pages served from cache or edge (p95 TTFB < 300 ms). Dashboard lists paginate server-side. Reports on 1M ledger lines finish in < 5 s. |
| Scale target | 10k tenants, 100k orders/day, 50M stock movements. |
| Security | OWASP ASVS L2. Secrets (courier, Meta, gateway keys) encrypted at rest with KMS envelope encryption. 2FA for owners (P1). Signed webhooks. Rate limits. Audit log. |
| Availability | 99.9%. RPO 5 min, RTO 1 h. Daily backups plus PITR. |
| Localisation | English and Bangla UI (P1). BDT formatting. BD districts and zones. Asia/Dhaka timezone by default. |
| Accessibility | WCAG 2.1 AA on the storefront and checkout. |
| Observability | Structured logs, traces, per-tenant metrics, webhook and job dashboards. |
| Compliance | Bangladesh VAT (Mushak) reports, data-retention controls, PCI scope kept off-platform (hosted gateway pages). |

## 8. Release plan

| Phase | Contents |
|---|---|
| **MVP (M0–M3)** | Tenancy, auth/RBAC, plans + bKash billing, catalogue + single warehouse, storefront (2 themes, builder v1), checkout (COD + manual bKash), orders, Steadfast/Pathao/RedX, shipping zones, coupons, basic reports, support tickets |
| **GA (M4–M6)** | POS + shifts, multi-warehouse, ERP sales/purchase, double-entry accounting + core reports, gateways (bKash/Nagad/SSLCommerz), payment links, fraud checker, Pixel/CAPI + catalogue feed, audit log, webhooks/API keys |
| **v1.5 (M7–M9)** | Bank reconciliation, PDC, recurring journals, day-book lock, Mushak, loyalty, affiliates, automations, inbox (Messenger/WhatsApp), MCP + agent approvals, migrator |
| **v2 (M10+)** | Fixed assets, loans, Meta Ads AI, Ad Spy, AI builder, flyer generator, opportunity finder, settlements/payout rails, vertical modules (Restaurant, Gym, Freelancer) |

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Courier APIs change or go down | Adapter layer per courier, circuit breaker, manual fallback |
| Ledger drift from async posting | Post inside the same DB transaction as the business document. Nightly integrity checks. |
| Scope creep (VendrDesk already has 185 routes) | Module flags and a strict phase gate. Ship verticals as separate modules. |
| AI agents making destructive changes | Proposals only, human approval, scoped tokens, rate limits, revert from the audit log |
| Shared fraud data and privacy | Hash phone numbers, keep only aggregated outcome counts, put it in the ToS |
| Platform-collected payments carry regulatory exposure | Gate behind KYB. Partner with a licensed PSP. Keep a separate ledger for client money. |

## 10. Observations from the live product (lessons)

- The breadth is impressive, but many menus link to the **same screen** (e.g. `/dashboard/finance` and `/dashboard/reports` render the same page; several import "template" URLs render unrelated pages; `/dashboard/agent-chat` renders the overview). A rebuild should keep one canonical route per feature.
- `/dashboard?range=…` returned **HTTP 500** for one preset, and a link points to a broken `/dashboard/dashboard/customers` (404).
- The AI Connect page shows a hard-coded internal service token in the sample Claude Desktop config. A rebuild must never show platform secrets to merchants. Use per-tenant tokens only.
- There are destructive bulk actions (Delete All Invoices / Bills / Pages, Purge GL). They need typed confirmation (already present), role gating, and a soft-delete or restore window.
