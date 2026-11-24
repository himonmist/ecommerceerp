# VendrDesk — Full Feature Inventory

Source: a logged-in, read-only walkthrough of `vendrdesk.com/dashboard` (323 screens captured, 185 unique routes) plus the public marketing site and one live storefront, done on 2026-11-24. Every item below was seen on a real screen. Each module lists its route so it can be matched to the screenshot index (`05-SCREEN-INDEX.md`).

Legend: **[C]** create form seen · **[L]** list/table seen · **[D]** detail view seen · **[R]** report · **[S]** settings

---

## 0. Platform shell (present on every screen)

- Multi-tenant SaaS. Each merchant ("store") gets `{slug}.vendrdesk.com` and can add a custom domain.
- Left sidebar is grouped into sections. Sections show or hide depending on which **Capability Modules** are turned on:
  Overview · ERP Sales · ERP Purchase · ERP Inventory · ERP Accounting · ERP Reports · Sales & Orders · Catalog & Items · Storefront Builder · Meta Integrations · Marketing & Growth · Customers & Inbox · Analytics & Finance · Fraud & Security · Settings & Integrations · Account & Support.
- Top bar: global "Search or jump to…" command palette (⌘K), alert-sound toggle, live out-of-stock counter, "Visit Store" link, notifications bell, profile menu.
- Floating **AI Copilot** button on every page.
- Each page has a "Quick Guide" or "Watch Tutorial" pop-up with a 1:50–2:10 video.
- Date-range presets used across the app: Today, Yesterday, 7 Days, 30 Days, This Month, Last Month, Custom Range.
- Localised for Bangladesh: BDT (৳) currency, Bangladeshi phone formats (01XXXXXXXXX), districts, Mushak 6.3 VAT, bKash/Nagad/Rocket/Upay. The public site also has country pages for PK, IN, NP, VN, PH, AE and SA.

## 1. Overview dashboards — `/dashboard`

- Three tabs: **Business Dashboard**, **Accounting Dashboard**, **Storefront Overview**.
- Quick-action tiles: Create Customer, Create Quotation, Direct Invoice, POS Orders, Create Requisition, Direct Bill, HRM Employee Management.
- KPI cards for **Sales**, **POS**, **Purchase**. Each shows Today/Week/Month/Year against the previous period, with a % ring.
- Receivables and payables aging summaries (links to customer and supplier aging).
- Sales returns and purchase returns widgets.
- Inventory widgets: low-stock count, active items, item groups, all items, plus a "Reorder (PO)" shortcut.
- Item-sales top list.
- Bank and cash balance list. Each account links to its General Ledger.
- P&L snapshot, expense breakdown, recent incomes and expenses.
- "Daily Store Briefing" with a setup checklist and % progress: logo, homepage sections, first products, delivery charges, pixels, KYC, billing.
- Low-inventory and out-of-stock alert banners. KYC/KYB pending banner.
- Recent orders table: Order, Customer, Items, Total, Payment, Status.
- Managed-services upsell (Store Setup Service, Store Migration Service) through a "Request Service" form.

## 2. ERP — Sales & Distribution — `/dashboard/erp/sales/*`

