# Security audit — Restaurant self-ordering webapp

**Date:** 2026-08-19
**Scope:** `apps/api` (Express modular monolith), supporting `packages/shared` and `apps/web`.
**Method:** Manual, code-level security review (static). No dynamic testing — the repo rule forbids
running the dev server, so nothing was executed against a live target.
**Reviewer:** Claude (Opus 5), at product owner's request.

This audits the app against its own documented invariants in `CLAUDE.md`: tenant isolation,
table-token security, server-side money, order-state machine, secrets, and audit.

> **Remediation — 2026-08-19:** All 8 findings below (H1, H2, M1, M2, L1, L2, L3, I1) have been
> **fixed**. Verified with `npm run typecheck`, `npm run lint`, `npm run test:security`
> (206 pass), and `npm test` (full suite green), plus 4 new regression tests and the settings
> route added to the admin-surface guard test. See **Remediation details** at the end.

---

## Summary

The core security model is **strong and consistently applied** — this is well above typical for a
SaaS at this stage. Three defence layers for tenant isolation, server-side pricing in integer
halalas, opaque hashed table tokens with byte-identical failures, Argon2id + constant-time
comparisons, JWT algorithm pinning with audience separation, refresh-token rotation with
reuse-family revocation, and fail-fast production secret validation are all present and correct.

The findings below are **gaps at the edges** of that model, not a broken core. Two are worth fixing
before real customers use the product.

| # | Severity | Issue | File | Status |
|---|----------|-------|------|--------|
| H1 | **High** | Any staff role (waiter/kitchen/cashier) can change VAT rate, service charge, and payment-timing settings; no audit written | `restaurant.routes.ts` | ✅ Fixed |
| H2 | **High** | WebSocket rooms have no auth — any client can subscribe to another tenant's realtime order events | `core/socket.ts` | ✅ Fixed |
| M1 | **Medium** | `refundOrder` bypasses the order-state machine and can edit terminal orders; no restock | `order.service.ts` | ✅ Fixed |
| M2 | **Medium** | Refund & rush-toggle endpoints are dead (route validates ObjectId, service queries by publicId) | `order.routes.ts`, `order.service.ts` | ✅ Fixed |
| L1 | **Low** | Review creation is tenant-wide, not session-scoped; stored customer text | `review.service.ts` | ✅ Fixed |
| L2 | **Low** | Public order-list `limit`/`cursor` not validated/clamped | `public.routes.ts` | ✅ Fixed |
| L3 | **Low** | CSV formula injection in table-URL export | `table.service.ts` | ✅ Fixed |
| I1 | Info | `staff-create` does not require an Idempotency-Key | `order.routes.ts` | ✅ Fixed |

---

## Findings

### H1 — Broken access control on restaurant settings (money + payment posture)

`PATCH /api/v1/app/restaurants/settings` is gated only by `requireStaff`, which includes
`CASHIER`, `KITCHEN`, and `WAITER`. The body lets the caller change:

- `vatRatePercent` — the tax rate applied to every bill
- `serviceChargePercent`
- `pricesIncludeVat` — whether shelf prices are VAT-inclusive
- `kitchenStartsBeforePayment` — whether food is cooked **before** payment is taken

Every other money- or config-mutating route in the app is correctly restricted to
`requireRestaurantAdmin` (owner/manager) — see `staff.routes.ts` and `menu.routes.ts`. This one
is not, so a low-privilege staff account can alter pricing and flip the payment-before-cooking
safety flag. There is also **no audit event** on this change, which violates the `CLAUDE.md` rule
that money-relevant changes get their own audit action with before/after values (compare
`MENU_PRICE_CHANGED`).

**Fix:** add `requireRestaurantAdmin` to the `/settings` route (leave `/wait-time` as staff-level),
and write an audit event capturing the previous and new values.

`apps/api/src/modules/restaurants/restaurant.routes.ts:39`

---

### H2 — Unauthenticated WebSocket subscriptions leak across tenants

`initSocket` performs an origin (CORS) check on the handshake but **no authentication**. The
connection handler then trusts client-supplied identifiers:

