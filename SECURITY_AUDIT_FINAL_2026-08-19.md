# Security audit — FINAL consolidated report

**Product:** Multi-tenant restaurant self-ordering SaaS (Express API + React web, MongoDB).
**Date:** 2026-08-19. **Auditor:** Claude (Opus 4.8), at the product owner's request.
**Method:** manual code review (three passes) + `npm audit` + live driving of the running app on
localhost (owner-supplied logins, real `restaurant_dev` data). `.env` secret *values* were excluded
by the owner (all secrets will be rotated before production); config *structure* was still audited.

This supersedes and consolidates `SECURITY_AUDIT_2026-08-19.md` (first pass) and
`SECURITY_AUDIT_PROD_2026-08-19.md` (production pass).

---

## Verdict

The core security model is strong and, after this engagement, the exploitable gaps are closed.
Tenant isolation (3 layers), server-side money in halalas, opaque hashed table tokens with
byte-identical failures, Argon2id + constant-time comparisons, JWT algorithm pinning + audience
separation, refresh-token rotation with reuse-family revocation, append-only audit, and fail-fast
production env validation are all present and correct. Dependencies are clean.

**11 findings fixed** (verified). **3 remain as recommendations** (a DoS-hardening item, a data-
minimisation item, and an optional socket throttle) — none is a remote-exploit vulnerability.

- `npm audit` (prod + dev): **0 vulnerabilities**.
- Verification of fixes: `npm run typecheck` ✅, `npm run lint` ✅, `npm run test:security` ✅
  **206 pass**, `npm test` ✅ **274 pass**, plus live re-checks in the browser.

---

## Status table

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| H1 | High | Any staff role could change VAT / service charge / payment-timing settings; unaudited | ✅ Fixed |
| H2 | High | WebSocket rooms had no auth → cross-tenant realtime order events | ✅ Fixed |
| M1 | Med | `refundOrder` bypassed the order-state machine / could edit terminal orders | ✅ Fixed |
| M2 | Med | Refund & rush endpoints dead (ObjectId route vs publicId lookup) | ✅ Fixed |
| L1 | Low | Review creation tenant-wide, not session-scoped | ✅ Fixed |
| L2 | Low | Public order-list `limit`/`cursor` unvalidated | ✅ Fixed |
| L3 | Low | CSV formula injection in table export | ✅ Fixed |
| I1 | Info | `staff-create` didn't require an idempotency key | ✅ Fixed |
| P1 | Med | Web app shipped no security headers; clickjacking (CSP `frame-ancestors` via `<meta>` is ignored — confirmed live) | ✅ Fixed |
| P3 | Low | `staffCreateOrder` looked up a client `tableId` unscoped (cross-tenant label leak) | ✅ Fixed |
| B1 | Med | `unscoped().aggregate()` rejected by tenant guard → platform analytics `500` | ✅ Fixed |
| P2 | Med | Unbounded backup export (`find({})`) → memory/DoS on the single instance | ⚠️ Open (recommendation) |
| P4 | Low | Backup zip contains customer PII + internal user fields | ⚠️ Open (recommendation) |
| P5 | Info | Socket events not rate-limited (`join_order` does a DB lookup each) | ⚠️ Open (optional) |

---

## Fixed — details

### H1 · Restaurant settings access control + audit
`PATCH /app/restaurants/settings` now requires `requireRestaurantAdmin` (owner/manager) and writes
a `RESTAURANT_SETTINGS_CHANGED` audit event with before/after values. `/wait-time` stays staff-level.
Pinned by adding the route to the `admin-surface` guard test.
Files: `apps/api/src/modules/restaurants/restaurant.routes.ts`, `.../audit/auditLog.model.ts`.

