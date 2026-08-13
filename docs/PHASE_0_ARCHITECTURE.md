# PHASE 0 — Discovery & Architecture Assessment

**Product working name:** Tapdine (placeholder — rename freely)
**Date:** 2026-08-09
**Status:** Awaiting product-owner approval. No code written yet.

---

## 0. Discovery findings

| Question | Finding |
|---|---|
| Existing repository? | No. `Restaurant Webapp/` was empty. This is greenfield. |
| Existing stack? | None. |
| Adjacent code? | Parent folder `NFC/` contains an unrelated personal NFC business-card project (`index.html`, `.vcf`, QR PNGs) plus a prompt for an Al Jazeera ERP module. **Not part of this product.** Do not import or reuse. |
| Toolchain available | Node v22.18.0, npm 11.3.0, git 2.35.1 |
| Version control | Not initialised. `git init` required before any code. |
| Existing problems | None to fix — but nothing to build on either. Every architectural choice below is a fresh decision. |

**Consequence:** we carry no legacy debt, so we should get the security foundations (tenant isolation, table tokens, money handling, audit) right in the first commit. Retrofitting tenant isolation later is the single most expensive mistake this class of product can make.

---

## 1. Proposed repository structure

A **monorepo using npm workspaces** — one repo, two deployable apps, one shared package.

```
restaurant-webapp/
├─ package.json                   # npm workspaces root, shared scripts
├─ tsconfig.base.json
├─ .gitignore
├─ .env.example
├─ PROJECT_STATE.md               # agent handoff document
├─ CLAUDE.md                      # rules for any AI agent in this repo
├─ walkthrough.md                 # human-readable tour of the system
├─ docs/
│  ├─ PHASE_0_ARCHITECTURE.md     # this file
│  ├─ THREAT_MODEL.md             # created in Phase 1
│  └─ RUNBOOK.md                  # backup/restore/incident, created Phase 4
│
├─ packages/
│  └─ shared/                     # imported by BOTH api and web
│     └─ src/
│        ├─ enums.ts              # roles, order states, order types
│        ├─ money.ts              # halala arithmetic, VAT calculation
│        ├─ orderState.ts         # the state machine + allowed transitions
│        └─ schemas/              # Zod schemas — one source of truth for validation
│
├─ apps/
│  ├─ api/                        # Node + Express + TypeScript (modular monolith)
│  │  ├─ src/
│  │  │  ├─ index.ts              # process bootstrap
│  │  │  ├─ app.ts                # express app assembly (importable by tests)
│  │  │  ├─ config/env.ts         # Zod-validated environment, fails fast on boot
│  │  │  ├─ db/mongoose.ts
│  │  │  ├─ core/
│  │  │  │  ├─ context.ts         # AsyncLocalStorage: requestId, actor, tenantId
│  │  │  │  ├─ tenant.ts          # tenant-scoped query helper (see §6)
│  │  │  │  ├─ audit.ts           # audit event writer
│  │  │  │  ├─ errors.ts          # AppError taxonomy
│  │  │  │  └─ logger.ts          # pino structured logs
│  │  │  ├─ middleware/
│  │  │  │  ├─ auth.ts            # staff access-token verification
│  │  │  │  ├─ tableSession.ts    # customer table-session verification
│  │  │  │  ├─ rbac.ts            # requireRole(...)
│  │  │  │  ├─ rateLimit.ts
│  │  │  │  ├─ validate.ts        # Zod body/params/query
│  │  │  │  ├─ idempotency.ts
│  │  │  │  └─ error.ts           # final error handler
│  │  │  └─ modules/              # each = model + service + routes + tests
│  │  │     ├─ auth/  restaurants/  staff/  tables/
│  │  │     ├─ menu/  orders/  audit/  platform/
│  │  │     └─ public/            # unauthenticated customer surface
│  │  └─ tests/
│  │     ├─ integration/
│  │     └─ security/             # tenant isolation + table auth suites
│  │
│  └─ web/                        # React + Vite + TypeScript + Tailwind
│     └─ src/
│        ├─ routes/               # React Router route tree
│        ├─ features/
│        │  ├─ customer/          # mobile-first ordering
│        │  ├─ admin/  cashier/  kitchen/  platform/
│        ├─ lib/{api,auth,i18n,money}
│        └─ components/ui/
```

**Why a monorepo, not two repos:** the Zod schemas, the order state machine, and the money maths must be identical on both sides. Two repos means copy-paste drift, and drift in money maths means wrong bills.

**Why a modular monolith, not microservices:** at 1–100 restaurants a single Node process handles the load comfortably. Microservices would add network hops, distributed transactions, and 5× the deployment cost for zero benefit. The `modules/` layout keeps clean seams so a module *could* be extracted later if a real bottleneck appears.

---

## 2. Technology choices

### Confirmed (matches your brief, no objection)

| Layer | Choice | Note |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 | |
| Routing | React Router v7 (declarative mode) | |
| Server state | TanStack Query v5 | also gives us polling for kitchen/cashier boards |
| Validation | Zod v4 | shared between API and web |
| Forms | React Hook Form | admin forms only; customer flow is too simple to need it |
| Backend | Node 22 + Express 5 + TypeScript | |
| Database | MongoDB 7 + Mongoose 8 | |
| Tests | Vitest + Supertest + mongodb-memory-server | in-memory Mongo = fast, no cloud dependency in CI |

### Additions I am proposing (each with justification, per your no-libraries-without-justification rule)