```
socket.on('join_restaurant', (restaurantId) => socket.join(`restaurant_${restaurantId}`))
socket.on('join_order',      (orderId)      => socket.join(`order_${orderId}`))
```

Any client (including a non-browser client that sends no `Origin`, which the CORS callback allows)
can join `restaurant_<any id>` and receive that tenant's realtime events: `order_created`,
`order_updated`, `wait_time_updated`. Today those events carry little or no payload, but:

- it is a **cross-tenant information leak** (real-time order activity / volume) — a direct breach of
  the "never mix tenants" rule, on the one channel that isn't behind `tenantRepo`;
- `refundOrder` emits `order_updated` **with `{ publicId }`**, leaking an order's public id to any
  subscriber of that room;
- `join_order` lets anyone who learns an order `publicId` follow its live status.

The HTTP surface is meticulously tenant-scoped; the socket surface silently isn't.

**Fix:** authenticate the socket handshake — verify the staff access token (or the table-session
token) in `io.use(...)` middleware, and derive the room name from the **verified** identity rather
than from `join_restaurant`'s argument. For customers, only allow joining the order room for orders
belonging to their own session.

`apps/api/src/core/socket.ts:22`

---

### M1 — `refundOrder` bypasses the order-state machine

```
// order.service.ts refundOrder(...)
findOneAndUpdate({ _id }, { $set: { paymentStatus: REFUNDED, status: CANCELLED, cancelledAt } , $push: {...} })
```

This sets `status` directly instead of going through `transitionOrder`/`checkTransition`. Consequences:

- It can move a **terminal** order (e.g. `COMPLETED`) to `CANCELLED`, violating the
  "COMPLETED/CANCELLED/REJECTED/EXPIRED are terminal and uneditable" invariant.
- It does **not** restock, unlike a cancel routed through `transitionOrder`.
- There is no conditional guard on the *current* status, only on `paymentStatus === PAID`.

This is currently unreachable because of M2 (the lookup never matches), but if M2 is "fixed" naively
the state-machine bypass goes live. Note also there is no real payment provider yet (cash only), so a
"refund" here only flips a flag — the accounting effect is out of scope, but the state-machine
violation is not.

**Fix:** route refunds through `transitionOrder` with an explicit `REFUND`/`CANCELLED` transition
that the state table permits only from non-terminal (or a defined refundable) states, and restock
if appropriate. Add a dedicated audited `ORDER_REFUNDED` action.

`apps/api/src/modules/orders/order.service.ts:724`

---

### M2 — Refund and rush endpoints are dead (id/publicId mismatch)

- Routes: `POST /app/orders/:id/refund` and `PATCH /app/orders/:id/rush` validate `:id` with
  `objectIdSchema` (a Mongo ObjectId).
- Services: `refundOrder(publicId)` and `toggleRush(publicId)` look the order up by the **`publicId`**
  field (`findOne({ publicId })`).

An ObjectId string never equals a `publicId` (a ~12-char base64url value), so both endpoints always
return `Order not found`. The refund and rush-toggle features are effectively non-functional. This
fails **closed** (no security exposure), but it is a real correctness defect, and the fix must not
reintroduce M1.

**Fix:** decide on one identifier. Simplest: change the services to `tenantRepo(OrderModel).findById(id)`
and keep the ObjectId route param. If the cashier UI sends a `publicId`, change the route param schema
and the lookup together.

`apps/api/src/modules/orders/order.routes.ts:126`, `apps/api/src/modules/orders/order.service.ts:705`

---

### L1 — Review creation is tenant-wide, not session-scoped

`createReview` verifies the order belongs to the tenant and is `COMPLETED`, and that the item was in
the order — but **not** that the order belongs to the current table session. A customer who learns
another order's `publicId` could post a review attributed to it. `publicId` is ~72 bits of
randomness, so this is not enumerable and the impact is low. Separately, `customerName` and `comment`
are stored and shown to other customers — safe as long as they are rendered as text (React escapes by
default); never render them via `dangerouslySetInnerHTML`.

**Fix:** scope the order lookup to `tableSessionId` from context, matching how `getOrderForSession`
already works.