### H2 · WebSocket authentication (cross-tenant realtime leak)
Socket.IO now authenticates every connection in an `io.use` handshake (staff access token or
table-session token). The restaurant room is derived from the **verified** token — the client's
`join_restaurant` argument is ignored — and `join_order` only joins after confirming the order
belongs to the caller (own session for customers, own tenant for staff). The web client passes its
in-memory token via the socket `auth` option.
Files: `apps/api/src/core/socket.ts`, `apps/web/src/lib/socket.ts`, `apps/web/src/lib/staffApi.ts`.

### M1 · Refund no longer bypasses the state machine
Refund is now a concurrency-safe payment reversal (`paymentStatus -> REFUNDED`, conditional on the
current `PAID` status) with an audited `ORDER_REFUNDED` event. It no longer changes order status, so
a terminal order stays uneditable. *Behavioural note:* refund reverses payment only; cancelling a
live order remains a separate state transition. File: `apps/api/src/modules/orders/order.service.ts`.

### M2 · Refund / rush resolve by ObjectId
Both services now `findById(id)` (matching the route param and the staff UI, which sends `order.id`).
Previously they queried by `publicId`, so both endpoints always 404'd. File: `order.service.ts`.

### L1 · Review creation session-scoped
`createReview` scopes the order lookup to the caller's `tableSessionId`, so a customer can only
review an order from their own session. File: `apps/api/src/modules/menu/review.service.ts`.

### L2 · Public order-list query validated
`GET /public/orders` validates with Zod — `limit` `int().min(1).max(100)`, `cursor` an ISO datetime.
File: `apps/api/src/modules/public/public.routes.ts`.

### L3 · CSV formula-injection neutralised
The table-URL export prefixes any cell beginning with `= + - @` (or a stripping whitespace char)
with a single quote. File: `apps/api/src/modules/tables/table.service.ts`.

### I1 · staff-create requires an idempotency key
`POST /app/orders/staff-create` now requires a valid `X-Idempotency-Key` (as the customer path does).
File: `apps/api/src/modules/orders/order.routes.ts`.