| Package | Why | Alternative rejected |
|---|---|---|
| `helmet` | security headers, one line | hand-rolling headers |
| `pino` + `pino-http` | structured JSON logs with request IDs; near-zero overhead | `winston` (slower), `console.log` (unparseable) |
| `argon2` | password hashing, current best practice | `bcrypt` — acceptable but weaker against GPU attack |
| `jose` | JWT sign/verify, modern, typed | `jsonwebtoken` — fine, but looser typing |
| `nanoid` | opaque public IDs | `uuid` — longer, uglier in URLs |
| `qrcode` | server-side QR PNG/SVG for tables | client-side lib — we want printable batch export |
| `express-rate-limit` | rate limiting with pluggable store (memory now, Redis later) | hand-rolled |
| `zod-express` style thin wrapper (own code, ~40 lines) | keeps route handlers typed | a dependency for 40 lines |

### Deliberately **not** adding in Phase 1

Redis (see §10), BullMQ, Socket.io, Docker, Prisma, an ORM abstraction layer, an i18n framework (a plain key map is enough for two languages), Sentry (Phase 4), any UI component library (Tailwind + ~15 hand-written components; libraries bloat the customer bundle, and customer page speed is a product requirement).

---

## 3. Database schema proposal

### Design rules

1. **Money is stored as integers in halalas.** 1 SAR = 100 halalas. Never a JS float, never a `Decimal` string. Floats produce 0.1 + 0.2 = 0.30000000000000004, which becomes a wrong receipt.
2. **Every tenant-owned document carries `restaurantId` as its first indexed field.**
3. **Orders store snapshots, not references.** Changing a menu price must never change a past bill.
4. **Public-facing IDs are opaque** (`nanoid`), never the Mongo `_id`, never sequential.
5. Build only what Phase 1 needs. `Payment`, `Customer`, `OtpVerification`, `PickupToken`, `Integration`, `ExternalMapping`, `Subscription`, `WebhookEvent`, `Rating`, `Notification` are **deferred to the phase that needs them.**

### Phase 1 collections

```
Restaurant
  _id, publicId, name{ar,en}, slug (unique, lowercase)
  status: ACTIVE | SUSPENDED
  vatNumber?, crNumber?, addressLine?, city?, phone?, logoUrl?
  settings: {
    currency: 'SAR'
    vatRatePercent: 15
    pricesIncludeVat: true            # KSA display convention
    defaultLocale: 'ar' | 'en'
    serviceChargePercent: 0
    kitchenStartsBeforePayment: false # cash: confirm payment before cooking (default)
    tableSessionTtlMinutes: 180
    orderTypes: ['DINE_IN']           # TAKEAWAY/PICKUP unlocked in Phase 2
  }
  createdAt, updatedAt

User                                   # every human login: platform + restaurant staff
  _id, email (unique, lowercased), passwordHash (argon2)
  name, phone?
  role: PLATFORM_ADMIN | OWNER | MANAGER | CASHIER | KITCHEN | WAITER
  restaurantId (null ONLY for PLATFORM_ADMIN)
  status: ACTIVE | DISABLED
  mfaEnabled (Phase 4), lastLoginAt, failedLoginCount, lockedUntil
  tokenVersion: number                 # bump = revoke all that user's sessions instantly

RefreshToken
  _id, userId, restaurantId?
  tokenHash (sha256 of the opaque token — the raw value is never stored)
  familyId                             # rotation lineage, for reuse detection
  expiresAt (TTL index), revokedAt?, replacedBy?
  userAgent?, ipHash?

Table
  _id, restaurantId, label ('12', 'Terrace 3'), zone?
  tokenHash (unique, sha256 of the opaque table token)  # lookup key
  tokenCipher                          # AES-256-GCM of the token, so admin can REPRINT the QR
  tokenRotatedAt, tokenVersion
  status: ACTIVE | INACTIVE
  seats?, createdAt, updatedAt

TableSession
  _id, restaurantId, tableId
  publicId (nanoid)
  status: ACTIVE | CLOSED | EXPIRED
  startedAt, lastSeenAt, expiresAt (TTL index)
  ipHash?, userAgentHash?
  orderIds: []

MenuCategory
  _id, restaurantId, name{ar,en}, description{ar,en}?
  sortOrder, isActive, imageUrl?

MenuItem
  _id, restaurantId, categoryId
  name{ar,en}, description{ar,en}?
  priceHalalas: int                    # VAT-inclusive when settings.pricesIncludeVat
  vatRatePercent: int                  # per-item override, defaults from restaurant
  imageUrl?, imageThumbUrl?
  isAvailable: bool, isActive: bool
  prepTimeMinutes?, calories?          # restaurant-supplied, labelled as such in UI
  ingredients{ar,en}[]?, allergens[]?  # restaurant-supplied
  sortOrder
  modifierGroups: [                    # embedded — they are never queried alone
    { key, name{ar,en}, minSelect, maxSelect, required,
      options: [{ key, name{ar,en}, priceDeltaHalalas, isAvailable }] }
  ]

Order
  _id, restaurantId
  publicId (nanoid 12)                 # what the customer's URL uses
  orderNumber                          # per-restaurant per-day counter, e.g. 'A-042' — display only
  type: DINE_IN                        # TAKEAWAY|PICKUP in Phase 2
  tableId?, tableSessionId?
  tableLabelSnapshot
  status: <see §12 state machine>
  paymentMethod: CASH | CARD
  paymentStatus: UNPAID | CASH_PENDING | PAID | FAILED | REFUNDED
  items: [{
    menuItemId, nameSnapshot{ar,en},
    unitPriceHalalas, vatRatePercentSnapshot,
    quantity,
    modifiers: [{ groupKey, optionKey, nameSnapshot{ar,en}, priceDeltaHalalas }],
    lineSubtotalHalalas, lineVatHalalas, lineTotalHalalas,
    note?
  }]
  totals: { subtotalHalalas, vatHalalas, serviceChargeHalalas, grandTotalHalalas }
  vatRateSnapshotPercent, pricesIncludeVatSnapshot
  customerNote?
  idempotencyKey                       # unique with restaurantId
  statusHistory: [{ from, to, byUserId?, bySystem?, at, reason? }]
  placedAt, confirmedAt?, readyAt?, completedAt?, cancelledAt?
  createdAt, updatedAt

Counter                                # atomic per-restaurant-per-day order numbering
  _id: '<restaurantId>:<YYYYMMDD>', seq: int, expiresAt (TTL 3 days)

IdempotencyKey
  _id, restaurantId, scope ('order.create')
  key, requestHash, responseSnapshot, status: IN_PROGRESS|DONE
  expiresAt (TTL 24h)
  # unique index (restaurantId, scope, key)

AuditLog                               # append-only; no update/delete route exists
  _id, restaurantId?, actorUserId?, actorRole, actorType: USER|CUSTOMER|SYSTEM
  action ('CASH_CONFIRMED', 'TABLE_TOKEN_ROTATED', …)
  targetType, targetId
  metadata (sanitised — never OTPs, tokens, passwords, card data)
  requestId, ipHash?, at
```