| Feature | Route | Notes |
|---|---|---|
| Sales Hub | `/erp/sales` | Recent invoices and quotations, date filter |
| Direct Invoice (Direct Sale) [C] | `/erp/sales/direct-invoice` | Invoice no./date/due date, customer search (840+), sales person, **price list**, attachment, barcode scanner (F2), catalogue picker filtered by category/manufacturer/brand/serialised/batched/in-stock, line items (unit, qty, price, discount, VAT, **serial/batch**), additional charges, adjustment, **split payment methods**, "Pay Full" / "Clear (Due)" |
| Quotations [L][C] | `/erp/sales/quotations` | Valid-until date, T&C, bulk print, bulk status (Draft/Sent/Accepted/Rejected) |
| Delivery Challan [L][C] | `/erp/sales/deliveries` | Delivery type, charge, channel (Store Pickup/Steadfast…), channel charge, consignment ID, status |
| All Invoices [L][D] | `/erp/sales/invoices` | Filter by customer, order type, payment status, period. Bulk print, status, cancel, delete. **CSV/XLSX import**. Invoice detail: collect due, return/restock, void, delete |
| Invoice edit | `/erp/sales/invoices/:id/edit` | Edits the sale and records extra payments received |
| Sales Returns [L][C] | `/erp/sales/returns` | Credit note, refund method and account, restock |
| Batch Payment (collections) [L][C] | `/erp/sales/batch-payment` | Collect from one customer against many invoices. Auto-allocates oldest invoice first (FIFO). Applies advance. Per-invoice discount |
| Customer Payments [L] | `/erp/sales/payments` | Verify / void / re-sync ledger. Bulk "Make Verified" |
| Customer Debits & Credit Memos [L][C] | `/erp/sales/customer-debits` | Adjustable amounts, money-in collection |
| Customers Directory [L][C] | `/erp/sales/customers` | Membership ID (CMID-YYYY-XXXXXX), customer type, credit limit, opening balance (Dr/Cr), city/district, archive/activate |
| Customer Types [L][C] | `/erp/sales/customer-types` | Code, default discount %, default credit days |

## 3. ERP — Purchase & Procurement — `/dashboard/erp/purchase/*`

| Feature | Route | Notes |
|---|---|---|
| Purchase Hub | `/erp/purchase` | Recent bills and POs |
| Direct Bill (Stock In) [C] | `/erp/purchase/direct-bill` | Supplier quick-add, bill no./date/due date, purchase person, **warehouse**, attachment, scanner, items (unit, qty, cost, discount, VAT), discount/tax/additional charge/adjustment, split payment. Stock goes up automatically |
| Requisitions [L] | `/erp/purchase/requisitions` | **Auto-Restock Low Stock** button generates requisitions in bulk |
| Purchase Orders [L][C][D] | `/erp/purchase/orders` | PO number, expected date, procurement terms. Pre-fills low-stock items (`?low_stock=1`) |
| Receipts (GRN) [L] | `/erp/purchase/receipts` | Ordered vs received, cancel, bulk print, CSV export |
| All Bills [L][D] | `/erp/purchase/bills` | Pay selected, print, mark status, cancel, mark returned, delete. **CSV/XLSX import**. Bill detail: pay supplier, return with debit memo, void |
| Purchase Returns / Debit Notes [L][C] | `/erp/purchase/returns` | Per-line return qty, inventory action, settlement method |
| Batch Payment (disbursements) [L][C] | `/erp/purchase/batch-payment` | Pay many bills at once. Auto-allocate, discount, paying account, cheque/TrxID |
| Supplier Payments [L] | `/erp/purchase/payments` | Verify, approve, void, restore, re-sync ledger |
| Suppliers [L][C] | `/erp/purchase/suppliers` | Type, contact person, opening balance (Dr/Cr), PO/bill counts, balance |
| Supplier Types [L][C] | `/erp/purchase/supplier-types` | Name, code, description |
| Supplier Credits [L][C] | `/erp/purchase/supplier-credits` | Debit memos. Adjust against a bill, refund, settlement history |
| Purchase Refunds [L][C] | `/erp/purchase/refunds` | Refund against a supplier credit into an account |

## 4. ERP — Inventory — `/dashboard/erp/inventory/*`

- **Item Stock Summary** (live): item, code, group, brand, available, low-stock threshold, status. Filters by category, brand, warehouse.
- **Stock Adjustment** [L][C][D]: scan or F2 catalogue lookup. Type (increase/decrease), reason, notes. Line items show current → adjust → new stock with valuation. Each adjustment gets a printable **audit certificate** numbered `SA-YYYY-NNNNNN`.
- **Stock Movement audit trail**: every movement with type, reference, prev/change/new stock.
- **Receivable Stock**: PO lines still waiting to be received (ordered vs received vs receivable).
- **Warehouse Access**: create warehouses and locations, plus a live stock distribution matrix.
- **Multi-Location Stock Matrix**: one row per product, one column per location (Main Warehouse, Showroom Floor, Default…).
- **Stock Transfer Challans** [L][C]: from and to location, carrier/driver, items, valuation. Issue and print the challan (`TRN-YYYYMMDD-XXXX`).

