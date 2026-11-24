# Security & Secure SDLC

This document lists the controls built into Link Vision Commerce and where each one sits in the software development lifecycle. Report vulnerabilities privately to the Link Vision security contact. Do not open public issues for them.

## 1. Threat model (STRIDE summary)

| Threat | Example | Mitigation |
|---|---|---|
| **Spoofing** | Credential stuffing, session theft | argon2id (m=19 MiB, t=2); lockout after 5 failures (15 min); per-IP and per-email rate limits; generic error messages; timing-equalised unknown-user path; 256-bit opaque session tokens in `__Host-` HttpOnly, Secure, SameSite=Lax cookies; only SHA-256 of the token is stored |
| **Tampering** | Client changes prices, quantity, coupon or tenant id | All prices, stock and discounts are re-read on the server inside a transaction; Zod strips unknown fields; DB CHECK constraints (`reserved <= on_hand`, non-negative money, valid statuses); coupon usage claimed with a conditional `UPDATE` |
| **Repudiation** | "I never changed that order" | Append-only `audit_logs`, `order_events` and `stock_movements`; database triggers reject UPDATE and DELETE |
| **Information disclosure** | Store A reads store B's data (IDOR) | `withTenant()` sets `app.tenant_id`; every tenant table has **FORCE ROW LEVEL SECURITY**, so raw SQL and ORM bugs still can't cross tenants; UUIDv7 ids; unexpected errors are logged server-side and users get a generic message |
| **Denial of service** | Checkout floods, login floods | Postgres-backed rate limits (checkout 10 per 10 min per IP per store, login, signup); 256 kB server-action body limit; capped page sizes, search lengths and cart lines; transaction timeouts |
| **Elevation of privilege** | Staff archives products; expired trial keeps writing | `authorize(ctx, permission)` on every service mutation; read-only mode after the trial ends; roles stored per tenant under RLS |
| **XSS / clickjacking** | Injected script in a product description | React escaping (no `dangerouslySetInnerHTML`); per-request nonce CSP with `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`; X-Frame-Options DENY; nosniff; HSTS preload |
| **CSRF** | Cross-site form post | Server Actions check `Origin` against `Host`; SameSite=Lax cookies; `form-action 'self'` |

## 2. Controls by SDLC stage

| Stage | Controls |
|---|---|
| **Requirements** | Security requirements in the PRD (tenant isolation, money integrity, ledger immutability, OWASP ASVS L2 target); data classification (customer PII and credentials are restricted) |
| **Design** | Threat model above; defence in depth (application RBAC plus database RLS); append-only trails; server-authoritative pricing; least-privilege roles; module boundaries (`src/server/*` imports `server-only`) |
| **Implementation** | TypeScript strict; Zod validation at every boundary; parameterised SQL only (Prisma `$queryRaw` tagged templates, never string-built, except a fixed table list in test helpers); no secrets in code; `.env*` git-ignored |
| **Verification (TDD)** | Tests written first for each service. The integration suite runs against real Postgres and proves: RLS isolation (including raw SQL and cross-tenant writes), no oversell under concurrent checkouts, RBAC denials, lockout, session expiry, append-only triggers, plan limits and coupon limits. Playwright E2E covers the full merchant and shopper journey plus the security headers. Coverage gate: ≥85% lines, ≥75% branches |
| **CI gates** | `npm audit --audit-level=high` (currently 0 known vulnerabilities); ESLint; `tsc`; unit, integration and coverage; production build; E2E; CodeQL `security-extended`; Dependabot for npm and GitHub Actions |
| **Release / deploy** | Vercel immutable deployments and instant rollback; `prisma migrate deploy` with versioned SQL migrations; secrets only in Vercel environment variables; Neon TLS-only connections |
| **Operations** | `/api/health` liveness check; structured error logging (no PII in messages); audit log visible to owners; session revocation on logout |

## 3. Known limitations and next steps

- Email verification and password reset need an email provider (planned with notifications).
- 2FA for owners is planned for GA.
- Third-party credentials (couriers, gateways) will be stored with envelope encryption when those integrations land (see `integration_credentials` in the design doc).
- Prisma's query engine runs relation reads in parallel inside a transaction, which makes `pg` 8 print a deprecation warning. It is harmless, but `pg` is pinned to 8.x until Prisma addresses it.