### Index plan (created in code, verified with `explain()` before pilot)

```
User            { email: 1 } unique
                { restaurantId: 1, role: 1 }
RefreshToken    { tokenHash: 1 } unique ; { expiresAt: 1 } TTL ; { familyId: 1 }
Table           { tokenHash: 1 } unique ; { restaurantId: 1, label: 1 } unique
TableSession    { restaurantId: 1, tableId: 1, status: 1 } ; { expiresAt: 1 } TTL
MenuCategory    { restaurantId: 1, sortOrder: 1 }
MenuItem        { restaurantId: 1, categoryId: 1, isActive: 1, sortOrder: 1 }
Order           { restaurantId: 1, status: 1, createdAt: -1 }   # cashier + kitchen boards
                { restaurantId: 1, createdAt: -1 }              # reports
                { publicId: 1 } unique                          # customer status page
                { restaurantId: 1, tableId: 1, createdAt: -1 }
                { restaurantId: 1, idempotencyKey: 1 } unique sparse
AuditLog        { restaurantId: 1, at: -1 } ; { action: 1, at: -1 }
IdempotencyKey  { restaurantId: 1, scope: 1, key: 1 } unique ; { expiresAt: 1 } TTL
```

---

## 4. API architecture

REST, versioned at `/api/v1`. Three separate surfaces with **different authentication mechanisms**, which is the core of the security design:

```
/api/v1/public/*     no auth, or a table-session token   → customers
/api/v1/app/*        staff access token (JWT)            → owner/manager/cashier/kitchen/waiter
/api/v1/platform/*   staff access token, PLATFORM_ADMIN  → us
/api/v1/webhooks/*   provider signature (Phase 2)        → payment provider
```

### Phase 1 endpoint list

```
# ── auth ────────────────────────────────────────────────
POST   /api/v1/auth/login                 { email, password } → access token + refresh cookie
POST   /api/v1/auth/refresh               rotates refresh token
POST   /api/v1/auth/logout                revokes current refresh family
GET    /api/v1/auth/me

# ── customer (public) ───────────────────────────────────
POST   /api/v1/public/table-sessions      { tableToken } → { sessionToken, restaurant, table }
GET    /api/v1/public/menu                (table session required) full menu for that tenant
POST   /api/v1/public/orders              (table session + Idempotency-Key) → order
GET    /api/v1/public/orders/:publicId    (table session) live status
POST   /api/v1/public/session/heartbeat   extends lastSeenAt

# ── restaurant app ──────────────────────────────────────
GET    /api/v1/app/restaurant             own tenant only — no :id in the path
PATCH  /api/v1/app/restaurant             OWNER|MANAGER
GET    /api/v1/app/staff                  OWNER|MANAGER
POST   /api/v1/app/staff
PATCH  /api/v1/app/staff/:id
DELETE /api/v1/app/staff/:id
GET    /api/v1/app/tables
POST   /api/v1/app/tables
PATCH  /api/v1/app/tables/:id
POST   /api/v1/app/tables/:id/rotate-token
GET    /api/v1/app/tables/:id/qr          PNG/SVG
GET    /api/v1/app/tables/export          CSV of table URLs for NFC writing
GET|POST|PATCH|DELETE /api/v1/app/menu/categories[/:id]
GET|POST|PATCH|DELETE /api/v1/app/menu/items[/:id]
PATCH  /api/v1/app/menu/items/:id/availability     CASHIER may toggle 86'd items
POST   /api/v1/app/menu/items/:id/image            signed-upload flow
GET    /api/v1/app/orders                 ?status=&from=&to=  polled by cashier/kitchen
GET    /api/v1/app/orders/:id
POST   /api/v1/app/orders/:id/transition  { to, reason? }  ← the ONLY status-change route
POST   /api/v1/app/orders/:id/confirm-cash CASHIER|MANAGER|OWNER
GET    /api/v1/app/audit                  OWNER|MANAGER

# ── platform ────────────────────────────────────────────
GET    /api/v1/platform/restaurants
POST   /api/v1/platform/restaurants       creates tenant + first OWNER user
PATCH  /api/v1/platform/restaurants/:id/status   ACTIVE|SUSPENDED
GET    /api/v1/platform/audit

GET    /health   /readyz
```

### Two API rules that prevent whole bug classes

1. **The restaurant ID never travels in the request.** There is no `GET /api/v1/app/restaurants/:id/menu`. The tenant comes from the verified token, server-side. If the client cannot name a tenant, the client cannot cross tenants.
2. **Order status changes go through one route** that consults the state machine. No `PATCH /orders/:id` with a free-form `status` field.

---

## 5. Authentication architecture

### Staff (dashboard users)