## 5. ERP — Accounting (double-entry) — `/dashboard/erp/accounting/*`

- **Accounting Dashboard**: bank and cash accounts with balances, recent vouchers.
- **Vouchers**, each with its own prefix and numbering:
  - Incomes **CV** (credit/receipt voucher) [L][C][D]
  - Expenses **DV** (debit/payment voucher) [L][C][D]: multi-row categories and attachments
  - Journals **JV** [L][C]: debit and credit account, narration
  - Internal Transfers **TM** [L][C]: from and to account, slip ref
  - Workflow for all of them: **Draft → Approved → Verified**, or **Cancelled** (with a cancellation reason)
- **Recurring Journals**: frequency, debit/credit accounts, start/end, next due date, run count, "post now", pause.
- **Cash & Bank Accounts hub** with a per-account **statement** (running balance) and a funds-transfer form.
- **Chart of Accounts**: nature (Asset/Liability/Equity/Income/Expense), group, auto-generated account code, account number, active flag. Shows group totals.
- **Receivables & Payables (AR/AP)**: customer and supplier sub-ledgers with opening balances.
- **Bank Reconciliation & PDC Vault**: post-dated cheque register (issued/received, status). Upload a bank-statement CSV and it **auto-matches** rows: exact, ±3 days, or unmatched. Reconcile vouchers one by one.
- **Fixed Assets Register**: category, purchase date and cost, useful life, depreciation method, funding source. Shows accumulated depreciation and net book value.
- **Loans & Credit Facilities**: facility type (CC/OD/term), limit, interest %, tenure, maturity, servicing bank, collateral, auto-posted disbursal, EMI repayments split into principal, interest and charges.
- **Day Book / Daily Cash Register**: opening cash count, **Close & Lock Day Book**, reopen with a reason (period locking).

## 6. ERP — Reports — `/dashboard/erp/reports/*`

There is a reports hub with a quick-find box and a "Switch Report" dropdown on every report.

- **Financial**: General Ledger (with Excel/CSV import and purge), Account Balances, Balance Sheet, Profit & Loss (import and reset of historical data), Trial Balance, Transaction History, Daily Balance Flow (cash-flow, transfer, income and expense statements), Day Book, Expense Breakdown, VAT/Tax **Mushak 6.3** monthly summary.
- **Sales**: Customer Sales, Customer-wise Item Sales, Item-wise Sales, Customer Statement Ledger, Customer Aging (0-30/31-60/61-90/90+), Sales Returns, Staff Performance & Commission.
- **Purchase**: Supplier Purchase Report (with import), Supplier Ledger, Supplier Aging, Purchase Returns.
- **Inventory**: Stock Valuation & Movement Ledger, Item Stock Summary (with auto-restock PO), Stock Movement & Transfer Audit, **Slow-moving & Dead Stock** (dormant days, locked capital, risk tier).
- Most reports offer Print and Export Excel.

## 7. Sales & Orders (online commerce)

- **Orders List** `/orders` [L]: search, status and period filters. Bulk status change and **batch invoices**. Per-row inspect and fulfil.
- **Order detail** `/orders/:id` [D]:
  - tracking timeline
  - items, customer and delivery details
  - **customer delivery-trust / fraud review**
  - manual status update: Confirm → Preparing → Ready → Pack → Ship → Out for Delivery → Deliver
  - create shipment with Pathao, Steadfast, RedX, eCourier, Paperfly or Sundarban
  - courier/API tracking sync
  - payment & refund management (mark as paid), order notes, printable invoice
- **POS** `/pos`:
  - open/close **register shift**, cash drop, recent sales (F4)
  - category tabs and barcode scan (F2)
  - customer phone auto-search
  - quick discounts (5/10/15/20%) and coupons
  - tenders: Cash (F9), Card (F10), bKash, Nagad, **Split Pay**, Store Credit
  - Kitchen Display (KOT) and table orders when the restaurant module is on
