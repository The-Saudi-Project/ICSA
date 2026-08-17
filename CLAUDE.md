# CLAUDE.md — rules for any AI agent working in this repository

## Start here, every session

1. Read `PROJECT_STATE.md`.
2. Read `docs/PHASE_0_ARCHITECTURE.md` (the authoritative design).
3. Inspect the actual repository — files, `package.json`, tests, env config.
4. Compare the code against `PROJECT_STATE.md`. **If they disagree, the code is right.**
   Correct `PROJECT_STATE.md`, and say so.
5. Report the current state, identify the **Next Immediate Task**, continue from there.

Never restart the project from scratch. Never recreate finished functionality. Never change
established architecture without justification and product-owner approval.

---

## What this product is

Multi-tenant restaurant self-ordering SaaS for Saudi Arabia. Tables carry NFC tags and QR
codes; customers order from their own phone; cashier and kitchen screens run the service.

**We are not building accounting software.** The restaurant keeps Foodics / Qoyod / whatever
they already use as the financial system of record. We integrate.

---

## Non-negotiable rules

### Tenant isolation
- `restaurantId` **never** comes from a client request. It comes from a verified token.
- Every tenant-owned query includes `restaurantId`. Use `tenantRepo(Model)`, never
  `Model.find()` directly.
- `findById(id)` must be `findOne({ _id: id, restaurantId })`. Cross-tenant access returns
  **404**, not 403 — do not reveal that another tenant's record exists.
- The Mongoose tenant guard plugin exists to catch mistakes. Do not remove or bypass it.
  Platform-admin routes use an explicit, audited `unscoped()` call.

### Table security
- Table tokens are 32 random bytes, opaque, stored hashed. Never sequential, never derived.
- The table token is exchanged **once** for a short-lived table-session token.
- `tableId` and `restaurantId` are read from the session token. **Order requests contain no
  table or restaurant identifier.** Do not add one, for any reason.
- All table-token failures return an identical 404 — wrong, inactive, and expired must be
  indistinguishable.

### Money
- Integers in **halalas** (1 SAR = 100 halalas). Never a float, anywhere.
- Prices and VAT are recomputed **server-side from the database**. Any price sent by a client
  is discarded without comment.
- Orders store immutable snapshots. Changing a menu price must never alter a past order.

### Payments
- Never receive, store, or log a card number, CVV, or PIN.
- Hosted / redirect / tokenised provider flows only.
- Payment status is set only by a signature-verified webhook or a server-side reconciliation
  poll. A browser redirect is a hint, never proof.
- Every webhook: verify the signature over the **raw body** with a constant-time compare,
  check idempotency against a unique event ID, re-verify amount, currency, order, and tenant.

### Order state
- Transitions come from the explicit transition table, with role checks. There is no free-form
  `status` field on any update route.
- Apply transitions with a conditional `findOneAndUpdate` on the current status so concurrent
  clicks cannot both succeed.
- `COMPLETED`, `CANCELLED`, `REJECTED`, `EXPIRED` are terminal and uneditable.

### Secrets
- Never commit a secret. `.env` is git-ignored; `.env.example` holds names only.
- Never write a real credential into any documentation, log, comment, or chat message.
- Never fabricate an API key or pretend an external account exists. If a credential is needed,
  stop and issue a **`USER ACTION REQUIRED`** block with exact steps.

### Audit
- Every security- or money-relevant action writes an audit event: tenant, actor, role, action,
  target, timestamp, metadata, request ID.
- The audit log is append-only. Never write an update or delete route for it.
- Never log OTPs, tokens, passwords, or card data. Hash IPs with `IP_HASH_SALT`.

---

## How to work

Follow this loop for every task, and use these headings in the reply:

```
PHASE / TASK / OBJECTIVE
CURRENT ARCHITECTURE
PLAN (numbered)
→ implement the smallest correct change
FILES CHANGED
TESTS RUN
RESULT
SECURITY CHECK
NEXT STEP
```

Never reply with just "Done." Show what was done and how it was verified.

**Stop and ask** before deciding anything about architecture, security, payments, accounting,
compliance, pricing, the data model, infrastructure, or a major dependency. Use engineering
judgement freely on small implementation details.

The product owner is not a specialist engineer. Explain in plain language. Teach while
building.