```
login → argon2 verify → issue:
   access token   JWT, 15 min, signed HS256
                  claims: sub(userId), rid(restaurantId), role, tv(tokenVersion), jti
                  stored in JS memory only — never localStorage (XSS-readable)
   refresh token  32 random bytes, opaque, NOT a JWT
                  stored: httpOnly + Secure + SameSite=Lax cookie, path=/api/v1/auth
                  DB stores only sha256(token)
                  30 day TTL, rotated on every use
```

**Refresh rotation with reuse detection:** every refresh issues a new token in the same `familyId` and revokes the old. If a *revoked* token is ever presented, the whole family is killed — that is the signature of a stolen token, and it logs the user out everywhere.

**Instant revocation:** every access token carries `tv` (tokenVersion). Middleware compares it to the user's current `tokenVersion`. Firing a cashier and bumping `tokenVersion` invalidates their access token immediately, without waiting 15 minutes and without a Redis blocklist.

**Cookie/CORS decision:** put the web app and API on sibling subdomains — `app.<domain>` and `api.<domain>`. Then the refresh cookie is same-site and we avoid `SameSite=None`, which is the safer configuration. CORS allowlists exactly the app origin, `credentials: true`.

MFA for `PLATFORM_ADMIN` and `OWNER` is Phase 4 (TOTP).

### Customers

Customers never register and never get a password. See §7.

---

## 6. Tenant-isolation strategy

Four layers. Any single one can be defeated by a coding mistake; all four failing at once is unlikely.

**Layer 1 — the tenant is never client-supplied.** It is read from the verified token and stored in `AsyncLocalStorage` for the request. Route handlers cannot invent one.

**Layer 2 — a tenant-scoped data accessor.** Modules never touch `Model.find()` directly. They call:

```ts
const repo = tenantRepo(MenuItem);        // reads restaurantId from request context
await repo.find({ categoryId });          // → { restaurantId: <ctx>, categoryId }
await repo.findById(id);                  // → { _id: id, restaurantId: <ctx> }  ← cannot cross tenants
await repo.create({ ... });               // restaurantId injected, client value ignored
```

Crucially `findById` becomes `findOne({_id, restaurantId})`. Guessing another tenant's order `_id` returns `null`, and `null` becomes a 404 — an attacker cannot even confirm the record exists.

**Layer 3 — a Mongoose pre-hook guard.** Every tenant-owned schema gets a plugin that throws on any `find/findOne/update/delete` whose filter lacks `restaurantId`. A developer who bypasses `tenantRepo` gets a loud 500 in development, not a silent data leak in production.

**Layer 4 — the mandatory test suite.** Your 10 required tests, run in CI on every commit. A build that leaks tenants does not merge.

**Platform admins** are the deliberate exception: they use `/platform/*` routes that bypass Layer 2 via an explicit `unscoped()` call which is grep-able, audit-logged, and role-gated.

---

## 7. Table / NFC security strategy

This is the requirement you called critical, so it gets the most detail.

### The token

```
32 bytes from crypto.randomBytes → base64url → 43 chars
URL:  https://app.<domain>/t/<token>
```

Non-sequential, non-derived, ~2^256 keyspace. Guessing is not a threat; leakage and sharing are.

### Storage

`Table.tokenHash = sha256(token)` is the unique lookup index — a database dump does not hand an attacker working URLs.
`Table.tokenCipher = AES-256-GCM(token, TABLE_TOKEN_KEY)` so the owner can **reprint a QR** later without rotating the tag. The key lives in the environment, never in the database.

> Simpler alternative if you prefer less machinery: store the token in plaintext. The token only authorises "order at table 12 of restaurant X" — it is a low-value credential, comparable to a printed QR menu link. **My recommendation is still hash + encrypted copy**, because the same pattern is needed for payment and accounting credentials in Phases 2–3, so we build the crypto helper once.

### The exchange — the part that actually stops table 15 ordering as table 14

```
1. Customer taps NFC → browser opens /t/<token>
2. Web app POSTs { tableToken } to /api/v1/public/table-sessions
3. Server: sha256 → find Table by tokenHash
           → table ACTIVE?  restaurant ACTIVE and not SUSPENDED?
           → create TableSession { restaurantId, tableId, expiresAt = now + ttl }
           → return a SESSION JWT: { sid, rid, tid, typ:'table', exp } (15 min, silently renewed)
4. Every later customer request sends the SESSION token, never the table token.
5. Order creation reads restaurantId and tableId FROM THE SESSION TOKEN.
   The request body has no tableId field. There is nothing to tamper with.
```

The raw table token appears exactly once per visit and is then exchanged for a scoped, expiring session. The order-creation endpoint literally ignores any tenant or table identifier a client tries to send.

### Controls attached

| Control | Setting |
|---|---|
| Session TTL | 3 h default, per-restaurant configurable; sliding on activity |
| Session token TTL | 15 min, renewed via heartbeat while the session is alive |
| Rate limit — token exchange | 10/min per IP, 30/hour per table |
| Rate limit — order creation | 5/min per session, 20/hour per table |
| Order-status reads | only orders belonging to the presenting session |
| Failed token lookups | constant-response 404, no distinction between wrong/inactive/expired |
| Token rotation | one click in admin → old URL dies immediately, `TABLE_TOKEN_ROTATED` audited, UI warns the physical tag must be rewritten |
| Audit | session start, order create, and every rejected token attempt |

### Residual risk, stated honestly

A customer can photograph a table's QR and later order to that table from the car park. Cryptography cannot prevent this — the tag is a public physical object. Mitigations available (configurable per restaurant, defaults in brackets): dine-in cash orders require staff confirmation before cooking [on]; sessions expire [3 h]; per-table velocity limits [on]; Phase 2 adds optional phone-OTP for orders above a configurable value. Documented in the threat model, not hidden.

### NFC tag guidance