`apps/api/src/modules/menu/review.service.ts:14`

---

### L2 — Public order-list `limit`/`cursor` unvalidated

`GET /api/v1/public/orders` does `parseInt(req.query.limit)` with no upper bound and no NaN guard, and
`cursor` becomes `new Date(...)` without validation. Results are session-scoped so the practical blast
radius is small, but the staff list route already models the right pattern.

**Fix:** validate the query with Zod — `limit` as `int().min(1).max(100).default(20)` and `cursor` as
an ISO date — like `listQuerySchema` in `order.routes.ts`.

`apps/api/src/modules/public/public.routes.ts` (orders list), `order.service.ts:415`

---

### L3 — CSV formula injection in table-URL export

`exportTableUrls` escapes quotes for CSV structure but does not neutralise a leading `=`, `+`, `-`, or
`@` in `label`/`zone`. A crafted table label could execute as a formula when the CSV is opened in
Excel/Sheets. The data is admin-authored, so this is largely self-inflicted, but it is cheap to fix.

**Fix:** prefix any cell beginning with `= + - @` with a single quote, or wrap in `="..."`.

`apps/api/src/modules/tables/table.service.ts:265`

---

### I1 — `staff-create` does not require an Idempotency-Key

Customer order creation mandates an `Idempotency-Key`; `POST /app/orders/staff-create` reads
`x-idempotency-key` without checking presence, so a missing header yields an `undefined` key. Minor
duplicate-order risk under retries.

**Fix:** validate the header's presence and format as the customer path does.

`apps/api/src/modules/orders/order.routes.ts` (staff-create)

---

## What is solidly correct (verified, no action needed)

- **Tenant isolation, 3 layers:** `tenantRepo` stamps `restaurantId` after the caller's filter;
  `tenantGuardPlugin` throws on any unguarded query/save on tenant models; `unscoped()` is used only
  in platform-admin code and the two id-from-signed-token lookups. Cross-tenant reads return `null` →
  404, never 403.
- **Money:** all pricing computed server-side from the DB in integer halalas; client cannot send a
  price (not in the schema); per-item VAT; snapshots stored on the order.
- **Table tokens:** 32 random bytes, stored as SHA-256 hash, opaque; every failure (unknown /
  inactive / suspended / malformed / expired) returns a byte-identical 404 with an awaited audit
  write; token also kept AES-256-GCM encrypted for QR reprint.
- **Auth:** Argon2id (OWASP params), `timingSafeEqual`, dummy-hash on unknown email to equalise
  timing, account lockout, generic failure message, instant revocation via `tokenVersion`.