---

## Frontend

## Frontend

Design direction is approved by the product owner and recorded in `DESIGN.md`. **Read it before touching any interface.**

- The concept is a **premium glassmorphic SaaS theme**: frosted translucent surfaces over an animated mesh-gradient background, with vibrant accents, a full light and dark mode, and elegant typography (Inter for Latin, Tajawal for Arabic).
- **Themes are globally toggled**, but surfaces like the kitchen force specific styles (e.g., `.surface-kiln` keeps the kitchen dark) to ensure visibility from a distance.
- **Motion and animation** are encouraged to create a dynamic interface (bouncy slide-ups, stagger effects, pulse animations), but be mindful of performance.
- Use rich UI patterns like interactive card grids rather than simple typographic lists.

## Frontend conventions (Step 7a)

- Use **logical properties** (`ms-*`, `ps-*`, `text-start`) everywhere. Arabic and RTL land in
  Phase 2 and must not be a rewrite.
- Money renders through `<Price>`; it is always tabular. Never format a price by hand.
- The customer client sends **no price, no total, no table and no restaurant**. If you are about
  to add one to a request body, stop.
- New sticky offsets use `--app-header-h`, never a measured constant.
- `npm run dev:standalone --workspace @rw/api` gives a full API with demo data and no database
  account. Use it for interface work.
- Role routing lives in `lib/roles.ts`, in one place, so the login screen and the route guards
  cannot disagree. A guard's rejection target must always be the user's own home, or the
  redirect loops.
- Staff and customer API clients are separate modules on purpose. Do not merge them: the
  separation is what makes it impossible to send the wrong credential from the wrong surface.
- A one-time password is rendered through `OneTimeSecret`, which states plainly that it cannot
  be shown again. Never log one, never store one, never offer to "show password".
- **An `<img src>` pointing at an authenticated endpoint will always 401.** The browser sends
  no `Authorization` header, and the staff access token lives in memory rather than a cookie on
  purpose. Fetch the bytes with `fetchStaffImage()` and render the object URL — then revoke it.
  Never solve this by putting a token in a query string; that leaks a live credential into
  history, referrers and proxy logs.
- **The dev port is 5174**, set by `server.port` in `apps/web/vite.config.ts`, not Vite's default
  of 5173. `PUBLIC_APP_URL` and `CORS_ORIGIN` must agree with it, or every QR code and NFC tag
  encodes a URL that resolves to nothing. Those URLs are rebuilt from `PUBLIC_APP_URL` on every
  read, so fixing the variable fixes existing tables — no token rotation needed.

## Cost discipline

`FREE → LOW-COST → MEASURE → IDENTIFY LIMIT → UPGRADE ONLY WHEN JUSTIFIED.`

Sandbox and test environments first, always. No Kubernetes, no Docker orchestration, no
microservices, no dedicated clusters, no enterprise observability. When adding any third-party
service, report: service, plan, cost, free-tier limit, what we use, upgrade trigger, next-tier
cost — and re-verify pricing at the vendor rather than quoting remembered figures.

---

## Do not

Rewrite the codebase unnecessarily · introduce microservices · add libraries without
justification · store card data · trust frontend payment status · trust client-supplied
restaurant/table IDs · expose sequential IDs as security tokens · mix tenants · hard-code a
restaurant ID · hard-code pricing · commit secrets · build accounting software · claim ZATCA
certification · assume external APIs never fail · assume webhooks arrive exactly once · create
duplicate invoices · allow arbitrary status changes · over-engineer Redis · buy premium
infrastructure without a measured need · build mobile apps before the web product is validated
· add features because a competitor has them.

---

## Keeping documents current

Update `PROJECT_STATE.md` whenever anything meaningful changes — phase, feature, architecture,
schema, API, security decision, external service, credential requirement, deployment, bug,
test, dependency, or business decision. Do not wait for the end of a phase.

Update `walkthrough.md` when a user-visible flow changes.

**Before context runs out:** update `PROJECT_STATE.md` with completed work, unfinished work,
decisions, pending user actions, current errors, and the exact next task. Confirm it is saved.
A handoff succeeds only if a fresh agent can read `PROJECT_STATE.md` plus the repo and know
what to do next without any of this conversation.

---

