# Threat model

Every threat from `docs/PHASE_0_ARCHITECTURE.md` §13, with the control that answers it and the
test that proves the control works. A row with no test is a claim, not a control, and is marked
as such.

Status as of 2026-08-12: **233 API tests, 175 of them in the security suite**
(`npm run test:security`, a separate CI step that blocks merges).

---

## How to read this

- **Control** names the file where the defence lives, so it can be found and reviewed.
- **Test** names the suite that would fail if the control were removed. That is the real
  question: not "is there a defence" but "would we find out if it broke".
- **Residual** states what is still true after the control. Several of these cannot be fully
  solved, only bounded, and pretending otherwise would be worse than saying so.

---

## 1. Tenant isolation

### T1 — An attacker changes `restaurantId` in a request

**Impact** total cross-tenant breach · **Likelihood** high (first thing anyone tries)

**Control.** The tenant is never accepted from a request. It is read from a verified token by
`middleware/auth.ts` (staff) or `middleware/tableSession.ts` (customers) and written into
`core/context.ts`. No app route has a `:restaurantId` parameter, and `core/tenant.ts` applies the
tenant *after* the caller's filter, so a supplied value is overwritten rather than honoured.

**Test** `security/tenant-isolation.test.ts` — "a filter cannot widen the scope back out",
"create() discards a client-supplied restaurantId", "update() cannot move a document to another
tenant". `security/order-security.test.ts` — a `restaurantId` in an order body is ignored.

**Residual** none known. Four independent layers would all have to fail.

### T2 — An attacker guesses another tenant's document id

**Impact** data leak or tampering · **Likelihood** medium

**Control.** `tenantRepo.findById()` is `findOne({ _id, restaurantId })`. Another tenant's
document resolves to `null`, and callers turn `null` into 404 — never 403, which would confirm
the record exists.

**Test** `security/tenant-isolation.test.ts` — "findById on another tenant's document resolves to
null" asserts the cross-tenant result is *identical* to the not-found result.
`security/order-security.test.ts`, `menu-security.test.ts`, `staff-security.test.ts` repeat it on
the real models.

**Residual** none known.

### T3 — A developer forgets the tenant filter in future code

**Impact** silent cross-tenant leak · **Likelihood** medium, and rising with codebase size

**Control.** `db/plugins/tenantGuard.ts` throws on any query, save or aggregation against a
tenant-owned collection that does not constrain `restaurantId`. It is applied to `Table`,
`MenuCategory`, `MenuItem` and `Order`. The four exceptions (`Restaurant`, `User`,
`RefreshToken`, `AuditLog`) are justified in their own model files.

**Test** `security/tenant-isolation.test.ts` — "defence layer 3" block.

**Residual** the exempt collections rely on `tenantRepo` and route-level checks alone. `User` is
the one that matters; it is covered by `staff-security.test.ts`.

### T23 — A chain reads its branches' data, or a branch reads a sibling's

**Impact** cross-tenant breach dressed up as a feature · **Likelihood** medium, and rising —
this is the shape of a request a real chain customer will eventually make

*Added 2026-08-11, when `Restaurant.type` gained `SINGLE | CHAIN_MAIN | BRANCH` and `parentId`.*

**Control.** A branch is an ordinary tenant with its own `restaurantId`. `parentId` records a
commercial relationship for the platform view and is **never read by any query**: `core/tenant.ts`
has no hierarchy logic, so a chain owner's token scopes to the chain's own id and nothing else.
Creation rules in `platform.service.ts` keep the shape sound — a branch must name an existing
`CHAIN_MAIN` parent, the hierarchy is exactly one level deep, and `parentId` is persisted only for
a `BRANCH`, so a stray value can never later be misread as a hierarchy.

**Test** `security/dashboard-security.test.ts` — "does not roll a branch's takings up into the
chain's dashboard", "does not leak the chain's takings down into a branch's dashboard", "keeps
sibling branches apart", "gives a chain owner 404, not 403, on a branch's order", plus the three
creation rules.

**Residual** the pressure is organisational, not technical. A chain *will* ask for group-wide
reporting. The answer must be a new, explicitly audited accessor with its own tests — **never a
widening of `tenantRepo`**, which would silently affect every other query in the product.