- **Abandoned Carts** [L]: date, customer, cart items, total, recovery action.
- **Returns & Exchanges** [L][C]: log a request, then approve (with refund amount) or reject (with reason).
- **Courier Shipments** [L]: tabs for Pending, Picked up, In transit, Delivered, Returned. Shows COD amount and tracking.
- **Payment Links** [L][C]: title, checkout URL, amount, gateway, use count, status, QR code, 1-click share.
- **Payment QR Codes**: upload a Bangla QR, bKash, Nagad, Rocket or Upay QR image. The QR content is decoded from the photo.

## 8. Catalog & Items

- **Products & Catalog Hub** `/products` [L]:
  - channel tabs; filters for out-of-stock and low-stock
  - separate **online price vs offline/POS price**
  - category, brand and manufacturer facets
  - inline brand management
- **Create/Edit Product** [C]:
  - name, slug
  - category, brand and manufacturer, each creatable inline
  - **sales channel**: Omnichannel, Offline-only or Online-only
  - short and long description, size chart
  - colours, sizes, **variants with per-option pricing**
  - images
  - pricing and multi-channel rates, cost price (COGS)
  - inventory (stock, low-stock threshold, SKU, barcode)
  - SEO
  - status
  - gift items
- **Categories** [L][C]: parent category, slug, menu label, sort order, mega-menu description, image, active/draft, "feature in header mega menu". Live storefront preview while editing.
- Stock adjustments and transfer challans are also linked from this section.
- **Shipping & Delivery** `/shipping`:
  - 1-click templates: Standard Bangladesh, Crockery & Fragile, Flat Rate, Free over ৳2,000
  - zones with district presets (Dhaka City, Suburbs, Outside)
  - weight tiers
  - shipping methods
  - store pickup / click-and-collect (address, hours, instructions)
  - free-delivery threshold
- **Store Migrator** `/migration`: import from Shopify (API), Saleecom (basic and advanced), Zatiq, standard CSV, or a spreadsheet template.

## 9. Storefront Builder & Content

- **Homepage Builder** `/storefront/builder`:
  - drag-and-drop sections with desktop/tablet/mobile preview, undo/redo, layers panel, config studio, live preview, Save & Publish
  - section catalogue: Hero Slider, Product Carousel, Category Grid, Campaign Banner, Deal Grid, Featured Products, Trust Badges, Brand Story, Reels Feed, Countdown, Spotlight, Before & After, Shop the Look, Tabbed Products, Comparison, Ingredients, Timeline, Reviews Grid, FAQ Accordion…
  - **AI Studio Assistant** ("Ask AI to design, edit or add sections")
  - "Connect ChatGPT via MCP"
- 5 themes: Minimal, Aurora, Bloom, Haven, Modern Clean.
- **Landing Pages** `/pages`: CRUD, plus one click to create the standard footer pages (About, FAQ, Privacy, Returns…).
- **Blog & SEO Articles** `/blog`: title, cover, excerpt, content, meta title and description.
- **Product Reviews** `/reviews`: moderate verified-buyer reviews.
- **Rewards & Features**: cart milestone rewards and storefront feature toggles (inside Settings).
- **Custom Domain** `/domain`.

## 10. Meta (Facebook/Instagram/WhatsApp) Integrations — `/dashboard/meta/*`

- **Hub overview**: Facebook connection, catalogue sync, Ads Manager, Instagram Graph, WhatsApp Business API, Messenger bot, audiences and contacts.
- **Facebook & Pixel CAPI**: Pixel ID, access token, test event code, server-side Conversions API.
- **Catalog Sync & Feed**: product XML feed URL, linked catalogue ID.
- **Meta Ads Manager / AI Ad Command Center**:
  - link ad account
  - **AI campaign generator from a prompt** ("Eid sale, women 18-35 Dhaka, 500 BDT/day")
  - launch the draft to Meta
  - AI ad-copy variants
  - live campaigns, AI recommendations
  - custom audiences built from synced store customers