## Repository layout (as built)

```
packages/shared   @rw/shared — enums, halala money + VAT maths, order state machine.
                              Imported by api and web.
apps/api          @rw/api    — Express 5 modular monolith.
apps/web          @rw/web    — React 19 + Vite 7 + Tailwind v4. All five surfaces:
                              customer, kitchen, cashier, admin, platform, plus /dashboard.
```

**`apps/api` imports `@rw/shared` from `dist`.** If the compiler cannot see a field you just
added to a shared schema or enum, the build is stale, not the code:

```bash
npm run build --workspace @rw/shared
```

`apps/api/src` — `config/env.ts` (fail-fast Zod env) · `core/` (context, logger, errors) ·
`middleware/` (requestContext, errorHandler, validate) · `db/mongoose.ts` · `modules/`.

## Commands

```bash
npm run dev            # API on :4000, runs with no database in development
npm run typecheck
npm run lint
npm test               # all workspaces
npm run test:security  # tenant isolation + RBAC + platform boundary + audit immutability
npm run build

npm run seed:admin --workspace @rw/api        # one-time: creates the first PLATFORM_ADMIN
npm run seed:demo --workspace @rw/api         # demo restaurant, menu, tables
npm run dev:standalone --workspace @rw/api    # API + in-memory Mongo + demo data, no account
npm run indexes:check --workspace @rw/api     # explain() over every real query shape
npm run indexes:sync --workspace @rw/api      # create declared indexes, drop redundant ones
```

**Run `indexes:check` whenever you add a query shape or an index.** It is the only thing that
catches a query the planner cannot serve, and it found two real problems on customer hot paths
in Step 8. A `SORT` stage that is not fed by an `IXSCAN` is a blocking in-memory sort.

`npm run test:security` must be green before any merge. It is a separate, named CI step for
that reason.

### ⛔ Never start a dev server

**The product owner runs the API and the frontend themselves.** Do not run `npm run dev`,
`npm run dev:standalone`, or any preview/browser tool that binds a port in this repo, and never
leave anything listening on **4000** (API) or **5174** (web).

*Why this is a rule and not a preference:* the web app proxies `/api` to `127.0.0.1:4000`. An
agent-started `dev:standalone` on that port serves an **in-memory** database holding only demo
accounts, so the owner's real sign-in silently hits the wrong backend and returns "Invalid email
or password" — and because every auth failure is byte-identical by design, nothing can tell them
the real reason. This happened on 2026-08-12 and cost real debugging time.

Verify with `npm test`, `npm run test:security`, `npm run typecheck`, `npm run lint`, and by
reading the code. If a change can genuinely only be confirmed in a browser, **ask first**, name
the port, and stop the server in the same turn.

Tests never read `apps/api/.env` — `NODE_ENV=test` skips dotenv entirely, so a suite can never
reach a real database. Do not "fix" this by loading dotenv in tests.

## Conventions established in Step 1 — follow them

- **ESM with NodeNext.** Relative imports carry a `.js` extension, even from `.ts` sources.
- **Never `console.log`.** ESLint blocks it. Use `logger` from `core/logger.ts`; it attaches the
  request ID automatically.
- **CommonJS dependencies need named imports** under NodeNext (see `pino-http` in `app.ts`), not
  default imports.
- **Never pass `msg:` in a pino merge object** — pino owns that key, and duplicating it hides
  the real message.
- **Money only through `@rw/shared/money`.** No arithmetic on prices anywhere else.
- **Every route validates input through `middleware/validate.ts`.** This is the NoSQL-injection
  defence, not merely input hygiene.
- **New models go in `modules/<name>/`** with their service and routes, and are mounted on the
  `/api/v1` router in `app.ts`.
- The error handler is mounted last and must stay last.

## Conventions established in Step 2

- **All tenant data access goes through `tenantRepo(Model)`** from `core/tenant.ts`. It returns
  resolved promises, not chainable queries — sorting, limiting and projection go through its
  `FindOptions` argument. That is deliberate: a chainable query can have `.where()` bolted on
  far from the tenant check.
- **Apply `tenantGuardPlugin` to every new tenant-owned schema.** The exceptions are documented
  in the model files themselves: `Restaurant` (it *is* the tenant), `User` (platform admins have
  no tenant and login is by globally unique email), `RefreshToken` (looked up by hash before any
  tenant is known), and `AuditLog` (platform events belong to no tenant).