### T24 — A tenant user is given the `PLATFORM_ADMIN` role

**Impact** a malformed account that holds the platform role *and* a tenant, breaking the invariant
every tenant check rests on · **Likelihood** low (platform-admin-only routes)

*Found and fixed 2026-08-11.*

**Control.** The `User` model rejects a platform admin with a `restaurantId` in a
`pre('validate')` hook. That hook does **not** run on `findOneAndUpdate`, so it cannot be the only
defence on an update route. The platform staff routes therefore validate `role` against
`TENANT_ROLES`, which excludes `PLATFORM_ADMIN`, at the edge.

**Test** `security/dashboard-security.test.ts` — "refuses to create a PLATFORM_ADMIN inside a
restaurant", "refuses to promote a restaurant user to PLATFORM_ADMIN" (which also asserts the
stored document is unchanged), "still allows an ordinary role change".

**Residual** the general lesson stands and is worth repeating in review: **a Mongoose document
hook is not a defence on a query-based update.** Any new `findOneAndUpdate` touching a
security-relevant field needs its own edge validation.

---

## 2. Table and NFC security

### T4 — Table 15 orders against table 14

**Impact** wrong table billed and served, trivially griefable · **Likelihood** high

**Control.** An order request has no table field at all. `tableId` and `restaurantId` come from
the signed session token via `middleware/tableSession.ts`. The token on the tag is 32 random
bytes, exchanged exactly once for a session.

**Test** `security/order-security.test.ts` — "ignores a tableId in the body", "a session for
table 15 cannot read table 14's orders". `security/table-security.test.ts` — session forgery,
claim mismatch.

**Residual** **a customer can photograph a table's QR and order to that table later.** No
cryptography prevents this: the tag is a public object in a public room. Bounded by the session
TTL (3 h default), per-table rate limits, one-click token rotation, and cash confirmation before
the kitchen starts. Phase 2 adds optional phone OTP above a configurable order value.

### T5 — An attacker enumerates or probes table tokens

**Impact** unauthorised ordering · **Likelihood** low (2^256 keyspace)

**Control.** Every failure — unknown, tampered, inactive table, suspended restaurant, rotated
token — returns a byte-identical 404. Two rate limiters: per IP, and per token hash so a botnet
cannot spread attempts across addresses. Every rejection is audited, and the audit write is
awaited so a probe cannot outrun it.

**Test** `security/table-security.test.ts` — "unknown, tampered, inactive, suspended and rotated
tokens all return the identical 404" compares the response bodies as a set and asserts size 1.

**Residual** none meaningful.

### T6 — A stolen or copied table card keeps working

**Impact** ordering to a table the person is not at · **Likelihood** medium

**Control.** Token rotation from the admin screen issues a new token, and closes every live
session on that table immediately rather than letting them expire.

**Test** `security/table-security.test.ts` — "rotating a table's token closes any live session on
it immediately".

**Residual** the physical tag must be rewritten afterwards. The UI says so at the moment of
rotation.

### T7 — A database dump yields working table URLs

**Impact** ordering at every table of every restaurant · **Likelihood** low

**Control.** Only `sha256(token)` is stored for lookup, plus an AES-256-GCM ciphertext for QR
reprinting. The key lives in `TABLE_TOKEN_KEY` in the environment, never in the database.

**Test** `security/table-security.test.ts` — "stores a hash for lookup and an encrypted copy",
asserting the raw token appears nowhere in the document; plus authenticated-encryption tests.

**Residual** an attacker with both the database *and* the environment recovers tokens. That is
true of any reversible secret and is why the key is deployed separately.

---

## 3. Authentication and roles

### T8 — Credential stuffing against staff login

**Impact** account takeover · **Likelihood** medium

**Control.** Argon2id (19 MiB, t=2), per-account lockout after 8 failures, per-IP rate limit
(10 per 15 min, successful logins not counted), identical response for every failure mode, and a
dummy-hash verification when the account does not exist so timing does not reveal it.

**Test** `auth.test.ts` — "Auth-02 login failures are indistinguishable" compares all four
failure bodies; "Auth-03 account lockout".

**Residual** no MFA yet. Planned for Phase 4 for `OWNER` and `PLATFORM_ADMIN`.

### T9 — A stolen access token is used