- **Tokens:** JWT alg pinned to HS256 (header can't choose), staff vs table audiences separated with
  different secrets; refresh tokens opaque + hashed + rotated, with reuse detection revoking the whole
  family; refresh token in an httpOnly, path-scoped cookie.
- **CSRF:** cookie-based auth routes enforce an Origin/Referer allowlist; all other state-changing
  routes use bearer tokens (not CSRF-able).
- **Transport:** helmet (strict CSP, no-referrer, HSTS in prod), strict CORS allowlist, fixed
  `trust proxy` hop, `x-powered-by` off, 100 kb body limit, per-surface rate limits including a
  per-token table limiter.
- **Injection:** Zod validation on every route as the NoSQL-operator defence; global `sanitizeFilter`
  with intentional operators wrapped in `mongoose.trusted()`; search regex input is escaped.
- **Images:** stored URLs pinned to `https://res.cloudinary.com/<cloud>/<tenant>/…`; SVG excluded;
  server never fetches the URL, so no SSRF.
- **Secrets:** no `.env` tracked (gitignored); no hardcoded production secrets; fail-fast env
  validation requires all secrets in production. No `eval`/`child_process`/dynamic sinks anywhere.

---

## Strix (second-pass tool) — status

- The open-source `strix-agent` (PyPI latest 1.5.3) **requires Python ≥ 3.12**; this machine has
  **3.11.4**, so `pip install strix-agent` fails outright. Ollama is running with 5 local models
  already pulled (`llama3.2`, `phi3`, `llama3`, `qwen2.5-coder:1.5b/7b`), so no model download is
  needed once a 3.12 interpreter exists.
- Three prior Strix runs already exist in `apps/strix_runs/` (from 2026-08-19 ~08:29–08:45 UTC,
  model `openai/llama3.2` via the local Ollama endpoint). **All three ended `interrupted`/`stopped`
  with 0 findings** — one made 0 LLM requests, one made 3 (589 output tokens) before being stopped.
  In other words, Strix did not produce any usable result on this codebase.
- Strix's headline capability is Docker-sandboxed **dynamic** exploitation against a running target,
  which conflicts with this repo's rule against starting the dev server. Code-only mode with a small
  local model is the weakest configuration and, as the empty prior runs show, added nothing here.

**To make the Strix pass meaningful** (your call): install Python 3.12+, then run
`strix -t "<repo>/apps" --scan-mode deep` with a stronger model (e.g. `qwen2.5-coder:7b`, or a cloud
key) and let it run to completion; and separately, if you want dynamic testing, run it against a
throwaway instance on non-default ports with the app started by you, not by the agent.

---

## Remediation details (2026-08-19)

All fixes are server-side except H2, which also required a small frontend change to pass the
existing token through the socket handshake. No architecture, data model, or payment-provider
decision was changed.

- **H1** — `PATCH /app/restaurants/settings` now requires `requireRestaurantAdmin` (owner/manager),
  and writes a `RESTAURANT_SETTINGS_CHANGED` audit event with before/after values. `/wait-time`
  stays staff-level. The settings route was added to the `admin-surface` guard test so a cashier /
  kitchen / platform-admin is proven to get 403.
  Files: `apps/api/src/modules/restaurants/restaurant.routes.ts`, `.../audit/auditLog.model.ts`.
- **H2** — Socket.IO now authenticates every connection in an `io.use` handshake middleware
  (staff access token or table-session token). The restaurant room is derived from the verified
  token — the client-supplied `join_restaurant` argument is ignored — and `join_order` only joins
  after checking the order belongs to the caller (own session for customers, own tenant for staff).
  The web socket client passes the current token via `auth`.
  Files: `apps/api/src/core/socket.ts`, `apps/web/src/lib/socket.ts`, `apps/web/src/lib/staffApi.ts`.
- **M1** — `refundOrder` no longer changes order status or bypasses the state machine. It records a
  payment reversal (`paymentStatus -> REFUNDED`) with a conditional update on the current `PAID`
  status (concurrency-safe), a status-history note, and an audited `ORDER_REFUNDED` event. A terminal
  order (e.g. `COMPLETED`) keeps its status. *Behavioural note:* refund now reverses payment only; to
  also cancel a still-live order, staff use the normal transition (which restocks).
  File: `apps/api/src/modules/orders/order.service.ts`.
- **M2** — `refundOrder` and `toggleRush` now resolve the order by its ObjectId (`findById`),
  matching the route param and what the staff UI already sends. Both endpoints work again.
  File: `apps/api/src/modules/orders/order.service.ts`.
- **L1** — `createReview` scopes the order lookup to the caller's own `tableSessionId`, so a customer
  can only review an order from their own session. File: `apps/api/src/modules/menu/review.service.ts`.
- **L2** — `GET /public/orders` now validates its query with Zod: `limit` is `int().min(1).max(100)`
  and `cursor` must be an ISO datetime. File: `apps/api/src/modules/public/public.routes.ts`.
- **L3** — the table-URL CSV export prefixes any cell starting with `= + - @` (or a stripping
  whitespace char) with a single quote. File: `apps/api/src/modules/tables/table.service.ts`.
- **I1** — `POST /app/orders/staff-create` now requires a valid `X-Idempotency-Key` header
  (same rule as customer order creation). File: `apps/api/src/modules/orders/order.routes.ts`.

**New tests:** `apps/api/tests/security/order-security.test.ts` gains a "staff order actions" block
(refund by id reverses payment without editing a terminal status + writes the audit; unpaid refund
refused; double refund refused; rush toggles by id). `apps/api/tests/security/admin-surface.test.ts`
gains the settings route.
