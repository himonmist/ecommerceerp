# VendrDesk — Product Teardown

A reverse-engineering pack for VendrDesk (vendrdesk.com), an all-in-one storefront + POS + ERP + accounting SaaS for Bangladeshi merchants. It was built from a read-only, logged-in crawl on 2026-11-24: 323 screens across 185 unique dashboard routes, plus the public site.

| Doc | Contents |
|---|---|
| [01-FEATURES.md](01-FEATURES.md) | Full feature inventory, module by module, with routes |
| [02-PRD.md](02-PRD.md) | Product requirements: personas, P0/P1/P2 requirements, flows, NFRs, phased roadmap, risks |
| [03-ARCHITECTURE.md](03-ARCHITECTURE.md) | Observed stack (Laravel monolith + Node MCP server) and a proposed target architecture (Next.js + Postgres modular monolith) |
| [04-DATABASE.md](04-DATABASE.md) | ERD, PostgreSQL DDL for about 100 tables, ledger posting rules, RLS, report queries |
| [05-SCREEN-INDEX.md](05-SCREEN-INDEX.md) | Route → screenshot map |

Screenshots are kept out of git on purpose (this repo is public and they show live business data). They are delivered separately as `vendrdesk-screenshots.zip`.