**Impact** session hijack · **Likelihood** medium

**Control.** 15-minute lifetime; held in a module variable in the browser, never in storage, so
XSS cannot read it. `tokenVersion` on the user is compared on every request, so revocation is
immediate rather than waiting for expiry.

**Test** `auth.test.ts` — "bumping tokenVersion invalidates a live access token immediately",
"disabling a user invalidates a live access token immediately".

**Residual** a token stolen from memory is usable for up to 15 minutes.

### T10 — A stolen refresh token is used

**Impact** long-lived account access · **Likelihood** medium

**Control.** Opaque 32-byte value, stored only as a SHA-256 hash, httpOnly + Secure +
SameSite=Lax cookie scoped to `/api/v1/auth`, rotated on every use. Replaying a spent token
destroys the entire family, on the reasoning that a replay means a copy exists.

**Test** `auth.test.ts` — "Auth-05 detects reuse and destroys the whole family", which also
asserts the *legitimate* client's current token dies. Containment, not convenience.

**Residual** the legitimate user is signed out. That is the intended trade.

### T11 — A forged or downgraded JWT

**Impact** full impersonation · **Likelihood** low

**Control.** Algorithms pinned to HS256, so `alg: none` is rejected. Issuer and audience are
verified. Customer and staff tokens use **different secrets and different audiences**, so neither
can stand in for the other.

**Test** `auth.test.ts` — "rejects a missing, malformed, or unsigned token" (includes an explicit
`alg:none` attempt), "rejects a token whose signature was tampered with".
`security/table-security.test.ts` — a staff token on a customer route and the reverse.

**Residual** none known.

### T12 — Privilege escalation by a member of staff

**Impact** takeover of a restaurant account · **Likelihood** medium

**Control.** `modules/staff/staff.service.ts`: nobody can create a `PLATFORM_ADMIN`; a `MANAGER`
cannot create or modify an `OWNER` or another `MANAGER`; nobody can change their own role or
disable themselves.

**Test** `security/staff-security.test.ts` — 13 tests, including "a manager cannot promote
themselves to owner" and "a manager cannot demote or disable the owner".

**Residual** an `OWNER` is trusted with their own restaurant, by design.

### T13 — A cashier reaches admin functions, or the kitchen reaches payment

**Impact** config tampering, fraud · **Likelihood** medium

**Control.** `middleware/rbac.ts`, deny by default, applied per route. The order state machine
carries its own per-role permissions, so even a reachable route cannot make a move the role is
not allowed. The UI hides what the role cannot do, but the server does not rely on that.

**Test** `security/rbac.test.ts` (Sec-07, Sec-08), `security/order-security.test.ts` — "kitchen
staff cannot confirm cash", `orderState.test.ts` — the transition table itself.

**Residual** none known.

---

## 4. Money and orders

### T14 — Price manipulation from the client

**Impact** direct revenue loss · **Likelihood** high

**Control.** The order schema has no price, total or status field, so there is nothing to send.
`modules/orders/pricing.ts` recomputes everything from the database in integer halalas.

**Test** `security/order-security.test.ts` — "ignores prices, totals, status and payment status
sent in the body" posts all of them and asserts the server's values win.

**Residual** none known.

### T15 — A duplicate submission creates two orders

**Impact** duplicate food, waste, an angry customer · **Likelihood** high on a weak connection

**Control.** `Idempotency-Key` is required. The unique index on
`(restaurantId, scope, key)` decides the race at the database; the loser replays the stored
response. A key reused with different content is a 409 rather than a silent wrong answer.

**Test** `security/order-security.test.ts` — "survives concurrent submissions of the same key"
fires three at once and asserts exactly one order exists.

**Residual** none known.

### T16 — Two staff act on the same order simultaneously

**Impact** double-recorded payment, inconsistent state · **Likelihood** medium in a busy service

**Control.** Every transition is a conditional `findOneAndUpdate` on the current status, plus an
optional `expectedCurrentStatus` from the client for stale screens.

**Test** `security/order-security.test.ts` — "two cashiers clicking at the same moment produce
exactly one confirmation" asserts one success, one audit event, one history entry.

**Residual** none known.

### T17 — A completed order is modified

**Impact** fraud, accounting mismatch · **Likelihood** medium