- **Ad Spy & AI Studio**: niche ad vault (35 niches), live competitor spy (Bangladeshi brands), "AI Killer Ad Strategist", saved strategy packs.
- **Instagram Automation**: account linking, comment-to-DM.
- **Messenger Bot**: Get Started button, persistent menu, sync profile to Meta.
- **WhatsApp Business**: Cloud API credentials, automatic order-confirmation templates, WhatsApp Flows test.
- **Llama AI Smart Agent**: AI auto-replies through an OpenAI-compatible endpoint (Groq), with model, tone and system prompt.
- **Growth Tools**: Messenger ref URL and QR, comment-to-DM.
- **Broadcasts** and **Contacts**.

## 11. Marketing & Growth

- **Opportunity Finder**: winning-product discovery and category market trends (estimated monthly revenue, average price, units sold), plus a reviews and insights drawer.
- **AI Flyer Generator**: square, story or banner canvas. AI copywriter for captions and hashtags. Product QR and store logo overlays. Download PNG/JPEG or share on WhatsApp.
- **Campaigns & Broadcasts**: promo banner campaigns with type, CTA, colours, image, schedule (start/end), countdown, sort order.
- **Workflows & Automations**: triggers (Keyword Received, Abandoned Cart, Order Placed) and templates (WhatsApp cart recovery, Messenger welcome DM, WhatsApp order-shipped update, keyword opt-in).
- **Coupons**: code, % or fixed discount, minimum order, usage limit, expiry, enable/disable.
- **Loyalty & Rewards**: program name, points label, points per ৳100, points-to-taka rate, minimum and maximum redeem %, member list and transactions.
- **Affiliate / Influencer Program**: default commission type and rate, minimum payout, cookie days, hold days, auto-approve, promo-code attribution. Each promoter has a link and code, custom rate, clicks, orders, available and locked balances.
- **Sales Targets & Goals**: monthly target with note, tracked against actuals.
- **SMS notifications**: Android device pairing (SIM gateway), sender name, outgoing SMS queue.

## 12. Customers & Inbox

- **Customers Database** `/customers`: search, district, orders, spent, last order, CSV export. Detail page: account snapshot, order history, edit, archive, delete.
- **Multi-channel Inbox** `/inbox`: unified Facebook, Instagram, WhatsApp and web chat. Locked on lower plans.
- **Channels & Settings**: connect Facebook Page, Instagram or WhatsApp. Meta app credentials, quick replies, AI auto-reply.

## 13. Analytics & Finance

- **Reports & Analytics** `/reports`: sales trend, order status, payment methods, top products, influencer/affiliate impact, manual finance entries.
- **Finance & Expenses** `/finance`: lightweight income and expense log for non-ERP users.
- **Settlements & Payouts** `/finance/settlements`:
  - automated daily settlements, payout disbursements
  - double-entry ledger movements
  - request a withdrawal to bank, bKash or Nagad (25/50/75/100% shortcuts)
  - export a bank payout file
  - blocked until KYB is done
- **Wallet & Top-up** `/storefront/wallet`: prepaid balance, top-up requests, wallet ledger. Pays for SMS, AI and other metered services.

## 14. Fraud & Security

- **Fraud Risk Checker**: phone-number risk score taken from cross-courier delivery/return history, plus recent analyses.
- **Fraud & Blacklist Logs**: totals, high-risk orders, estimated loss prevented, blocked IPs, suspicious activity log, report-fraud action.
- **Disputes & Chargebacks**: case list.
- **IP Blocking & Firewall**: block an IP with a reason. Shows flagged orders and risky IPs.

## 15. Settings & Integrations