NTAG215 (504 bytes) or NTAG216, written as a single URL/URI NDEF record. No personal data on the chip. Short domain — shorter URLs write more reliably and tap faster. Every table gets a printed QR carrying the same URL as a fallback for iPhone 6s and older.

---

## 8. Payment architecture (built in Phase 2, decided now)

We never touch a card number. Ever. We use a **hosted / redirect / tokenised** flow so card data goes from the customer's browser straight to the provider and never through our server. This keeps us at PCI-DSS SAQ-A, the lightest possible scope. Anything else would require an audit programme we cannot justify at this size.

```
customer picks Card
   → our API creates a Payment record (PENDING) + calls provider "create payment"
   → we return the provider's hosted URL / client token
   → customer completes on the PROVIDER'S page (Mada / Visa / mada Apple Pay)
   → provider redirects the browser back  ← treated as a HINT ONLY, never as truth
   → provider POSTs a signed webhook to us  ← the ONLY authority on payment status
   → verify signature → verify amount+currency+order → check tenant → check idempotency
   → mark Payment PAID → transition Order → write audit event
```

The browser redirect is decorative. It says "probably done, go look at your order page." The order becomes PAID only when a signature-verified webhook says so, or when our reconciliation job polls the provider and confirms it.

**Webhook hardening:** HMAC signature verification with constant-time compare; raw-body preservation (signatures are over bytes, not parsed JSON); a `WebhookEvent` collection with a unique index on the provider event ID so a duplicate delivery is a no-op; timestamp-window replay rejection where the provider supplies one; amount and currency re-checked against our own order, never trusted from the payload; a reconciliation job that polls any payment still PENDING after 10 minutes, because webhooks do get lost.

**Provider recommendation — needs your decision:**

| Provider | For | Against |
|---|---|---|
| **Moyasar** (recommended) | Saudi company, Mada-native, genuinely simple hosted form and API, free sandbox, no monthly fee, good docs, small-merchant friendly onboarding | smaller feature surface than global players |
| Tap Payments | strong regional coverage, Mada + Apple Pay, mature | slightly heavier integration |
| PayTabs / HyperPay | established, enterprise-oriented | heavier onboarding, often monthly fees |
| Stripe / Checkout.com | best DX | Mada support and KSA onboarding are the weak point — Mada is non-negotiable here |

I have **not** verified current per-transaction pricing; rates and onboarding rules change. Before you sign anything I will look up live pricing, or you request quotes directly. What I can state with confidence is the architectural requirement: **hosted flow, webhook-authoritative, Mada support.** The `PaymentProvider` interface means switching providers later touches one adapter file.

Merchant onboarding requires a Saudi commercial registration and a bank account. That is a **USER ACTION** with real lead time — start it early if Phase 2 matters commercially.

---

## 9. Accounting / POS integration architecture (built in Phase 3, decided now)

We are not building accounting software. We build a thin, well-tested integration layer.

```ts
interface AccountingProvider {
  connect(credentials): Promise<ConnectionResult>
  testConnection(): Promise<HealthResult>
  listProducts(cursor?): Promise<ExternalProduct[]>   // for the mapping UI
  createInvoice(order: OrderSnapshot, idempotencyRef: string): Promise<ExternalInvoice>
  getInvoice(externalId): Promise<ExternalInvoice | null>  // idempotency recovery
  createPayment(invoiceRef, payment): Promise<ExternalPayment>
}
```

`QoyodAdapter`, `FoodicsAdapter`, and future adapters implement it. Core order code imports the interface, never a vendor SDK.

**The idempotency reference is the whole game.** Every order gets an immutable external reference, e.g. `REST007-ORD-00010452`, generated once and stored on the order. If `createInvoice` times out, the retry does not blindly re-post — it first calls `getInvoice(ourRef)`. If the invoice exists, we record its ID and mark SYNCED. Duplicate invoices in a customer's accounting system would destroy trust faster than any outage.

**Sync state:** `NOT_SYNCED → SYNC_PENDING → SYNCED | SYNC_FAILED → RETRYING`. Exponential backoff, capped attempts, then a permanent `SYNC_FAILED` that is **visible in the restaurant admin panel with the error text and a manual retry button.** Failures are never silently swallowed.

**Mapping:** an `ExternalMapping` collection maps our IDs to theirs for products, VAT categories, branches, and payment accounts, with an admin UI. Unmapped product on a completed order = `MAPPING_MISSING` failure surfaced to the owner, not a crash.

**Credentials:** encrypted at rest with AES-256-GCM using a key from the environment, decrypted only in memory at call time, never logged, never returned by any API.

**E-invoicing / ZATCA:** we integrate with a compliant provider or with the restaurant's existing compliant system. We will not claim certification we do not hold, and I will not write code that implies we do.

**Which integration first is a business decision, not a technical one:** build the adapter for whatever software your first pilot restaurant actually runs. Building Qoyod before a customer asks for it is speculative work.

---

## 10. Redis / queue strategy

**Recommendation: no Redis in Phase 1.** Redis earns its place in Phase 2, when OTP throttling, SMS delivery, and payment reconciliation appear. In Phase 1, with a single backend instance, everything Redis would do has a free equivalent:

| Need | Phase 1 | Phase 2+ |
|---|---|---|
| Rate limiting | `express-rate-limit` in-process memory | Redis store (correct across replicas) |
| Idempotency | MongoDB unique index + TTL | unchanged — Mongo is the right tool here |
| Sessions | stateless JWT + Mongo TTL | unchanged |
| Menu caching | HTTP `Cache-Control` + `ETag` | Redis if measurements justify it |
| Background jobs | none needed | BullMQ on Redis: SMS, OTP, reconciliation, review reminders |

This is not laziness — a single-instance in-memory rate limiter is *correct* for one instance. It becomes wrong the moment we run two, and that is exactly when we add Redis.