### P1 · Security headers on the web app (clickjacking)
Confirmed live: the frontend delivered CSP via a `<meta>` tag, and `frame-ancestors` in a meta tag
is ignored by browsers — so clickjacking protection was inactive. Added a `headers` block to
`vercel.json`: `X-Frame-Options: DENY`, a real `Content-Security-Policy` with `frame-ancestors
'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a
`Permissions-Policy`. Tighten `connect-src`/`img-src` to the real API + Cloudinary hosts at deploy.
File: `vercel.json`.

### P3 · staffCreateOrder tenant-scoped table lookup
`staffCreateOrder` now resolves `input.tableId` via `tenantRepo(TableModel).findById(...)`, so a
foreign/unknown id → 404 and a staffer cannot stamp another tenant's table label onto an order.
File: `apps/api/src/modules/orders/order.service.ts`.

### B1 · Platform analytics 500 (found live)
`GET /api/v1/platform/analytics` returned 500 and the Platform Console showed "Failed to load
platform stats." Root cause: `unscoped(Model).aggregate()` in `core/tenant.ts` did not set the
`unscoped` option, so the tenant-guard `pre('aggregate')` hook rejected the platform-wide revenue
pipeline (first stage `$match:{status:'COMPLETED'}` has no `restaurantId`) with a `TenantScopeError`.
Fixed by adding `.option({ unscoped: true })` to the unscoped aggregate helper. Verified live: the
endpoint now returns 200 and the console renders its stats. Tenant isolation is unaffected — the
guard still blocks tenantRepo/raw aggregates; only the audited `unscoped()` path is exempt.
File: `apps/api/src/core/tenant.ts`.

---

## Open — recommendations (not exploitable, but do before scale/production)

### P2 · Unbounded backup export → DoS (Medium)
`GET /app/dashboard/backup` (`getRestaurantBackupData`) reads the tenant's entire order history into
memory (`tenantRepo(OrderModel).find({})`), `JSON.stringify`s it, and streams a zip. For a large
tenant this is a big heap spike on the single Render instance, and an owner/manager can trigger it
repeatedly. **Fix:** stream with `OrderModel.find(...).cursor()` in batches, or cap the export (last
N days / paginated) and write an audit event on export.
File: `apps/api/src/modules/dashboard/dashboard.service.ts:112`.

### P4 · PII / internal fields in the backup zip (Low)
The backup contains `customerPhone` (PII) and full `User` docs minus `passwordHash` (still
`tokenVersion`, `failedLoginCount`, `lockedUntil`, `ipHash`, `lastLoginAt`). No password hashes leak
(`passwordHash` is `select:false`, verified). **Fix:** project only the fields a backup needs; audit
the export. File: `dashboard.service.ts:112`.

### P5 · Socket events not rate-limited (Info)
The handshake is authenticated (H2), but individual events aren't throttled; `join_order` runs a DB
`exists` per event, so an authenticated client could spam it. **Fix (optional):** cap joins per
socket / debounce. File: `apps/api/src/core/socket.ts`.

---

## Verified correct (no action)

- **Tenant isolation, 3 layers** — `tenantRepo` stamps `restaurantId` last; `tenantGuardPlugin`
  throws on any unguarded query/save/aggregate; `unscoped()` used only in platform-admin code and
  the two id-from-signed-token lookups. Cross-tenant reads return `null` → 404, never 403.
- **Money** computed server-side in integer halalas; client cannot send a price; per-item VAT;
  immutable order snapshots.
- **Table tokens** — 32 random bytes, SHA-256 hashed, opaque; every failure returns a byte-identical
  404 with an awaited audit write; AES-256-GCM copy for QR reprint.
- **Auth** — Argon2id (OWASP params), `timingSafeEqual`, dummy-hash timing equalisation, lockout,
  single generic failure message, instant revocation via `tokenVersion`.
- **Tokens** — JWT `alg` pinned (HS256), staff/table audiences separated with different secrets;
  refresh tokens opaque + hashed + rotated with reuse-family revocation; httpOnly path-scoped cookie.
- **CSRF** — cookie auth routes enforce an Origin/Referer allowlist (observed live rejecting a
  mismatched dev origin); all other state-changing routes use bearer tokens.
- **Transport (API)** — helmet (strict CSP, no-referrer, HSTS in prod), strict CORS allowlist, fixed
  `trust proxy` hop, `x-powered-by` off, 100 kb body limit, per-surface rate limits incl. a
  per-token table limiter keyed on `sha256(token)`.
- **Injection** — Zod validation on every route; global `sanitizeFilter` with intentional operators
  wrapped in `mongoose.trusted()`; search regex input escaped.
- **Images** — browser→Cloudinary via a server-signed, tenant-folder-scoped credential; secret never
  reaches the browser; stored URLs pinned to `res.cloudinary.com/<cloud>/<tenant>/`; SVG excluded;
  server never fetches the URL (no SSRF).
- **Errors** — non-operational errors return a generic 500 (request id only); no stack/internal leak;
  inbound `X-Request-Id` validated before logging.
- **Env (prod)** — fail-fast requires all secrets, rejects wildcard CORS, forces https PUBLIC_APP_URL.
- **Dependencies** — `npm audit` clean (0), prod and dev.

---

## Notes for production

- Secret rotation before production is assumed (owner). No finding here concerns current `.env`
  values — only config structure (P1, now fixed).
- `vercel.json` proxies `/api/*` to `https://icsa.onrender.com` — confirm that is the intended prod
  API and that its `CORS_ORIGIN` / `PUBLIC_APP_URL` env match the Vercel app origin (a mismatch will
  break login via the CSRF origin check — observed live on the 5174/5175 dev port mismatch).
- A separate DAST pass against a staging instance would complement this static + live review,
  especially for P2 (load-test the backup export).

## Related (functional, not security) found during the live pass
- **System Health page always reads OFFLINE/DISCONNECTED** — `/health` and `/readyz` are mounted at
  API root, outside the `/api` proxy path, so the SPA can never reach them. Tracked in the UX report.