- **Payment Gateways & Rails** `/settings/payments`: bKash, Nagad, Stripe, COD, SSLCommerz and UddoktaPay. Each has enable, sandbox, test connection, automatic SMS verification and unique-cents fallback. Merchants can also choose "use platform credentials" (VendrDesk collects payments on their behalf).
- **Merchant KYC/KYB** `/payments/kyb`: business profile, settlement bank account, documents. Submit for verification.
- **Developer & API Keys** `/developer`:
  - Test/Live modes, API keys (`vpk_test_…`)
  - payments API with **Idempotency-Key**
  - webhook endpoints
  - request logs
  - **sandbox simulator** for payment_success/failed/timeout, late success, duplicate callback, refund success/failed, settlement hold, chargeback, risk review
  - webhook delivery log with replay
- **Webhooks** `/developer/webhooks`: outbound endpoints per event, with a delivery log.
- **AI Agent Connect (MCP)** `/settings/ai-connect`: store AI bearer token; connection guides for Claude Desktop, ChatGPT Custom GPT and Google Spark; **77 tools**; pause AI access.
- **Agent Policy** `/agent-settings`: MCP on/off, granular scopes (read/write products, orders, analytics, ads…), **require human approval**, rate limit per minute, retention days.
- **Agent Actions** `/agent-actions`: queue of AI write proposals (e.g. "create product", "create coupon") with **Approve & Execute / Reject**.
- **Open AI Copilot** `/agent-chat`: chat with the store copilot.
- **Store Settings** `/settings`, with tabs:
  - General
  - Storefront & Rewards
  - Theme
  - Theme Content
  - Tracking & Pixels: GTM, Pixel, plus an event log of Event, Product, Value, Channel, Status, Time
  - Delivery
  - Footer
  - Social
  - Restaurant: opening hours per day
  - Payments
  - Notifications
  - Announcement bar
  - SEO & Sitemap
  - offline ERP and document branding: corporate logo, BIN/Trade Licence, invoice footer
  - online pricing markup formula with a live preview
  - **ERP document numbering**
  - clear storefront cache
- **App & Modules** `/settings/modules`: 11 capability modules can be switched on or off. Switching one off hides its menus but keeps the data.
  - Online Storefront & D2C
  - Enterprise Offline ERP
  - POS & Kitchen Display
  - Meta Ads & Social Commerce
  - Marketing & Growth
  - Multi-channel Inbox & CRM
  - SMS & Android SIM Gateways
  - AI Fraud Shield
  - Settlements & Operational Finance
  - Freelancer & Creative Portfolio Studio
  - Gym & Fitness Club Management
- **Logistics Settings**: Steadfast (API key and secret), RedX (token, area, store), Pathao (token, store, city, zone), test connection, **auto-dispatch when paid**.
- **Team & Staff (RBAC)**:
  - staff accounts
  - custom roles with a permission matrix (VIEW/CREATE/UPDATE/DELETE/**VERIFY** per resource) and built-in presets
  - **activity log and audit trail with diff and revert** (48k entries in this store)
  - transfer store ownership
- **Subscription & Billing** `/billing`: plans (Free trial, Launch, Build, Dominate, plus vertical Gym Starter/Pro/Enterprise), monthly or yearly, change or cancel, invoice history, add-ons (slot packs, setup and migration help).

## 16. Account & Support

- **Support Tickets**: open a ticket (subject, category, priority, message), see the thread, reply.
- **Help Center & Docs**: built-in merchant operating manual with 10 guide groups and 30+ FAQs, searchable and printable.
- **Profile**: name, email, password change.

## 17. Public site & storefront

- Marketing site with features, templates (live-store previews in desktop and mobile frames), pricing, compare, contact, country pages, terms, privacy and returns.
- Self-serve signup: pick a template, then claim `slug.vendrdesk.com`.
- Pricing seen on the site: **Launch** free for 10 days, **Build** ৳1,000/mo (200 products, 2 team members), **Dominate** ৳2,000/mo (unlimited, inbox, flyer generator). Yearly plans give 2 months free. Payment is by bKash.
- Storefront features:
  - announcement bar
  - hero, shop by category, new arrivals, featured products, deals
  - quick view, "only N left", Cart / Buy Now / Select Options
  - customer accounts, order tracking
  - footer pages and social links
  - floating chat
  - "Powered by VendrDesk"