- **`unscoped()` is for platform-admin code only.** Every call site needs a justification and an
  audit event. Seeing it in a restaurant-facing module is a bug.
- **Authentication failures all return the same message.** Never add a helpful "no such account"
  or "your restaurant is suspended" — that turns the login form into an account-discovery tool.
- **Secrets are compared with `safeEqual`, never `===`.** Tokens are stored as `sha256` hashes,
  passwords as Argon2id.
- New audit actions are added to the `AuditAction` map in `modules/audit/auditLog.model.ts`.

## Conventions established in Step 3

- **Never set another person's password.** Provision accounts with a system-generated one-time
  password plus `mustChangePassword`, returned once and never retrievable.
- **Changing a password revokes every session**, including the caller's, and requires the current
  password even though the caller is already authenticated.
- **No MongoDB transactions.** They need a replica set, which rules out the simplest local and
  test setups. Two-document operations use a compensating rollback (see
  `platform.service.ts:createRestaurantWithOwner`). Revisit only if something genuinely needs
  atomicity across more than two documents.
- **Slugs are normalised, not rejected**, and checked against the reserved list in
  `schemas/restaurant.ts`. Add to that list whenever a new top-level route appears.

## Conventions established in Step 4

- **Never make a table-token or table-session error message more specific.** Unknown, tampered,
  inactive, suspended, rotated and expired must all return the same 404. There is a test that
  compares the response bodies byte for byte.
- **Customer routes go under `/api/v1/public/*` behind `requireTableSession`.** Read the tenant
  and table from the request context, never from the body, query or params.
- **Audit writes on a security-relevant failure path are awaited, not fired and forgotten.** An
  event that may or may not have been written is not a signal.
- **Secrets that must be readable later use `encryptSecret`/`decryptSecret`** (AES-256-GCM).
  `decryptSecret` returns null on failure — handle it, do not let it become a 500.
- Anything encoding a credential (QR images, session responses) sets `Cache-Control: no-store`.

## Conventions established in Step 5

- **Prices cross the API as integer halalas only.** No decimal SAR on the wire — JSON has no
  decimal type, so `12.10` arrives as `12.099999999999999`. The UI converts with
  `sarToHalalas` from `@rw/shared/money`.
- **An image URL is stored only if `imageProvider().isOwnedUrl(url, restaurantId)` passes.**
  Never accept an arbitrary URL from an admin — our customer page would then load content from a
  host we do not control.
- **Uploads go browser-to-provider via a signed, tenant-scoped, short-lived credential.** Files
  never pass through this server.
- **Image storage is behind `ImageProvider`.** Cloudinary today (dev/demo), Cloudflare R2 before
  real production. Core code never imports a vendor SDK.
- **Money-relevant changes get their own audit action**, with before and after values —
  `MENU_PRICE_CHANGED`, not a generic update event.
- Modifier option price deltas are zero or positive. Model a discount as a separate item.

## Conventions established in Step 6

- **`sanitizeFilter` is on globally, so a deliberate query operator must be wrapped in
  `mongoose.trusted()`.** `{ _id: { $in: ids } }` silently becomes `{ _id: { $eq: {$in: ids} } }`
  without it and the query matches nothing. This is the protection working as designed — a
  `{"$ne": null}` from a client can never become an operator — so do not disable it. Wrap ours
  instead, which also makes every intentional operator greppable.
- **Every status change goes through `transitionOrder`**, which consults the table in
  `@rw/shared/orderState`. Never add a route that accepts a status directly.
- **Transitions use a conditional `findOneAndUpdate` on the current status.** Removing that
  clause would let two simultaneous clicks both apply. The `expectedCurrentStatus` field extends
  the same guard to a stale screen.
- **Customer responses use `toCustomerOrderView`** — no internal `_id`, no `statusHistory`.
  Customers get `publicId` only. A route that returns the staff view to a phone is a bug.
- **Order creation requires an `Idempotency-Key` header.** Anything that costs money or food
  needs one.
- Snapshots, not references: an order carries its own copy of names, prices and VAT rates.
  Never re-read a menu item to price or re-price an existing order.