**When we do add it:** Upstash free tier. Note the constraint honestly — free Upstash is command-capped per day, and per-request rate limiting burns commands fast. If we hit the cap we either move rate limiting back in-process and use Redis only for queues, or pay the low-cost tier. I will measure before recommending a spend.

---

## 11. Deployment architecture

```
                Cloudflare DNS (free)
                        │
      ┌─────────────────┴──────────────────┐
      │                                    │
 app.<domain>                        api.<domain>
 Vercel / Cloudflare Pages           Render (Node web service)
 static React bundle, global CDN     Express, TypeScript build
      │                                    │
      └──────── HTTPS + CORS ──────────────┤
                                           ├──► MongoDB Atlas (TLS, IP allowlist)
                                           ├──► Cloudflare R2 (menu images)
                                           └──► [Phase 2] Upstash Redis, payment provider, SMS
```

### Environments

| Environment | Frontend | Backend | Database | Purpose |
|---|---|---|---|---|
| Local | Vite dev server | tsx watch | local mongod or Atlas free | daily development |
| Staging | Vercel preview | Render free | Atlas free (separate DB) | testing, sandbox credentials |
| Pilot production | Vercel free | Render Starter | Atlas Flex or M10 | the first real restaurant |
| Scaled | same | 2+ instances | dedicated tier | ~30+ restaurants |

### Two free-tier limits you must know before a real restaurant relies on this

1. **Render's free tier sleeps after ~15 minutes of inactivity, and the cold start takes tens of seconds.** A customer tapping an NFC tag at 14:00 after a quiet hour would stare at a spinner. That is unacceptable for pilot production. Fine for development and staging; must be upgraded to a paid always-on tier (currently around $7/month, verify before purchase) the day a real restaurant goes live. Railway's usage-based plan is an equivalent alternative.
2. **MongoDB Atlas M0 (free) has no automated backups.** Also unacceptable for a restaurant's live order data. Mitigation options: (a) move to a paid tier that includes backups when the pilot starts, and/or (b) a nightly `mongodump` to Cloudflare R2, which costs approximately nothing and which we should run **regardless of tier**, because a backup we control is a backup we can actually test.

Both are Phase-1-development-safe and pilot-blocking. Flagged now so there are no surprises the week you sign a customer.

### RPO / RTO proposal for pilot

| Target | Proposal | Rationale |
|---|---|---|
| RPO (data we can afford to lose) | ≤ 24 h Phase 1 → ≤ 1 h at pilot | one restaurant's day of order history; financial record of truth stays in their POS |
| RTO (time to restore) | ≤ 4 h | a restaurant can fall back to paper/their POS for one service |

A backup that has never been restored is not a backup. The restore drill goes in `docs/RUNBOOK.md` and gets executed before the first paying customer, with the date recorded.

### CI/CD

GitHub Actions on every push: typecheck → lint → unit tests → integration tests → **security/tenant-isolation suite** → build. Merge to `main` blocked on green. Auto-deploy `main` to staging; production deploys are manual and one-click-rollbackable.

---

## 12. Order state machine

Phase 1 states (payment states arrive in Phase 2):

```
                    ┌──────────────► CANCELLED  (customer, ≤2 min, only from PLACED)
                    │
DRAFT ──► PLACED ───┼──► CASH_PENDING ──► CONFIRMED ──► KITCHEN_ACCEPTED
(client)  (server)  │                                          │
                    └──► REJECTED (staff, with reason)         ▼
                                                           PREPARING
                                                               │
                                                               ▼
                                            COMPLETED ◄──── READY
```

`DRAFT` lives in the browser only — an abandoned cart writes nothing to the database.

Transitions are a table, not a set of `if` statements, and the table names the roles allowed to make each move:

```ts
const TRANSITIONS = {
  PLACED:           { CASH_PENDING:[SYSTEM], CONFIRMED:[SYSTEM], REJECTED:[CASHIER,MANAGER,OWNER],
                      CANCELLED:[CUSTOMER,CASHIER,MANAGER,OWNER], EXPIRED:[SYSTEM] },
  CASH_PENDING:     { CONFIRMED:[CASHIER,MANAGER,OWNER], CANCELLED:[CASHIER,MANAGER,OWNER],
                      EXPIRED:[SYSTEM] },
  CONFIRMED:        { KITCHEN_ACCEPTED:[KITCHEN,MANAGER,OWNER], CANCELLED:[MANAGER,OWNER] },
  KITCHEN_ACCEPTED: { PREPARING:[KITCHEN,MANAGER,OWNER], CANCELLED:[MANAGER,OWNER] },
  PREPARING:        { READY:[KITCHEN,MANAGER,OWNER] },
  READY:            { COMPLETED:[WAITER,CASHIER,MANAGER,OWNER] },
  COMPLETED:        {},   // terminal
  CANCELLED:        {}, REJECTED: {}, EXPIRED: {},
} as const
```

Enforced in one service function, applied with a conditional `findOneAndUpdate` on the current status so two cashiers double-clicking cannot both win. Every transition appends to `statusHistory` and writes an audit event. `COMPLETED`, `CANCELLED`, `REJECTED`, and `EXPIRED` are terminal — there is no route that can edit a completed order's items or totals.

**Cash default (your §13):** `settings.kitchenStartsBeforePayment = false`, so `PLACED → CASH_PENDING → (cashier confirms) → CONFIRMED → kitchen`. If a restaurant flips it to `true`, `PLACED → CONFIRMED` immediately and the kitchen starts, with cash collected before handover. Every cash confirmation writes `CASH_CONFIRMED` to the audit log with the cashier's user ID.

---

## 13. Security threat model (summary — full version in `docs/THREAT_MODEL.md` during Phase 1)