**Control.** `COMPLETED`, `CANCELLED`, `REJECTED` and `EXPIRED` have no outgoing transitions.
Orders carry immutable snapshots, so a later menu change cannot alter a past bill either.

**Test** `orderState.test.ts` — every terminal state, every target, every actor.
`security/order-security.test.ts` — "freezes a completed order", "stores immutable snapshots".

**Residual** none known.

### T18 — Rounding or float error in money

**Impact** wrong receipts, VAT that does not reconcile · **Likelihood** high if floats are used

**Control.** Integer halalas throughout, all arithmetic in `@rw/shared/money`. VAT is extracted
so that `net + vat === gross` exactly, by construction rather than by rounding twice.

**Test** `money.test.ts` — reconciliation asserted at every price point from 0 to 50.00 SAR;
explicit float-drift cases (`19.99`, `1.005`).

**Residual** none known.

---

## 5. Input, uploads and infrastructure

### T19 — NoSQL operator injection

**Impact** auth bypass, data leak · **Likelihood** medium

**Control.** Zod validates every route's input to primitives, so `{"$ne": null}` is rejected at
the edge. `mongoose.sanitizeFilter` is on globally as a second layer; deliberate operators are
wrapped in `mongoose.trusted()`, which also makes every intentional one greppable.

**Test** `auth.test.ts` — "rejects a NoSQL operator in place of a string";
`security/table-security.test.ts` and `menu-security.test.ts` repeat it on their inputs.

**Residual** none known.

### T20 — Malicious file upload

**Impact** stored XSS or worse · **Likelihood** medium

**Control.** Uploads never touch this server: the browser posts directly to the image provider
with a short-lived, tenant-scoped signature. SVG is excluded from the accepted types because it
can carry script. A stored image URL is accepted only if it belongs to our provider *and* this
tenant's folder.

**Test** `security/menu-security.test.ts` — "rejects an external URL", covering another
account's Cloudinary path, a `javascript:` URL and plain `http`.

**Residual** *(updated 2026-08-12)* the upload interface now exists
(`routes/staff/ImageUploadField.tsx`), but **no provider is connected, so an end-to-end upload has
never run.** What is proven: the URL-ownership boundary, the signing endpoint, and its refusal
path. What is not: that a real file reaches the host and returns a URL our validator accepts.

One browser-side detail worth naming, because getting it wrong would be a genuine leak: the upload
POST goes to a **third-party origin**, so it uses a bare `fetch`, never the `staffApi` client. That
client attaches the staff bearer token and `credentials: 'include'`; sending either to Cloudinary
would hand our session to a vendor. The signed fields are the only authorisation that request
carries.

### T21 — Secrets committed to the repository

**Impact** total compromise · **Likelihood** medium

**Control.** `.gitignore` from the first commit; `.env.example` holds names only; a CI job fails
the build if any env file is ever tracked.

**Test** `.github/workflows/ci.yml`, `secret-scan` job.

**Residual** **currently live.** The Atlas password was printed to a session transcript on
2026-08-09, and the cluster's network allowlist is `0.0.0.0/0`. Development data only, but the
credential is no longer secret. See `PROJECT_STATE.md` §7.

### T22 — A suspended restaurant keeps trading

**Impact** revenue leak · **Likelihood** low

**Control.** Restaurant status is re-checked on every authenticated request and on every
customer table-session request, so suspension bites on the next request rather than at token
expiry.

**Test** `security/platform.test.ts` — "blocks the restaurant's staff on their very next
request"; `security/table-security.test.ts` — the customer equivalent.

**Residual** none known.

---

## Not yet addressed

Carried forward deliberately, each with the phase that owns it.

| Gap | Owner |
|---|---|
| Payment webhook forgery, replay, duplicate credit | Phase 2 — the idempotency and audit machinery it needs is built and tested |
| OTP brute force and SMS cost abuse | Phase 2 |
| MFA for `OWNER` and `PLATFORM_ADMIN` | Phase 4 |
| External penetration test | Phase 4 |
| Load testing at 100 / 500 / 1000 concurrent customers | Phase 4 |
| Backups, and a *restored* backup | Before pilot. A backup nobody has restored is not a backup. |
| Redis-backed rate limiting | When a second instance exists. In-process limits are correct for one and wrong for two. |