| # | Threat | Impact | Likelihood | Control | Test |
|---|---|---|---|---|---|
| 1 | Change table number in URL/body | Wrong table billed/served | High | tableId comes from session token; body has no tableId field | Sec-04 |
| 2 | Change restaurantId in request | Cross-tenant data access | High | tenant from token only; no `:restaurantId` in app routes | Sec-01/02/03/05 |
| 3 | Guess another tenant's order ID | Data leak / tampering | Medium | `findById` → `findOne({_id, restaurantId})`; returns 404 | Sec-06 |
| 4 | Fake "payment successful" from frontend | Free food | High | webhook-only truth; no client-writable payment status | P2 |
| 5 | Replay a payment webhook | Double-credit / double invoice | Medium | unique event ID index + timestamp window + amount recheck | Sec-10 |
| 6 | Duplicate order on double-tap / retry | Duplicate food, waste | High | Idempotency-Key unique index | Ord-01 |
| 7 | Brute-force OTP | Account/phone abuse | Medium | 6 digits, 5 attempts, 5 min expiry, hashed at rest, per-phone+IP limits | P2 |
| 8 | Enumerate orders | Privacy leak | Medium | opaque nanoid publicId + session ownership check | Sec-06 |
| 9 | Enumerate tables | Order to arbitrary tables | Low | 256-bit tokens, uniform 404s, rate limits | Tbl-04 |
| 10 | Malicious image upload | RCE / stored XSS | Medium | MIME + magic-byte check, size cap, re-encode via sharp, serve from R2 (separate origin), never execute | Upl-01 |
| 11 | NoSQL operator injection | Auth bypass, data leak | Medium | Zod validates every input to primitives; `mongoose.sanitizeFilter`; no raw `$where` | Sec-11 |
| 12 | Stolen JWT | Session hijack | Medium | 15-min access token, memory-only storage, refresh rotation with reuse detection, `tokenVersion` kill switch | Auth-05 |
| 13 | SMS pumping / cost abuse | Real money burned | Medium | per-phone + per-IP + global daily caps, resend cooldown, KSA-only prefixes | P2 |
| 14 | Price manipulation from client | Revenue loss | High | server recomputes every price from the DB; client-sent prices are discarded | Ord-03 |
| 15 | Modify a completed order | Fraud, accounting mismatch | Medium | terminal states; no edit route; append-only audit | Ord-05 |
| 16 | Cashier escalates to admin | Config tampering | Medium | RBAC on every route, deny-by-default | Sec-07 |
| 17 | Kitchen user alters payment | Fraud | Low | RBAC; payment routes exclude KITCHEN | Sec-08 |
| 18 | Secrets committed to git | Total compromise | Medium | `.gitignore` from commit #1, `.env.example` only, secret scanning in CI | CI |
| 19 | Credential stuffing on staff login | Account takeover | Medium | argon2, login throttle, lockout, audit `USER_LOGIN_FAILED` | Auth-06 |
| 20 | Suspended restaurant keeps operating | Revenue leak | Low | tenant status checked in auth + table-session middleware | Sec-12 |

---

## 14. Phase 1 implementation plan

Eight steps, each ending green (typecheck + lint + tests) before the next begins.

| # | Step | Delivers | Tests |
|---|---|---|---|
| 1 | Foundation | git init, workspaces, TS config, `.gitignore`, `.env.example`, Express skeleton, Zod-validated env, pino logging, request IDs, helmet, CORS, error taxonomy, `/health`, Vitest + in-memory Mongo harness, GitHub Actions | health, env-fails-fast |
| 2 | Tenancy + auth core | User/Restaurant models, argon2, login/refresh/logout, rotation + reuse detection, tokenVersion revocation, RBAC middleware, AsyncLocalStorage context, `tenantRepo`, Mongoose guard plugin, AuditLog | Auth-01..06, Sec-01, audit writes |
| 3 | Platform admin | create/suspend restaurant + first owner, platform audit view | platform RBAC, suspension blocks login |
| 4 | Tables + tokens | Table model, token generate/hash/encrypt/rotate, QR PNG/SVG, CSV export, session exchange endpoint, TableSession, rate limits | Tbl-01..05 (valid / invalid / tampered / expired / wrong-tenant) |
| 5 | Menu | categories + items + embedded modifiers, bilingual fields, availability, image upload via R2 signed URLs with MIME + magic-byte validation and re-encode, admin CRUD, public read | Sec-01, Upl-01, availability |
| 6 | Orders | server-side pricing and VAT from halalas, snapshots, idempotency, order numbering counter, state machine, cash flow, transition + confirm-cash routes | Ord-01..05, Sec-04/06/09, Cash-01..03 |
| 7 | Frontend | customer flow (`/t/:token` → menu → item → cart → checkout → status), cashier board, kitchen board, admin (menu/tables/staff/orders), platform admin; **English UI** (admin forms still capture Arabic content into the bilingual schema); polling for live boards | component + a Playwright smoke run |
| 8 | Hardening + docs | full security suite green, index `explain()` review, seed script, `walkthrough.md`, `docs/THREAT_MODEL.md`, `PROJECT_STATE.md` final | all 10 mandatory tenant tests |

**Phase 1 explicitly excludes:** card payments, OTP, SMS, takeaway/pickup, accounting integration, analytics, subscription billing, native apps, AI, Redis, microservices.

**Definition of done:** on a real phone, tapping a real NFC tag on a real table produces a real order that reaches a real kitchen screen and completes — with the security suite green.

---

## 15. Estimated development complexity

Measured in AI-agent working sessions, assuming you review and approve between steps. A human team would take substantially longer.

| Step | Complexity | Est. sessions | Risk |
|---|---|---|---|
| 1 Foundation | Low | 1 | low |
| 2 Tenancy + auth | **High** | 2–3 | **highest — everything depends on it** |
| 3 Platform admin | Low | 0.5 | low |
| 4 Tables + tokens | Medium-High | 1.5 | crypto + the critical security requirement |
| 5 Menu | Medium | 1.5 | image upload path |
| 6 Orders | **High** | 2–3 | money maths, state machine, concurrency |
| 7 Frontend | **High** (breadth) | 3–4 | five distinct UIs, RTL |
| 8 Hardening | Medium | 1–1.5 | uncovers issues in 2 and 6 |
| **Phase 1 total** | | **~13–16 sessions** | |

Rough forward view: Phase 2 ≈ 8–11 sessions (gated on your payment/SMS accounts), Phase 3 ≈ 6–9 (gated on a pilot customer's actual software), Phase 4 ≈ 8–12 plus external pen-test calendar time.

---

## 16. Risks and trade-offs

### Technical

| Risk | Severity | Mitigation |
|---|---|---|
| Tenant isolation regression as the codebase grows | Critical | four defence layers + CI-blocking test suite |
| MongoDB has no cross-document transactions on a free single-node deployment | Medium | design so no operation needs multi-document atomicity; conditional `findOneAndUpdate` for state changes; revisit if a real need appears |
| Free-tier cold starts kill the customer experience | High at pilot | flagged in §11; paid tier is a pilot prerequisite |
| No automated backups on Atlas free | High at pilot | nightly `mongodump` to R2 + paid tier before pilot; restore drill documented |
| Payment provider onboarding delay (CR, bank account) | High | start Phase 2 account applications early; code against sandbox meanwhile |
| KSA SMS sender-ID registration lead time | Medium | apply early; dev uses a console driver behind the `SmsProvider` interface |
| Polling instead of websockets on busy boards | Low | 5 s polling with ETags is cheap at this scale; SSE if measurements demand it |
| Arabic RTL retrofit in Phase 2 | Medium | **accepted trade** — English-only Phase 1 by owner decision. Schema is bilingual from day one, so only the UI layer is affected; budget 1–2 extra Phase 2 sessions |

### Product / commercial

| Risk | Note |
|---|---|
| Restaurants do not want another system | This is why "keep your POS" is the pitch and why Phase 3 exists. Test it in sales conversations **before** building Phase 3. |
| Customers ignore self-ordering | Measure adoption at the first pilot: taps, sessions started, orders completed, completion rate. If under ~20% of tables use it, the problem is product, not code. |
| Staff resistance | The cashier and kitchen screens must be faster than the current process, not merely prettier. |
| Custom requests destroy margin | Feature flags per restaurant; say no to bespoke code in Phase 1. |
| Support cost exceeds subscription | Track support hours per restaurant from restaurant #1. |

### Deliberate trade-offs made

| We chose | Over | Because |
|---|---|---|
| Modular monolith | Microservices | 100 restaurants fit in one process; ops cost matters more than architectural fashion |
| Mongo TTL + in-process limits | Redis in Phase 1 | fewer moving parts, zero cost, add Redis when replicas or queues actually arrive |
| Polling | WebSockets | free tiers dislike long-lived connections; polling is adequate at this scale |
| Hosted payment pages | Embedded card fields | PCI SAQ-A instead of an audit programme |
| Integration adapters | Building accounting | your own core business principle |
| Halala integers | Decimal library / floats | exact, fast, zero dependency |
| One React app, role-routed | Separate apps per role | one build, one deploy, shared components |

---

## Open decisions

**Decided 2026-08-09 by the product owner:**

2. ✅ **Table token storage — hash + encrypted reprint copy.** `tokenHash` (SHA-256) is the lookup index; `tokenCipher` (AES-256-GCM) allows QR reprint without rotating the physical tag.
3. ✅ **Payment provider — Moyasar.** Phase 2, sandbox first. Current per-transaction pricing to be verified live before any commitment.
4. ✅ **Phase 1 UI is English-only.** Arabic UI and RTL move to Phase 2.
   *Consequence, stated plainly:* the database keeps `{ar, en}` on every user-visible field from day one, so **no schema migration is needed** — the Arabic content can be entered at any time. What is deferred is the UI layer. Adding RTL in Phase 2 means revisiting layout, icon direction, number/currency alignment, and every component's padding logic. Budget roughly 1–2 extra agent sessions in Phase 2 for that rework, versus roughly 0.5–1 session had it been built in from the start. This was a deliberate speed trade, recorded so it is not a surprise later.

**Still open — neither blocks Phase 1 Step 1:**

1. **Product / repo name and domain.** Affects the git repo name, the URL customers see (`app.<domain>/t/<token>`), and email sender identity. Short domains tap faster and write more reliably to NFC chips. A placeholder can be used and renamed.
5. **Do you have a pilot restaurant identified?** Their existing POS/accounting software determines which Phase 3 adapter we build, and their real workflow should shape the cashier screen.

---

## What I can do vs what only you can do

**AGENT CAN DO (no accounts, no money):** every line of code, schema, tests, the full local development environment with a local MongoDB, QR/NFC URL generation, security test suite, all documentation, CI configuration, seed data.

**USER MUST DO (external accounts — I will never fabricate a credential):**

| When | Service | Why |
|---|---|---|
| Before step 1 | GitHub repository | version control, CI |
| Before step 1 (or use local mongod) | MongoDB Atlas free cluster | development database |
| Before step 5 | Cloudflare R2 bucket | menu images |
| Before pilot | Domain + Cloudflare DNS | customer-facing URL |
| Before pilot | Vercel + Render accounts | hosting |
| Phase 2 | Payment provider sandbox → live merchant account (needs CR + bank account) | Mada payments |
| Phase 2 | SMS provider + CITC-registered sender ID | OTP and review SMS |
| Phase 3 | Accounting/POS developer account (pilot customer's system) | invoice sync |

Each one gets step-by-step instructions and an explicit `USER ACTION REQUIRED` block at the moment it is needed — not before.
