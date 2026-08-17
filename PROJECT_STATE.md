# PROJECT STATE

> **Read this first.** This is the handoff document between AI-agent sessions.
> It is a decision record, **not** a substitute for reading the code. If this file
> and the repository disagree, **the repository is right** — fix this file.

---

## 1. Project Overview

A multi-tenant restaurant self-ordering SaaS for the Saudi Arabian market.

Each table carries an NFC tag and a QR code. A customer taps or scans, a mobile web page
opens showing that restaurant's menu, they order and pay by cash or Mada/card, the cashier
and kitchen see the order on their screens, and the order completes.

**Core commercial pitch:** *"Keep your existing POS/accounting system. Give your customers a
faster NFC/QR self-ordering experience and connect the orders to your existing workflow."*

We are **not** building accounting software. Foodics / Qoyod / whatever the restaurant already
runs stays the financial system of record. We integrate with it.

**Market:** Saudi Arabia. SAR, 15% VAT, Arabic + English, Saudi phone numbers, Mada.

---

## 2. Current Phase

```
Current Phase:   Phase 1 — Core restaurant + customer ordering MVP
Current Feature: Step 10 — restaurant settings API + owner settings screen
Status:          Phase 1 complete. A full adversarial audit landed on 2026-08-15:
                 21 findings, all fixed — see §16. The isolation, table-token,
                 pricing, order-state and audit cores were traced end to end and
                 held; the findings are at the edges. NOTE: the DB-backed suites
                 could not run in the audit environment (mongod download blocked),
                 so GitHub CI is the gate for that work — see §17.
                 One item still open from Step 8: the menu image upload interface,
                 blocked on Cloudinary credentials (see §7).
```

Phases: **0** discovery ✅ → **1** core ordering MVP → **2** payments + OTP + pickup →
**3** POS/accounting integration → **4** production hardening + commercial MVP.

---

## 3. Current Status

**Phase 1 is complete** — backend (Steps 1–6), all five frontend surfaces (Step 7), and hardening
(Step 8) except the menu image upload interface.

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:security` are
all green as of **2026-08-11** — **270 API tests + 43 shared tests passing, 0 failing**, of which
**202 are the security suite**.

> **2026-08-11 — read this before trusting §4 or `DESIGN.md`.** Between the 2026-08-09 handoff and
> this session, work landed **outside a tracked agent session**: the design system was replaced,
> `/dashboard` and a `dashboard` API module were added, and `Restaurant` gained
> `type: SINGLE | CHAIN_MAIN | BRANCH` with `parentId`. That work left `typecheck` and `lint`
> failing and introduced three defects (§16). All are now fixed and covered by tests.
> `DESIGN.md` has been rewritten from the code; the openwork design system it used to describe is
> **superseded**.

The whole dine-in flow now works over HTTP, end to end:

```
seed a platform admin
  → create a restaurant + its owner (one-time password)
  → owner changes the password, builds a menu, creates tables
  → each table gets an unguessable URL, a QR image, and a CSV row for NFC writing
  → a customer taps the tag; the token is exchanged once for a scoped session
  → the phone loads that restaurant's menu and nobody else's
  → the customer orders; the server prices it from the database
  → cashier confirms the cash; the order becomes CONFIRMED and PAID
  → kitchen accepts → preparing → ready
  → order completed, and permanently frozen
```

**The API still runs without a database in development.** `MONGODB_URI` is optional in
development and test, mandatory in production. Tests never read `apps/api/.env` — they always
use an in-memory MongoDB, so a suite can never touch a real database.

`docs/PHASE_0_ARCHITECTURE.md` remains the authoritative design document.

---

## 4. Completed Work

- [x] Repository inspected — confirmed greenfield/empty
- [x] Toolchain verified — Node v22.18.0, npm 11.3.0, git 2.35.1
- [x] Phase 0 architecture assessment (`docs/PHASE_0_ARCHITECTURE.md`)
- [x] `PROJECT_STATE.md`, `CLAUDE.md`, `walkthrough.md`
- [x] `.gitignore`, `.env.example` (no secrets)
- [x] git repository initialised (`main` branch, **no commit made yet**)
- [x] **Phase 1 Step 1 — foundation**
  - [x] npm workspaces monorepo: `packages/shared`, `apps/api`
  - [x] TypeScript strict, ESM/NodeNext, project references
  - [x] ESLint 9 flat config (`no-console` on — the pino logger is the only channel)
  - [x] `@rw/shared`: roles/status/order enums, halala money + VAT maths (19 tests)
  - [x] Zod-validated environment that fails fast, with production-only hardening rules
  - [x] pino structured logging with secret redaction + automatic request-ID mixin
  - [x] AsyncLocalStorage request context (the hook tenant isolation plugs into at Step 2)
  - [x] Express 5 app: helmet, CORS allowlist, 100 kb body limit, `trust proxy`
  - [x] Error taxonomy + final error handler (no stack traces or internals leak to clients)
  - [x] Zod request-validation middleware (also the NoSQL-injection defence)
  - [x] Mongoose connection helper with `sanitizeFilter` + `strictQuery`
  - [x] `/health` (liveness) and `/readyz` (readiness) endpoints
  - [x] Vitest + Supertest + `mongodb-memory-server` harness, proven working
  - [x] GitHub Actions CI: typecheck → lint → build → test, plus a committed-`.env` scan
- [x] **Phase 1 Step 2 — tenancy + authentication core**
  - [x] `Restaurant` model (tenant + settings), `User`, `RefreshToken`, `AuditLog`
  - [x] Argon2id password hashing (OWASP baseline parameters)
  - [x] `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`
  - [x] Opaque refresh tokens: hashed at rest, httpOnly cookie, rotated on every use
  - [x] Refresh reuse detection — replaying a spent token kills the whole family
  - [x] `tokenVersion` instant revocation; disabling a user or suspending a restaurant
        invalidates live access tokens on the next request
  - [x] Account lockout after repeated failures; identical response for every failure mode
  - [x] Login/refresh/API rate limiting (in-process; Redis in Phase 2)
  - [x] `tenantRepo()` scoped data accessor — defence layer 2
  - [x] `tenantGuardPlugin` Mongoose guard — defence layer 3
  - [x] `unscoped()` audited platform-admin escape hatch
  - [x] RBAC middleware, deny by default
  - [x] Append-only audit log + `writeAudit()` with salted IP hashing
  - [x] 25-test security suite (`npm run test:security`), separate CI step
- [x] **Phase 1 Step 3 — platform admin**
  - [x] `POST /platform/restaurants` — creates a tenant and its first OWNER, returns a
        one-time temporary password, with compensating rollback if the owner insert fails
  - [x] `GET /platform/restaurants` (+ status filter, staff counts), `GET /platform/restaurants/:id`
  - [x] `PATCH /platform/restaurants/:id/status` — suspend / reactivate with an audited reason
  - [x] `GET /platform/audit` — cross-tenant audit view with filters
  - [x] Slug rules incl. a reserved-word list (`api`, `admin`, `t`, …); case is normalised
  - [x] `npm run seed:admin` — one-time first-PLATFORM_ADMIN bootstrap from env vars
  - [x] `POST /auth/change-password` + `mustChangePassword` flag (closes the temp-password loop)
- [x] **Phase 1 Step 4 — tables + secure table tokens**
  - [x] `Table` model: 32-byte opaque token, SHA-256 hash for lookup + AES-256-GCM
        encrypted copy for QR reprinting. Plaintext is never stored.
  - [x] `TableSession` model with TTL expiry
  - [x] `POST /public/table-sessions` — the one-time token exchange
  - [x] `POST /public/table-sessions/refresh`, `GET /public/session`
  - [x] `requireTableSession` middleware — puts tenant + table into request context
  - [x] Separate signing secret and JWT audience for customer vs staff tokens
  - [x] Table admin routes (owner/manager only): list, create, update, rotate token
  - [x] QR code rendering (PNG + SVG), `Cache-Control: no-store`
  - [x] CSV export of table URLs for writing NFC chips, with quote escaping
  - [x] Two rate limiters: per-IP and per-token
  - [x] Identical 404 for every failure mode — verified byte-identical
- [x] **Phase 1 Step 5 — menu**
  - [x] `MenuCategory` and `MenuItem` models, both tenant-guarded
  - [x] Bilingual `{en, ar}` names and descriptions
  - [x] Integer-halala prices, per-item VAT override, prep time, calories,
        ingredients, allergens (all restaurant-supplied and labelled as such)
  - [x] Embedded modifier groups with cross-field validation
  - [x] Owner/manager CRUD; cashier may toggle availability only; kitchen may read
  - [x] `GET /public/menu` behind the table session, with ETag revalidation
  - [x] Image provider adapter — Cloudinary written, `none` by default
  - [x] Image URLs must belong to our provider *and* this tenant's folder
  - [x] `MENU_PRICE_CHANGED` audit with before/after values
- [x] **Phase 1 Step 6 — orders + state machine + cash**
  - [x] `Order` model with immutable snapshots of names, prices, VAT and modifiers
  - [x] Server-side pricing engine — every price read from the database, nothing from the client
  - [x] `Counter` model: atomic per-restaurant-per-day order numbers (KSA local day)
  - [x] `IdempotencyKey` model: a retried request replays, it does not duplicate
  - [x] Explicit transition table in `@rw/shared/orderState` with per-role permissions
  - [x] Conditional `findOneAndUpdate` so concurrent clicks cannot both win
  - [x] `POST /public/orders`, order status and self-cancel inside a window
  - [x] Staff order list with kitchen/cashier board presets, transition, confirm-cash
  - [x] `CASH_CONFIRMED` audit distinct from a generic status change
- [x] **Phase 1 Step 7a — customer frontend**
  - [x] `PRODUCT.md` and `DESIGN.md` written; design direction approved by the owner
  - [x] React 19 + Vite 7 + Tailwind v4 workspace at `apps/web`
  - [x] Design tokens in OKLCH: Al-Qatt Al-Asiri pigment on warm plaster
  - [x] The openwork motif in pure CSS gradients, zero requests
  - [x] `/t/:token` entry with the signature sweep, once per visit
  - [x] `/menu` typographic list with sticky category headings
  - [x] `/item/:id` full-route options screen with required-choice gating
  - [x] `/cart` and `/order/:publicId` with the state band
  - [x] Session handling with silent renewal and tag re-exchange
  - [x] `npm run dev:standalone --workspace @rw/api` — API + in-memory Mongo + demo data
  - [x] `npm run seed:demo --workspace @rw/api`
- [x] **Phase 1 Step 7b — kitchen + cashier**
  - [x] Staff auth client, separate from the customer one; access token in
        memory only, session restored from the httpOnly refresh cookie on boot
  - [x] `/staff/login`, role-aware landing
  - [x] `/kitchen` — dark wall-screen surface, tickets, action derived from
        `allowedNextStatuses`, 5 s poll that keeps running when unfocused
  - [x] `/cashier` — light till surface grouped by action, cash confirmation
  - [x] Route guards by role, with a loop-proof role-aware fallback
- [x] **Phase 1 Step 7c — admin surfaces**
  - [x] **New backend module `/app/staff`** — list, create with a one-time
        password, update role/status, reset password. It did not exist before,
        so an owner had no way to create a cashier.
  - [x] Privilege rules: nobody can mint a PLATFORM_ADMIN, a manager cannot
        touch owners or managers, nobody can change their own role or disable
        themselves. 13 tests.
  - [x] `/admin/menu` — categories, items, inline price editing in SAR,
        sold-out toggle
  - [x] `/admin/tables` — create, QR view, NFC URL, CSV export, guarded rotate
  - [x] `/admin/staff` — create, reset password, disable/re-enable
  - [x] `/platform` — create restaurants with their first owner, suspend with an
        audited reason, audit log
- [x] **Phase 1 Step 8 — hardening** (all but the image upload UI)
  - [x] `npm run indexes:check` — `explain()` against all 17 real query shapes
  - [x] `npm run indexes:sync` — creates declared indexes, drops redundant ones,
        refuses to run in production
  - [x] **Two real index fixes** — the customer menu was doing an in-memory sort;
        the customer order-status query was walking the restaurant's whole history
  - [x] `docs/THREAT_MODEL.md` — 22 threats (24 as of 2026-08-11), each with its control, its test, and
        its honest residual risk
  - [x] `/staff/password` — forced password change for provisioned accounts
- [x] **Untracked redesign + chain/branch work** *(landed outside a session; re-derived from the
      code on 2026-08-11)*
  - [x] New design system in `apps/web/src/styles/theme.css` — glassmorphism, mesh
        gradients, Inter/Tajawal from Google Fonts, full light + dark. **Replaces** the
        openwork/Al-Qatt system. See the rewritten `DESIGN.md` for what is actually there and
        for the eight rules it reverses.
  - [x] Shared UI primitives `components/ui/{Button,Card,Input,Skeleton}.tsx`
  - [x] `routes/staff/StaffLayout.tsx` — sidebar shell with a theme toggle, replacing
        `AdminShell` as the routed layout. `AdminShell.tsx` survives only for its named exports
        (`AdminSection`, `Field`, `inputClass`, `OneTimeSecret`, …)
  - [x] `routes/staff/Dashboard.tsx` + `modules/dashboard/` — `GET /app/dashboard/stats` and
        `GET /platform/dashboard/stats`
  - [x] `Restaurant.type` = `SINGLE | CHAIN_MAIN | BRANCH` with `parentId`
  - [x] Platform tenant detail screen + its API: update a restaurant, reset the owner's
        password, and full staff CRUD for any tenant
- [x] **Phase 1 Step 9 — reconciliation** *(2026-08-11)*
  - [x] Build repaired: `typecheck`, `lint` and `build` green again
  - [x] Three defects from the untracked work found and fixed (§16)
  - [x] `seedDemo.ts` restored to Mongoose models + Argon2id + real table tokens
  - [x] `tests/security/dashboard-security.test.ts` — 20 tests: dashboard tenant scoping,
        the date-filter regression, **chain/branch isolation**, and the platform-admin role guard
  - [x] `DESIGN.md` rewritten from the code
- [x] **Phase 1 Step 9c — the menu item editor** *(2026-08-12)*
  - [x] `routes/staff/MenuItemEditor.tsx` — bilingual name and description, price,
        prep time, calories, sort order, allergens, ingredients, VAT override,
        and a **modifier group builder**. Shared by create and edit.
  - [x] Closed a real gap: `/admin/menu` previously captured only four fields
        (category, English name, price, English description), so an owner could
        not author a choice group, an allergen or an Arabic name **at all** —
        even though the API and model had accepted them since Step 5. The demo
        only had working modifiers because `seedDemo.ts` wrote them directly.
  - [x] The form mirrors the server's cross-field modifier rules, so a bad group
        is explained in place instead of coming back as a 422
  - [x] Category Arabic names, inline — otherwise Phase 2 RTL starts with a hole
  - [x] `packages/shared/src/schemas/menu.test.ts` — 12 tests pinning the payloads
        the editor builds and every rule its form mirrors
  - [x] Quick actions kept quick: inline price edit and the sold-out toggle stay
        one interaction, because those are what happen mid-service
- [x] **Menu image upload interface** *(2026-08-12)* — `routes/staff/ImageUploadField.tsx`,
      wired into the item editor. Browser asks our API for a signed, tenant-scoped,
      5-minute credential, POSTs the file **straight to the image host**, and sends
      back only the URL, which the server re-validates as ours before storing.
      A bare `fetch` is used for the provider call on purpose — `staffApi` would
      attach our bearer token and cookies to a third-party origin.
      Cloudinary credentials were supplied by the product owner on 2026-08-12 and
      `IMAGE_PROVIDER=cloudinary` was set, so the path is live. The adapter is now
      covered by `tests/imageProvider.test.ts` — including the round trip that a
      delivered Cloudinary URL passes `isOwnedUrl`, which was the failure most
      likely to appear only after a real upload.
      ⚠ **Still not exercised with a real file over the network.**
- [x] **Portion counts (stock)** *(2026-08-12)*
  - [x] `MenuItem.stockRemaining` — `null` means untracked, `0` means sold out.
        The distinction is load-bearing: an untracked dish never blocks an order.
  - [x] `modules/orders/stock.ts` — every decrement is one conditional
        `findOneAndUpdate` guarded on `stockRemaining >= quantity`, so the
        database settles a race between two phones rather than a read-then-write.
        A multi-line order that runs out on line three walks back what it took.
  - [x] Reserved after pricing on order creation; released when the order fails
        and when it becomes CANCELLED, REJECTED or EXPIRED. **COMPLETED
        deliberately does not restock** — that food was served.
  - [x] **The number never reaches a customer.** The public menu carries a derived
        `isSoldOut` boolean instead. A count tells a customer how well a dish is
        selling and invites "only 2 left" pressure nobody asked us to create.
  - [x] Sold-out items now **stay on the customer menu, marked**, rather than
        vanishing — product-owner decision, applied to the manual toggle too so
        there is one sold-out behaviour. Retired (`isActive: false`) still
        disappears; retired and sold out are different things.
  - [x] Customer menu index is now `{restaurantId, isActive, sortOrder}`. Dropping
        `isAvailable` from the filter left a skipped key in the old index, which
        would have silently reintroduced the blocking in-memory sort Step 8
        removed. ⚠ **Run `npm run indexes:sync --workspace @rw/api`.**
  - [x] 16 security tests in `tests/security/stock-security.test.ts`
  - [ ] ⚠ **Kitchen staff cannot edit stock.** The original request was "admin or
        kitchen", but the control was placed in the admin item editor, which sits
        behind `/admin` and kitchen cannot reach. See §16.
- [x] **Category editing** *(2026-08-12)* — rename in both languages, reorder, hide from the
      customer menu, delete when empty. Replaces an inline control that could only add an
      Arabic name, so a category could not be renamed at all once it held items. Hiding and
      deleting stay distinct: hiding is reversible, and the server refuses a delete while any
      item still belongs to the category. Three tests, including that re-sending a category's
      own English name is not read as a duplicate of itself.
- [ ] Phase 2 — payments, OTP, takeaway/pickup, SMS
- [ ] Phase 3 — POS / accounting integration
- [ ] Phase 4 — production hardening, subscriptions, analytics

---

## 5. In Progress

```
Feature:  Phase 1 is functionally complete. Hardening done except image upload.
Blocker:  Menu image upload UI needs Cloudinary credentials (§7).
```

---

## 6. Next Immediate Task

**Phase 1 is complete and the build is green.** Everything below is a choice about what to do
next rather than unfinished work.

**Option A — close the last Phase 1 item.** The menu image upload interface. The API endpoint,
the Cloudinary adapter and the URL-ownership validation are all built and tested; only the
browser-side upload form is missing, and it cannot be verified end to end without credentials.
Needs the `USER ACTION` in §7.

**Option B — get a pilot restaurant ready.** This is the higher-value path, and it is mostly not
code:
1. Rotate the Atlas password and narrow the network allowlist (§7).
2. Move the backend to a paid always-on tier — the free tier sleeps and a cold start is tens of
   seconds, which is fatal for a customer tapping a tag (§17, §19).
3. Configure database backups **and restore one** to prove it works. A backup nobody has
   restored is not a backup.
4. Choose a product name and domain, then set `PUBLIC_APP_URL` so the QR codes are right.
5. Load-test at 100 concurrent customers.

**Option C — start Phase 2.** Mada payments via Moyasar, phone OTP, takeaway and pickup, SMS.
Needs merchant onboarding (Saudi CR + bank account), which has real lead time.

**Option D — settle the design system (new, 2026-08-11).** The replacement system is in the code
and working, but it reverses eight rules the product owner previously approved, and CLAUDE.md
still states the old ones. Nothing is broken; the documents simply disagree with the code. The
decisions, all listed with evidence in `DESIGN.md`:

1. **The accent is two different colours.** Dark mode is emerald `#10b981`; light mode is
   **indigo `#4f46e5`**, because `.theme-light` overrides the emerald values in `:root`. Pick one.
2. **Glassmorphism, card grids, and bounce easing were banned patterns** and are now the house
   style. Either update CLAUDE.md or restore the rules.
3. **The kitchen board animates every new ticket** with a 400 ms bouncy slide, every five seconds,
   on a screen watched for hours from two metres. This is the specific thing the motion budget was
   written to prevent, and it is the one worth fixing on ergonomic grounds regardless of taste.
4. **Fonts load from Google Fonts** on the customer's critical path. Self-hosting two subset woff2
   files removes a third-party origin, a DNS+TLS round trip from Saudi Arabia, a future CSP entry,
   and the visitor IPs currently sent to Google.
5. **The performance budgets are now meaningless** — entry chunk 85.09 KB gz against a stated
   60 KB, CSS 13.28 KB gz against 12 KB. Re-adopt the numbers deliberately or replace them.
6. **Theme is now global, not per-surface.** Only the kitchen keeps a forced surface.

⚠ **One deployment note before anything else.** The order idempotency index changed shape on
2026-08-12 (`sparse` → `partialFilterExpression`). Run `npm run indexes:sync --workspace @rw/api`
against any database that already exists; `syncIndexes()` drops and recreates it. In production
that is a reviewed deployment step, not this command — the script refuses to run there on purpose.

⚠️ Outstanding user action, not a blocker: rotate the Atlas password (§7, deferred to pre-production
by the product owner on 2026-08-09).

Decisions status (2026-08-09):

| # | Decision | Outcome |
|---|---|---|
| 1 | Product name + domain | **STILL OPEN** — needed for repo name and the `app.<domain>/t/<token>` URL |
| 2 | Table token storage | ✅ **DECIDED** — SHA-256 hash for lookup + AES-256-GCM encrypted copy for QR reprint |
| 3 | Payment provider | ✅ **DECIDED** — Moyasar (Phase 2; pricing to be verified live before signing) |
| 4 | Bilingual scope in Phase 1 | ✅ **DECIDED** — **English-first UI**; schema stores `{ar,en}` from day one; Arabic UI + RTL in Phase 2 |
| 5 | Pilot restaurant identified? | **STILL OPEN** — determines which Phase 3 adapter we build |

Neither open item blocks Step 2. **Placeholder names are in use and are trivially renameable:**
repo `restaurant-webapp`, packages `@rw/shared` and `@rw/api`. No domain is hard-coded anywhere —
the QR/NFC base URL comes from the `PUBLIC_APP_URL` environment variable.

---

## 7. Pending User Actions

### GitHub repository — Status: **Required to enable CI; not blocking local work**
The local git repository is initialised on branch `main`. **No commit has been made yet** —
awaiting the product owner's instruction.
1. Create a **private** repository on GitHub.
2. Provide the URL, or run `git remote add origin <url>` yourself.
*Why:* version control and CI (`.github/workflows/ci.yml` is written and ready).
*Sensitivity:* the URL is not secret; keep the repository private.

### ⚠️ Rotate the Atlas database password — Status: **DEFERRED to pre-production by the product owner (2026-08-09)**

On 2026-08-09 a diagnostic command run by the agent printed raw `.env` line content to the
session transcript, which exposed the Atlas database user's password. Treat it as compromised.

The product owner has decided to rotate before production rather than immediately. That is
reasonable while the cluster holds only development data. **Rotate sooner if** the cluster
starts holding real restaurant data, or if that password is reused anywhere else.

⚠️ **Escalated 2026-08-09:** the Atlas network allowlist was opened to `0.0.0.0/0` so the API
could connect from a changing IP. Combined with the exposed password, the cluster is now
reachable by anyone who has that string. Still development data only, so the exposure is
bounded, but **rotate the password or narrow the allowlist before any real restaurant data is
stored.** Either fix closes it.

Steps when the time comes:

1. MongoDB Atlas → **Database Access**
2. Edit user `shamalkhalidnp_db_user` → **Edit Password** → Autogenerate → **Update User**
3. **Connect** → copy the new connection string
4. Replace `MONGODB_URI` in `apps/api/.env`, keeping `/restaurant_dev` as the database name
5. Delete the unused `MONGODB_USERNAME` and `MONGODB_PASSWORD` lines — the application never
   reads them, and storing the same credential twice doubles the exposure surface

*Lesson recorded for future sessions:* when diagnosing an env file, print key names, value
lengths, and structural facts only. Never print value content, not even a prefix or suffix.

### MongoDB — Status: **CONNECTED 2026-08-09** (Atlas, MongoDB 8.0.28, database `restaurant_dev`)

Verified by an actual connect + list-collections call, not assumed. Database is empty, which is
expected — no models exist until Step 2.

Original setup instructions, kept for reference:

*Cheapest and fastest option, no account needed:* install MongoDB Community locally and use
`MONGODB_URI=mongodb://127.0.0.1:27017/restaurant_dev`. Recommended for development.

*Or MongoDB Atlas:*
1. Create a MongoDB Atlas account (free M0 tier is fine for development).
2. Create a project and a free cluster in a region near you.
3. Create a database user with a strong generated password.
4. Under Network Access, allow your current IP.
5. Copy the connection string.
6. Put it in `apps/api/.env` as `MONGODB_URI=` — **never** in any committed file.

*Value needed:* `MONGODB_URI` · *Goes in:* `apps/api/.env` · **Sensitivity: SECRET, backend only.**
An Atlas URI contains a password. Never paste it into chat, source code, a screenshot, or a
README. `apps/api/.env` is git-ignored, and CI fails the build if an env file is ever committed.

⚠️ Atlas M0 free tier has **no automated backups** and is not suitable for a live restaurant.
See §17 and §19.

### Cloudinary — Status: **CONFIGURED AND VERIFIED 2026-08-12**

Cloud name `jrtvkyhp`, plan Free, 25 credits. Confirmed with a read-only Admin API call
(`GET /v1_1/<cloud>/usage` → 200), which creates nothing.

**What was wrong, and the lesson:** `CLOUDINARY_CLOUD_NAME` held a 14-character value, but the real
cloud name is 8 characters. Cloudinary answered `401 {"error":{"message":"cloud_name mismatch"}}`.
Ruled out first, so nobody re-treads it: our signing matches Cloudinary's published reference
vector exactly; the values carried no whitespace or quotes; and the clock was fine, since the
upload completed a TLS handshake and got a real HTTP response back.

**Diagnose this class of failure with the read-only `/usage` call before touching any code.** It
distinguishes "wrong credentials" from "wrong signature" in one request, and it cost nothing.

⚠️ **Still not exercised with a real file over the network.** Credentials are valid and the
signing is proven offline, but no image has actually been uploaded and stored yet.

### Cloudinary — original setup notes

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` were supplied by the
product owner and are present in `apps/api/.env` (git-ignored — verified with `git check-ignore`).

**`IMAGE_PROVIDER` was missing and has been added as `cloudinary`.** It defaults to `none`, so the
three credentials were being ignored entirely and uploads would still have returned the 503. If
uploads ever start failing that way again, check this variable first.

`IMAGE_UPLOAD_MAX_BYTES` is unset and falls back to its 5 MB default, which is fine.

*Sensitivity:* `CLOUDINARY_API_SECRET` is **SECRET, backend only** — it signs uploads and must
never reach the browser. Cloud Name and API Key are not secret; the API Key is sent to the browser
by design, and the Cloud Name appears in every image URL. **Never paste the secret into chat, a
commit, or a screenshot.**

*Free tier:* Cloudinary's free plan is usage-credit based and the allowance has changed more than
once — **check the current limit on their pricing page rather than trusting a remembered figure.**
Upgrade trigger: exceeding the free allowance, or the move to production. Per §22 the production
choice is **Cloudflare R2**, which charges no egress; that is the bill that surprises people once
real customers load menu images all day. The `ImageProvider` interface exists so that switch is
one new adapter file.

### Cloudflare R2 — Status: Required before real production (menu images)
### Domain + DNS, Vercel, Render — Status: Required before pilot deployment
### Payment provider (sandbox → live merchant) — Status: Phase 2. Live account needs a Saudi CR and bank account; **long lead time, start early**
### SMS provider + CITC-registered sender ID — Status: Phase 2; **registration has lead time**
### Accounting/POS developer account — Status: Phase 3, depends on the pilot customer's software

Full step-by-step instructions are issued at the moment each one is actually needed.

---

## 8. External Services

| Service | Purpose | Environment | Plan | Status |
|---|---|---|---|---|
| GitHub | Source + CI | Dev | Free | **Not created** |
| MongoDB Atlas | Database | Dev | Free tier | **CONNECTED and in active use** — MongoDB 8.0.28, database `restaurant_dev`, seeded with demo data. ⚠️ allowlist is `0.0.0.0/0` and the password was exposed; see §7 |
| Cloudinary | Menu images (dev + demo) | Dev | Free (25 credits) | **CONNECTED AND VERIFIED 2026-08-12** — cloud `jrtvkyhp`, credentials confirmed via read-only `/usage`. Adapter covered by `tests/imageProvider.test.ts`. **Re-check the free allowance at cloudinary.com rather than trusting a remembered figure.** Production successor is R2 (§22) |
| Cloudflare R2 | Menu images (production) | — | Free tier | **Deferred by product-owner decision (2026-08-09)** — TODO before real production, see §22 |
| Vercel / CF Pages | Frontend hosting | Dev | Free | **Not created** |
| Render | Backend hosting | Dev | Free → Starter at pilot | **Not created** |
| Upstash Redis | Cache/queue | Phase 2 | Free | **Not needed yet** |
| Payment provider | Mada/card | Phase 2 | Sandbox | **Not created** |
| SMS provider | OTP + review SMS | Phase 2 | Sandbox | **Not created** |
| Qoyod / Foodics | Accounting/POS | Phase 3 | Developer | **Not started** |

Nothing is connected. No account has been created by the agent, and none ever will be.
The API runs locally with no external service at all — verified 2026-08-09.

---

## 9. Credentials / Environment Variables

**No real secret is ever recorded in this file.** Names and status only.

| Variable | Purpose | Environment | Sensitivity | Status |
|---|---|---|---|---|
| `MONGODB_URI` | Database connection | Backend | SECRET | **Configured** (Atlas, `restaurant_dev`) — ⚠️ replace when the §7 rotation happens |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | One-time first-admin bootstrap | Backend | SECRET | Pending — set, run `seed:admin`, then delete the password line |
| `JWT_ACCESS_SECRET` | Signs staff access tokens | Backend | SECRET | Pending (agent generates locally) |
| `TABLE_SESSION_SECRET` | Signs customer table-session tokens | Backend | SECRET | **Configured** (64 chars) |
| `TABLE_TOKEN_KEY` | AES-256-GCM key for table-token reprint | Backend | HIGHLY SENSITIVE | **Configured** (verified 32 bytes). **Back this up separately from the database** — losing it means rotating every table token and rewriting every physical NFC tag |
| `IP_HASH_SALT` | Salts IP hashes in audit logs | Backend | SECRET | Pending — required in production |
| `PUBLIC_APP_URL` | Base URL in QR/NFC payloads | Both | Public | Pending (needs domain) |
| `CORS_ORIGIN` | Allowed frontend origin | Backend | Public | Pending |
| `TRUST_PROXY_HOPS` | How many reverse proxies sit in front of the API in production | Backend | Public | **Defaults to `1`** (the previous hard-coded value). Production likely needs **`2`** — `vercel.json` rewrites `/api` onward to Render. Every IP rate limit depends on it; **measure `req.ips`, do not guess**. See §17 |
| `IMAGE_PROVIDER` | Selects the image adapter (`none` \| `cloudinary`) | Backend | Public | **Set to `cloudinary`** 2026-08-12. Defaults to `none`, which silently ignores the credentials below |
| `CLOUDINARY_CLOUD_NAME` | Appears in every image URL | Backend | Public | **Configured** |
| `CLOUDINARY_API_KEY` | Sent to the browser in the signed upload form | Backend | Public | **Configured** |
| `CLOUDINARY_API_SECRET` | Signs uploads | Backend | **SECRET — never leaves the server** | **Configured**. A test asserts it never appears in the credentials handed to the browser |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` | Image storage | Backend | SECRET (except public URL) | Pending — production successor to Cloudinary |
| `PAYMENT_API_KEY` / `PAYMENT_WEBHOOK_SECRET` | Phase 2 | Backend | HIGHLY SENSITIVE | Phase 2 |
| `SMS_API_KEY` / `SMS_SENDER_ID` | Phase 2 | Backend | SECRET / Public | Phase 2 |
| `REDIS_URL` | Phase 2 | Backend | SECRET | Phase 2 |

Rules: `.env` is git-ignored and never committed. `.env.example` carries names only. If a secret
is ever exposed anywhere, **rotate it immediately** — treat it as compromised.

---

## 10. Architecture

```
        Customer phone                 Staff browser/tablet
              │                                │
        app.<domain>  ── React + Vite (Vercel/Cloudflare Pages, CDN) ──┘
              │
              │  HTTPS + CORS, JSON
              ▼
        api.<domain>  ── Node 22 + Express 5 + TypeScript (Render)
                          modular monolith:
                          auth · restaurants · staff · tables · menu ·
                          orders · public · audit · platform
              │
      ┌───────┼──────────────────────────────┐
      ▼       ▼                              ▼
 MongoDB Atlas   Cloudflare R2          [Phase 2]
 (Mongoose)      (menu images)      Redis · payment provider · SMS
                                          │
                                     [Phase 3] Integration adapters
                                     Qoyod / Foodics / e-invoice
```

Key property: the frontend never names a tenant. `restaurantId` and `tableId` come only from
server-verified tokens.

---

## 11. Database Schema

**Implemented (Steps 2–6) — all Phase 1 models now exist:** `Restaurant`, `User`,
`RefreshToken`, `AuditLog`, `Table`, `TableSession`, `MenuCategory`, `MenuItem`, `Order`,
`Counter`, `IdempotencyKey`.

```
Order          restaurantId, publicId (opaque, customer-facing), orderNumber ("001"),
               type, tableId, tableSessionId, tableLabelSnapshot,
               status, paymentMethod, paymentStatus,
               items[]  ← FULL SNAPSHOTS: nameSnapshot, unitPriceHalalas,
                          vatRatePercentSnapshot, quantity, modifiers[],
                          lineSubtotal/Vat/Total
               totals{ subtotal, vat, serviceCharge, grandTotal }  (halalas)
               vatRateSnapshotPercent, pricesIncludeVatSnapshot, currencySnapshot,
               idempotencyKey (unique per restaurant, sparse),
               statusHistory[{from,to,byUserId,byRole,at,reason}],
               placedAt/confirmedAt/readyAt/completedAt/cancelledAt
Counter        _id "<restaurantId>:<YYYYMMDD>", seq, expiresAt (TTL 3d)
IdempotencyKey restaurantId+scope+key unique, requestHash, status, responseSnapshot,
               expiresAt (TTL 24h)
```

```
MenuCategory  restaurantId, name{en,ar}, description{en,ar}, sortOrder, isActive
              unique (restaurantId, name.en)
MenuItem      restaurantId, categoryId, name{en,ar}, description{en,ar},
              priceHalalas (INTEGER), vatRatePercent?, imageUrl,
              isAvailable, isActive, prepTimeMinutes, calories,
              ingredients[], allergens[], sortOrder,
              modifierGroups[] (embedded: key, name, min/maxSelect, required,
                                options[{key, name, priceDeltaHalalas, isAvailable}])
```

```
Table         restaurantId, label (unique per restaurant), zone, seats,
              tokenHash (sha256, unique), tokenCipher (AES-256-GCM), tokenRotatedAt,
              tokenVersion, status
TableSession  restaurantId, tableId, publicId, status, startedAt, lastSeenAt,
              expiresAt (TTL index), ipHash, userAgent
```

Tenant-guard status per collection — the exceptions are deliberate and documented in each model
file, so a future agent does not "fix" them:

| Collection | Tenant guard | Why |
|---|---|---|
| `Restaurant` | no | it *is* the tenant; a `restaurantId` filter is meaningless |
| `User` | no | platform admins have no tenant, and login is by globally unique email before any tenant is known. Scoped via `tenantRepo(UserModel)` in staff routes, proven by tests |
| `RefreshToken` | no | looked up by token hash before identity is established |
| `AuditLog` | no | platform-level events belong to no tenant |
| `Table` | **yes** | applied |
| `TableSession` | no | looked up by id from a verified token *before* the tenant context exists — it is what establishes that context, so guarding it would be circular. Every read goes through `requireTableSession`, which checks the tenant itself |
| `MenuCategory`, `MenuItem`, `Order` | **yes** | applied |
| `Counter`, `IdempotencyKey` | no | the tenant is part of the `_id` / unique index, so there is no filter to forget |

### Chains and branches (added outside a tracked session; verified 2026-08-11)

`Restaurant.type` is `SINGLE | CHAIN_MAIN | BRANCH`, and a `BRANCH` carries `parentId`.

**The critical property, and the reason this is safe: a branch is an ordinary tenant.** It has its
own `restaurantId`, its own staff, its own menu, its own tables and its own orders. `parentId`
records a commercial relationship for the platform view and **nothing else** — no query anywhere
widens tenant scope through it, and `core/tenant.ts` has no hierarchy logic at all. A chain owner
gets a 404 on a branch's order, identical to the response for an id that does not exist.

Rules enforced at creation, in `platform.service.ts`:

- a `BRANCH` must name a `parentId`;
- that parent must exist and must be a `CHAIN_MAIN`, so the hierarchy is exactly one level deep
  and a branch cannot parent another branch;
- `parentId` is persisted **only** for a `BRANCH`, so a stray value on a `SINGLE` or `CHAIN_MAIN`
  can never later be misread as a hierarchy.

All six properties are pinned by `tests/security/dashboard-security.test.ts`. **If a future
requirement genuinely needs chain-wide reporting, it must be a new, explicitly audited accessor —
never a widening of `tenantRepo`.**

Full field lists are in `docs/PHASE_0_ARCHITECTURE.md` §3.

Phase 1 collections:

```
Restaurant       name{ar,en}, slug, status,
                 type: SINGLE | CHAIN_MAIN | BRANCH,   parentId (BRANCH only),
                 settings{vatRatePercent, pricesIncludeVat,
                 kitchenStartsBeforePayment, tableSessionTtlMinutes, orderTypes, …}
User             email, passwordHash(argon2), role, restaurantId, status, tokenVersion
RefreshToken     tokenHash, familyId, expiresAt(TTL), revokedAt
Table            restaurantId, label, tokenHash(unique), tokenCipher, status
TableSession     restaurantId, tableId, publicId, status, expiresAt(TTL)
MenuCategory     restaurantId, name{ar,en}, sortOrder, isActive
MenuItem         restaurantId, categoryId, name{ar,en}, priceHalalas, vatRatePercent,
                 isAvailable, modifierGroups[] (embedded)
Order            restaurantId, publicId, orderNumber, tableId, status, paymentStatus,
                 items[] (full snapshots), totals{}, idempotencyKey, statusHistory[]
Counter          per-restaurant-per-day atomic order numbering
IdempotencyKey   restaurantId + scope + key, unique, TTL 24h
AuditLog         append-only: restaurantId, actor, action, target, metadata, requestId, at
```

**Money is stored as integers in halalas (1 SAR = 100 halalas). Never floats.**
Deferred until the phase that needs them: Payment, PaymentTransaction, Customer,
OtpVerification, PickupToken, Notification, Rating, Integration, ExternalMapping, Invoice,
Subscription, WebhookEvent.

---

## 12. API Endpoints

Four surfaces with different authentication:

```
/api/v1/public/*     no auth or table-session token   → customers
/api/v1/app/*        staff access token (JWT) + RBAC  → restaurant staff
/api/v1/platform/*   staff access token, PLATFORM_ADMIN
/api/v1/webhooks/*   provider signature               → Phase 2
```

**Implemented so far:**

```
GET  /health                 → 200 { status, uptimeSeconds }           liveness, no DB access
GET  /readyz                 → 200|503 { status, checks: { database } } readiness

POST /api/v1/auth/login      { email, password }
                             → 200 { user, accessToken, expiresInSeconds }
                               + httpOnly refresh cookie (path /api/v1/auth)
POST /api/v1/auth/refresh    refresh cookie → new access token, rotated cookie
POST /api/v1/auth/logout     → 204, revokes the whole token family
GET  /api/v1/auth/me         Bearer access token → 200 { user }
POST /api/v1/auth/change-password  { currentPassword, newPassword }
                             → 200, revokes every session including the caller's

# customer — no login. The table token is seen exactly once, here.
POST /api/v1/public/table-sessions          { tableToken }
                             → 201 { sessionToken, restaurant, table }
POST /api/v1/public/table-sessions/refresh  session token → slides the window
GET  /api/v1/public/menu                    session token → that tenant's menu only,
                                            ETag + private caching
POST /api/v1/public/orders                  requires Idempotency-Key header.
                                            Body has items + quantities + modifier keys ONLY —
                                            no table, no restaurant, no prices, no totals.
GET  /api/v1/public/orders                  this session's orders only
GET  /api/v1/public/orders/:publicId        this session's order only
POST /api/v1/public/orders/:publicId/cancel inside ORDER_CANCEL_WINDOW_SECONDS
GET  /api/v1/public/session                 session token → { tableId, restaurantId }

# restaurant staff — the restaurant's own record (OWNER | MANAGER)
# Singular and id-less on purpose: the tenant comes from the token, so there is
# no parameter to tamper with. Added 2026-08-15.
GET   /api/v1/app/restaurant          → { restaurant, settings, editable }
PATCH /api/v1/app/restaurant          { name?, addressLine?, city?, phone?, logoUrl?,
                                        vatNumber?, crNumber?, serviceChargePercent?,
                                        kitchenStartsBeforePayment?,
                                        tableSessionTtlMinutes?, defaultLocale? }
                                       vatRatePercent / pricesIncludeVat / currency /
                                       orderTypes / slug / status are STRIPPED here —
                                       they are platform-only. See the finance route.

# restaurant staff — tables (OWNER | MANAGER only)
GET    /api/v1/app/tables
POST   /api/v1/app/tables                { label, zone?, seats? }
PATCH  /api/v1/app/tables/:id
POST   /api/v1/app/tables/:id/rotate-token
GET    /api/v1/app/tables/:id/qr          ?format=png|svg
GET    /api/v1/app/tables/export           CSV of table URLs for NFC writing

# restaurant staff — menu
GET|POST                /api/v1/app/menu/categories        OWNER | MANAGER
PATCH|DELETE            /api/v1/app/menu/categories/:id    OWNER | MANAGER
GET                     /api/v1/app/menu/items             any staff role (read)
POST                    /api/v1/app/menu/items             OWNER | MANAGER
PATCH|DELETE            /api/v1/app/menu/items/:id         OWNER | MANAGER
PATCH                   /api/v1/app/menu/items/:id/availability   + CASHIER
POST                    /api/v1/app/menu/images/upload-credentials OWNER | MANAGER

# restaurant staff — staff management (OWNER | MANAGER)
GET   /api/v1/app/staff
POST  /api/v1/app/staff                   → 201 { user, temporaryPassword }
PATCH /api/v1/app/staff/:id               { name?, role?, status?, phone? }
POST  /api/v1/app/staff/:id/reset-password → 200 { user, temporaryPassword }

# restaurant staff — orders
GET  /api/v1/app/orders              ?board=kitchen|cashier &status= &from= &to=
GET  /api/v1/app/orders/:id
POST /api/v1/app/orders/:id/transition   { to, reason?, expectedCurrentStatus? }
                                          ← the ONLY route that changes status
POST /api/v1/app/orders/:id/confirm-cash  CASHIER | MANAGER | OWNER

# restaurant staff — dashboard (OWNER | MANAGER)
GET  /api/v1/app/dashboard/stats     → { todayRevenueHalalas, todayOrdersCount,
                                         activeOrders, staffCount }
                                       Scoped by tenantRepo. A BRANCH sees only its own
                                       numbers — never its chain's, never a sibling's.

# platform admin only (requireAuth + requirePlatformAdmin on every route)
POST   /api/v1/platform/restaurants        → 201 { restaurant, owner, temporaryPassword }
                                             body may carry type + parentId (see below)
GET    /api/v1/platform/restaurants        ?status=&limit=&skip=
GET    /api/v1/platform/restaurants/:id
PATCH  /api/v1/platform/restaurants/:id            { name?, slug?, city?, vatNumber?, crNumber? }
PATCH  /api/v1/platform/restaurants/:id/finance   { vatRatePercent?, pricesIncludeVat?,
                                                   orderTypes? }
                                                 The ONLY route that can set a VAT rate.
                                                 Writes RESTAURANT_VAT_CHANGED with
                                                 before/after values.
PATCH  /api/v1/platform/restaurants/:id/status     { status, reason? }
POST   /api/v1/platform/restaurants/:id/reset-password  → 200 { temporaryPassword }
GET    /api/v1/platform/restaurants/:id/staff
POST   /api/v1/platform/restaurants/:id/staff      { name, email, role }
                                             role is validated against TENANT_ROLES, so
                                             PLATFORM_ADMIN can never be minted here
PATCH  /api/v1/platform/restaurants/:id/staff/:staffId   { name?, role?, status? }
                                             same TENANT_ROLES rule; status ACTIVE|DISABLED.
                                             Disabling revokes every session immediately.
DELETE /api/v1/platform/restaurants/:id/staff/:staffId   → 200 { user }
                                             Removes from the team by DISABLING, not by
                                             deleting the row — the audit log must keep
                                             resolving to a real account. Reverse it with
                                             the PATCH above.
GET    /api/v1/platform/dashboard/stats    → { totalRestaurants, totalUsers,
                                               todayPlatformOrders }  (unscoped, audited)
GET    /api/v1/platform/audit              ?restaurantId=&action=&limit=&skip=
```

`/api/v1` is mounted and empty; modules attach to it from Step 2. Every unknown route returns a
structured `404 NOT_FOUND` carrying the request ID.

All other Phase 1 routes are listed in `docs/PHASE_0_ARCHITECTURE.md` §4 and **do not exist yet.**

Two standing rules: (1) `restaurantId` never appears in an app-route path or body — it comes
from the token; (2) order status changes go through a single `POST /orders/:id/transition`
route governed by the state machine.

---

## 13. Security Decisions

These are deliberate. **Do not reverse them without explicit product-owner approval.**

- Table database IDs are never used as authorisation credentials.
- Table access uses a 256-bit opaque token, stored as a SHA-256 hash (plus an AES-256-GCM
  encrypted copy so the QR can be reprinted). Plaintext tokens are never stored.
- Customer session tokens and staff access tokens use **different signing secrets and different
  JWT audiences**. Neither can be used in the other's place.
- Every table-token and table-session failure returns a byte-identical 404. Do not add a more
  helpful message to any of them.
- Table URLs are visible to OWNER and MANAGER only — the URL is the credential.
- The table token is exchanged once for a short-lived table-session token; every later request
  uses the session. `restaurantId` and `tableId` are read from the session, never from the body.
- Every tenant-scoped query includes `restaurantId`; `findById` becomes
  `findOne({_id, restaurantId})`. Cross-tenant access returns 404, not 403 — no existence leak.
- A Mongoose plugin throws if a tenant-owned query has no `restaurantId` filter.
- Item prices and VAT are recomputed server-side from the database. Client-supplied prices are
  discarded.
- Orders store immutable snapshots. Changing a menu price never changes a past bill.
- `sanitizeFilter` stays on globally. A deliberate query operator is wrapped in
  `mongoose.trusted()` — never disable the setting to make a query work.
- Order status changes only through `POST /app/orders/:id/transition`, checked against the
  transition table, applied with a conditional update on the current status.
- Customer responses never include an internal `_id` or `statusHistory`.
- Order creation requires an `Idempotency-Key`.
- Order status changes are validated against an explicit transition table with role checks.
  Terminal states cannot be edited.
- Payment status is set only by a signature-verified provider webhook or a server-side
  reconciliation poll. The browser redirect is a hint, never proof.
- Raw card data is never received, stored, or logged. Hosted/tokenised flows only (PCI SAQ-A).
- Money is integer halalas.
- Access tokens live 15 minutes in memory; refresh tokens are opaque, hashed at rest, httpOnly
  cookies, rotated with reuse detection; `tokenVersion` revokes instantly.
- OTPs are hashed, never logged, rate-limited, expiring (Phase 2).
- Audit log is append-only; no API route updates or deletes it.
- Secrets live only in environment variables. `.env` is git-ignored from commit #1.
- Uploads are MIME + magic-byte validated, size-capped, re-encoded, and served from a separate
  origin.

---

## 14. Important Technical Decisions

| Decision | Reason |
|---|---|
| Modular monolith, not microservices | 1–100 restaurants fit one process; microservices multiply ops cost for no benefit |
| Monorepo (npm workspaces) with a shared package | Zod schemas, money maths, and the state machine must be identical on both sides |
| MongoDB + Mongoose | your stated preference; document snapshots suit orders well |
| **No Redis in Phase 1** | in-process rate limiting is correct for one instance; Mongo TTL covers idempotency and sessions. Redis arrives in Phase 2 with OTP/SMS queues |
| Polling (TanStack Query) for live boards, not WebSockets | free tiers dislike long-lived connections; 5 s polling is adequate at this scale |
| Integers in halalas for money | floats produce wrong receipts |
| Hosted/redirect payment pages | keeps us at PCI SAQ-A instead of an audit programme |
| Adapter interfaces for accounting/POS | core code never imports a vendor SDK; adding a provider touches one file |
| **A restaurant cannot set its own VAT rate** (product owner, 2026-08-15) | In KSA the standard rate is set by ZATCA — it is law, not a business preference. A wrong value under-collects tax on every order and corrupts every invoice, and it would propagate straight into the Phase 3 accounting sync. Genuinely zero-rated dishes are already served by the per-item `vatRatePercent` override on the menu item. `pricesIncludeVat` is platform-only for the same reason: KSA consumer prices are displayed VAT-inclusive, and it is a silent boolean that moves every bill by the whole VAT rate. Both are set through `PATCH /platform/restaurants/:id/finance`, which exists **because** "platform-only" has to mean somebody can |
| **Service charge capped at 15%** (product owner, 2026-08-15) | The column allows 0–100, which is a storage bound rather than a policy: a mistyped `100` would silently double every customer's bill. Enforced in the shared schema, not only in the form, because the UI is not a security boundary |
| **The settings route is singular and id-less** — `/app/restaurant`, not `/app/restaurants/:id` | The tenant comes from the verified token. A path with an id invites exactly the mistake four layers of tenant isolation exist to prevent, and it would be one careless handler away from being honoured |
| One React app with role-aware routing | one build, one deploy, shared components |
| argon2 for passwords, `jose` for JWT | current best practice |
| Table tokens: SHA-256 hash for lookup **+** AES-256-GCM encrypted copy | *(decided 2026-08-09)* a DB dump yields no working URLs, yet the owner can still reprint a QR without rewriting the physical tag. Reuses the same crypto helper needed for payment and accounting credentials in Phases 2–3 |
| **English-first UI in Phase 1**; Arabic UI + RTL in Phase 2 | *(decided 2026-08-09)* ships Phase 1 faster. **The database schema stores `{ar,en}` for every user-visible string from day one**, so no migration is needed later — but the UI layer will need reworking for RTL. Recorded as a known cost, not a surprise |

---

## 15. Business Decisions

- Primary market: Saudi Arabia.
- Customer-facing NFC/QR ordering is the core product.
- The restaurant keeps its existing POS/accounting system; we integrate rather than replace.
- Full accounting software is explicitly out of scope.
- We do **not** claim ZATCA certification. We integrate with a compliant provider.
- Annual subscription is the preferred commercial model; monthly exists at a premium.
- Pricing is **not hard-coded** — it must be configurable from the platform admin.
- Both NFC and QR are supported on every table; QR is the fallback for older phones.
- Native mobile apps are future work, after the web product is validated.
- Success ladder: 1 real restaurant → 3 paying → 10 → 30 → 100.
- *(2026-08-09)* Payment direction: **Moyasar**, Saudi/Mada-native. Phase 2. Sandbox first.
  Live merchant onboarding needs a Saudi CR + bank account — long lead time, start early.
- *(2026-08-09)* Phase 1 ships an **English-only UI**. Arabic and RTL land in Phase 2.
  All content fields are bilingual in the database from the start.

---

## 16. Known Bugs

### Fixed 2026-08-11 — all introduced by the untracked redesign session

| Bug | Severity | Status | Notes |
|---|---|---|---|
| Dashboard counters always read zero | **High** | ✅ fixed | `dashboard.service.ts` filtered `{ placedAt: { $gte: … } }` without `mongoose.trusted()`. `sanitizeFilter` is on globally, so the operator was rewritten to `{ $eq: { $gte: … } }` and matched nothing. **This is the identical mistake found and fixed in Step 6** — the convention exists precisely because it is easy to repeat. Regression test: "does not silently return zero because the date operator was swallowed" |
| "Today" used server-local midnight | Medium | ✅ fixed | The server runs UTC in production, so the dashboard's day started at 03:00 Riyadh — the small hours were counted against the wrong day, and the totals disagreed with the order numbers, which already restart on the KSA day. Now uses `startOfBusinessDay()`, exported from `counter.model.ts` so there is one definition of "today" |
| `PLATFORM_ADMIN` assignable to a tenant user | **High** | ✅ fixed | The new platform staff routes validated `role` against the whole `Role` enum. `User` blocks a platform admin with a `restaurantId` in a `pre('validate')` hook, **but a document hook does not run on `findOneAndUpdate`** — so `PATCH /platform/restaurants/:id/staff/:staffId` could write `role: PLATFORM_ADMIN` onto a user that still had a `restaurantId`, breaking the invariant every tenant check depends on. Now validated against `TENANT_ROLES`. Only a platform admin could reach it, so this was an integrity hole rather than an escalation |
| `seedDemo.ts` written against the raw driver | **High** (dev only) | ✅ fixed | Rewritten to use the wrong collections (`staff` not `users`), string `_id`s instead of ObjectIds, SHA-256 + a non-existent `passwordSalt` field instead of Argon2id, and tables with **no token at all**. It had also stopped exporting `seedDemoData()`, which `scripts/dev-standalone.mts` imports — so `npm run dev:standalone` was broken. Restored over the Mongoose models; verified end to end (staff login and table-token exchange both succeed) |
| Platform tenant screen offered a role that does not exist | Medium | ✅ fixed | `PlatformTenantDetail.tsx` offered `ADMIN` in its role select. There is no such role; the server would have rejected every staff member created that way. Now `MANAGER` |

### Fixed 2026-08-12 — the two items left open the previous day

| Bug | Severity | Status | Notes |
|---|---|---|---|
| `DELETE /platform/restaurants/:id/staff/:staffId` hard-deleted a user | Medium | ✅ fixed | Wrong twice over: the append-only audit log stores `actorUserId` on every entry, so deleting the account turned everything that person ever did into a dangling id; and it left their refresh tokens live in the database, so the row vanished while the sessions did not. Now a **disable** — `revokeAllSessions()` bumps `tokenVersion` and revokes every refresh token, the account stops working on the next request, and the history still resolves to a real person. The route returns 200 with the updated user rather than 204, so the UI can render the DISABLED state. Re-enable with `PATCH … { status: 'ACTIVE' }`. `AuditAction.STAFF_DELETED` is retired but kept in the map, because the log is append-only and old rows may carry it |
| Compound sparse index did not behave as its name suggests | Low | ✅ fixed | `{ restaurantId, idempotencyKey }` was `sparse: true`, but a compound sparse index skips a document only when *every* indexed field is absent. `restaurantId` is always present, so a key-less order indexed as `null` and a second one collided — **observed for real** while writing the dashboard tests. Now `partialFilterExpression: { idempotencyKey: { $type: 'string' } }`, which says the intended thing directly. `npm run indexes:sync` drops and recreates it; **run it against any existing database** |
| `updateRestaurantStaff` audited a name edit as a role change | Low | ✅ fixed | Found while touching the same function. It wrote `STAFF_ROLE_CHANGED` unconditionally, which makes the log both noisier and less believable. Now conditional on the role actually moving, and it records `from`/`to` like the equivalent in `staff.service.ts` |

### Fixed 2026-08-12 — both reported from the browser by the product owner

| Bug | Severity | Status | Notes |
|---|---|---|---|
| The QR code never rendered on `/admin/tables` | **High** (feature was unusable) | ✅ fixed | `<img src="/api/v1/app/tables/:id/qr">` **cannot authenticate.** The browser issues that GET with no `Authorization` header, and the staff access token deliberately lives in a module variable rather than a cookie so XSS cannot read it — so the request arrived anonymous and the route answered 401, leaving a broken image. Now fetched through the authenticated staff client as a blob and rendered from an object URL, which the component revokes on close. **The token was never put in the query string**: that would write a live credential into browser history, referrer headers and every proxy log in between |
| Every table URL and QR pointed at a dead port | **High** (NFC tags unusable) | ✅ fixed | `PUBLIC_APP_URL` defaulted to `http://localhost:5173`, Vite's default port — but `apps/web/vite.config.ts` pins the dev server to **5174**. Scanning a tag gave `ERR_FAILED`. The wrong port was in four places at once: `config/env.ts` (both `PUBLIC_APP_URL` and `CORS_ORIGIN`), `scripts/dev-standalone.mts`, `.env.example`, and `.claude/launch.json`. All now 5174, each with a comment naming `vite.config.ts` as the source of truth. **No token rotation was needed** — the URL is rebuilt from `PUBLIC_APP_URL` on every read, so existing tables were correct the moment the API restarted |
| The CORS test hardcoded a port | Low | ✅ fixed | `app.test.ts` asserted `http://localhost:5173` literally, so it failed the moment the port moved. Now reads `env.corsOrigins[0]`. A test that must be edited whenever configuration changes is testing the constant, not the behaviour |

### Fixed 2026-08-15 — full security, accessibility, performance and UX audit

Whole-repository adversarial review (OWASP Top 10 / ASVS / API Top 10 / WCAG 2.2 AA). The tenant
isolation, table-token, pricing, order-state and audit designs were traced end to end and **held**;
everything below is at the edges of those cores. `npm run test:security` could **not** be run in the
audit environment — `fastdl.mongodb.org` is blocked by egress policy, so `mongodb-memory-server`
cannot fetch a `mongod` binary and all 10 DB-backed suites abort at setup. CI on GitHub is unaffected
and remains the gate. Typecheck, lint, build, the 43 shared tests and the 44 DB-free API tests were
all run and are green.

| Bug | Severity | Status | Notes |
|---|---|---|---|
| Platform owner password reset left every session alive | **High** | ✅ fixed | `platform.service.ts:resetOwnerPassword` wrote a new hash and stopped there. `staff.service.ts:resetStaffPassword` has always called `revokeAllSessions()`; this one never did. The reason a platform admin resets an owner's password is almost always suspected compromise — and the attacker's access token stayed valid to expiry while their refresh token stayed valid for its **full 30 days**, so the reset accomplished nothing against the case it exists for. Now revokes, and audits as `STAFF_PASSWORD_RESET` rather than a generic `PASSWORD_CHANGED` |
| CSV formula injection in the table export | Medium | ✅ fixed | `exportTableUrls()` quoted fields for *structure* but not for *evaluation*. A table label of `=HYPERLINK("http://evil.test"&A1)` — free text any owner or manager can set — executes when a colleague opens `tables.csv` in Excel, LibreOffice or Sheets (CWE-1236). Quoting does not help: the spreadsheet strips the quotes first. Now every field goes through `csvField()`, which prefixes an apostrophe when the value starts with `= + - @ TAB CR`. 12 unit tests in `tests/csvExport.test.ts`, which need no database and so run anywhere |
| `PATCH /platform/restaurants/:id` accepted any slug | Medium | ✅ fixed | The update route used `z.string().trim().min(1)` while creation used `slugSchema`. An edit could therefore set a slug creation would refuse — `admin`, `api`, `t`, `Has Spaces` — landing as a Mongoose `ValidationError` or a duplicate-key error, both surfacing as **500** rather than 422/409. Now `slugSchema` at the edge plus an explicit uniqueness check returning 409 |
| Locked accounts answered faster than any other login | Low | ✅ fixed | The lockout branch returned before Argon2 ran, and Argon2 dominates the request. Every failure message is byte-identical by design, but the *timing* was not: a few milliseconds versus tens told an attacker which addresses exist and which they had already locked — the exact oracle the identical messages close. The dummy verify is now performed and discarded, matching the treatment already given to unknown emails |
| `stripTenantFromUpdate` covered only `$set`/`$setOnInsert` | Low | ✅ fixed | Defence in depth on the tenancy invariant. `$unset: { restaurantId: 1 }` would strand a document beyond the reach of every tenant query. Not reachable today — no route passes a caller-controlled update — but this layer exists precisely so that stays true. Now cleans all eight field-naming operators |
| The web origin served no security headers at all | Medium | ✅ fixed | `vercel.json` had rewrites and nothing else, so the SPA document shipped with no CSP, no `frame-ancestors`, no `Referrer-Policy`, no `nosniff` and no HSTS. Helmet only ever covered API responses on the Render origin. The staff, admin and platform surfaces were therefore **framable**, next to one-click destructive actions like Suspend. Added a `headers` block with a CSP scoped to what the app actually loads (self scripts, Google Fonts, `res.cloudinary.com` images, `blob:` for QR codes, `api.cloudinary.com` for direct uploads) plus HSTS, `nosniff`, `no-referrer`, `Permissions-Policy` and COOP |
| `trust proxy` was hard-coded to one hop | Low | ✅ made configurable | `vercel.json` rewrites `/api` onward to the API host, so production has **two** proxies, not the one the code assumed. Too low a count makes every request appear to come from the last proxy, collapsing all IP rate limits into one shared bucket. Now `TRUST_PROXY_HOPS`, defaulting to the previous value of 1 so nothing changes silently. **The product owner must verify the real number** — see §17 |
| "Export CSV" on `/admin/tables` always failed | **High** (feature was unusable) | ✅ fixed | A plain `<a href="/api/v1/app/tables/export">`. This is **exactly the bug fixed for the QR image on 2026-08-12**, in a second place: the browser issues that GET with no `Authorization` header, the staff access token lives in a module variable by design, so the route answered 401 and the browser "downloaded" an error page. Now `downloadStaffFile()` fetches through the authenticated client and saves from an object URL. `rawBlob()` also gained the same one-shot refresh `staffApi` has, so a QR or export opened more than 15 minutes after signing in no longer fails |
| An expired session left staff on a dead screen | Medium | ✅ fixed | `RequireStaff` called `getStaffUser()` — a snapshot. `subscribeToAuth` was exported and **never used by anything**. When a refresh token finally expired mid-shift the module cleared the user but nothing re-rendered, so a cashier kept looking at a till that 401'd every action and offered no way back to sign in. Now `useStaffUser()`, a `useSyncExternalStore` subscription |
| Kitchen and cashier actions failed silently | Medium | ✅ fixed | Both boards' mutations had `onSettled: invalidate` and no error path. A refused transition — "This order was changed by someone else", "This order is already paid" — produced **no visible change at all**, indistinguishable from a dead screen on the two surfaces where money and food are at stake. Both boards now show the server's own message with a dismiss control |
| Destructive actions fired on a single click | Medium | ✅ fixed | Platform **Suspend** stops a real business trading within one token lifetime, and sat beside a Reset Password button that already asked for confirmation. Staff **Reset Password** and **Disable** were two small adjacent buttons, either of which ends every session that person has, with no undo — the old password is gone. All three now confirm, naming the consequence |
| `Input`'s label was never associated with its input | Medium (a11y) | ✅ fixed | No `htmlFor`, no `id`, no wrapping `<label>` — so the label was decoration. Screen readers announced "edit text, blank", and clicking the label did nothing. Affected the kitchen note, special instructions and the whole tenant-provisioning form. Now `useId()`-paired, with `aria-invalid`/`aria-describedby` wiring the error text too |
| The menu search box had no accessible name | Medium (a11y) | ✅ fixed | Placeholder only, which vanishes on first keystroke. Added a visually-hidden label; design unchanged |
| Searching the menu for something absent rendered a blank page | Medium (UX) | ✅ fixed | Every category returned `null` and the only thing left on screen was the restaurant's name — it read as a crash. Now a proper empty state with a "Clear search" action, plus a polite live region announcing the result count |
| Category headings used a hard-coded sticky offset | Low (UI) | ✅ fixed | `top-[108px]`, against the repo's own rule that sticky offsets use `--app-header-h`. The header includes `env(safe-area-inset-top)`, so on a notched phone the category bar overlapped the search field and at larger text sizes it floated below it. Now measured with a `ResizeObserver` |
| The platform tenant card was mouse-only | Medium (a11y) | ✅ fixed | A `div` with an `onClick` was the **only** route into a tenant's detail page, so that screen was unreachable by keyboard (WCAG 2.1.1). Now a real `button` |
| The provisioning modal was not a dialog | Medium (a11y) | ✅ fixed | No `role="dialog"`, no `aria-modal`, no accessible name, no Escape, no initial focus, no focus restoration. All added |
| Admin tables overflowed on a phone | Low (responsive) | ✅ fixed | `Card` had `overflow-hidden` around a 4-column table with up to five action buttons, so Rotate Tag was simply unreachable on a small screen. Now `overflow-x-auto` with a `min-w`, matching what the platform audit table already did |
| `<meta name="color-scheme" content="dark">` while shipping a light theme | Low (UI) | ✅ fixed | Native scrollbars, select and date popups, form-control defaults and the pre-paint background all rendered dark on a light page. Now `dark light`, with per-scheme `theme-color` |
| **All of Zod shipped to every customer's phone** | Medium (performance) | ✅ fixed | The web app imported `OrderStatus`, `formatHalalas`, `Role` and `allowedNextStatuses` through the `@rw/shared` **barrel**, which re-exports `schemas/*` — and those import Zod. The result was a **72.5 kB / 19.8 kB gzipped** chunk loaded on the customer menu path to read enum constants, against a stated customer budget of 60 kB gzipped. Nothing in the browser validates with Zod; it is a server concern. Added `./enums`, `./money` and `./orderState` subpath exports and pointed the 10 web imports at them. That chunk is **gone** — replaced by three chunks totalling ~1 kB gzipped, and `grep` confirms no Zod in any bundle. **~18.8 kB gzipped off first load** |

| Credential-bearing responses were cacheable | Medium | ✅ fixed | **A table URL *is* the credential** — anyone holding `/t/<token>` can order at that table. `GET /app/tables` returns one for every table in the restaurant and `GET /app/tables/export` returns the same set as a file, and **neither set any `Cache-Control` at all**, so a shared proxy or the browser's heuristic cache was free to keep a copy. Only the QR route had the header. Separately, all three platform routes that hand back a **one-time password** (tenant creation, owner reset, staff creation) set no cache header either, while their equivalents in `staff.routes.ts` always have. Both routers now set it at router level, so a route added later cannot omit it |
| `TRUST_PROXY_HOPS` had to be measured by hand | Low | ✅ fixed | The value is a property of the deployment and cannot be known from code — but it can be *observed*, and telling an operator to patch in a `console.log` is a poor substitute. The first production request now logs the observed forwarded-chain depth, the configured value, and whether they agree. **Only the entry count is logged, never an address** — raw IPs are hashed everywhere else under PDPL and a diagnostic is not a reason to make an exception |
| Dashboard "Staff Online" counted disabled accounts | Low | ✅ fixed | Two things wrong. It counted every user row, and **disabling is how this product removes someone from a team** — so the number climbed with every departure and never fell. It was also labelled "Staff Online" while nothing tracks presence. Now counts `status: ACTIVE` and is labelled "Active Staff". A dashboard figure that claims more than it measures is worse than no figure, because someone will make a staffing decision on it |
| Three `<select>` labels named nothing | Medium (a11y) | ✅ fixed | The same defect found in the `Input` component, in three more places — Type and Parent Brand in the provisioning modal, Role in the tenant staff modal. Sibling `<label>` elements with no `htmlFor`, so screen readers announced an unnamed combo box. `MenuItemEditor` was already correct because `Field` wraps its children |
| Two orphaned components left by the redesign | Low | ✅ removed | `StaffChrome.tsx` was imported by **nothing**, and `AdminShell`'s default export — a second header, sign-out and tab bar — by nothing either; both were superseded by `StaffLayout`. Not harmless: each carried its own copy of the sign-out flow and its own hard-coded route list, so they were a second, unreachable, silently drifting definition of how staff navigation works. `AdminShell`'s *named* helpers are still used by four screens and are untouched |

### Open

| Bug | Severity | Status | Notes |
|---|---|---|---|
| A cashier could open `/admin/*` in the browser | Medium | ✅ **fixed 2026-08-12** | The client route guard checked only platform-versus-restaurant; the per-surface guards from Step 7b were lost in the redesign, so typing `/admin/menu` rendered the admin interface to any signed-in staff member. **Nothing leaked** — every admin route is `requireRestaurantAdmin` and returned 403, which is why the screen was empty. Fixed with a single `mayVisit()` table in `lib/roles.ts` consulted by both the route guard and the sidebar, so a link can never appear for a surface the guard refuses. The sidebar was also offering Kitchen Display to cashiers. New `tests/security/admin-surface.test.ts` walks all 19 admin endpoints as cashier, kitchen and platform admin |
| Kitchen staff cannot edit stock | Medium | **open — needs a product decision** | The request on 2026-08-12 was "editable by admin **or kitchen staff**", but the chosen location was the admin item editor, which lives behind `/admin` and kitchen roles cannot reach. So today only OWNER and MANAGER can set a portion count. The fix is small and in two parts: add `Role.KITCHEN` to the item-update route (or a narrower stock-only route, which is safer — the full editor also changes prices), and give the kitchen surface a screen that reaches it. `stock-security.test.ts` pins the current behaviour with a test named for this gap, so flipping it is deliberate |

---

## 17. Known Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **`TRUST_PROXY_HOPS` still needs one confirming look at the logs** | Low | Defaults to the previous hard-coded `1`; production probably needs **2**, because `vercel.json` rewrites `/api` onward to Render. **The server now diagnoses this itself** — the first production request logs `proxy depth looks like N, but TRUST_PROXY_HOPS is M` when they disagree. **Action: read that one log line after the next deploy and set the variable if it disagrees.** Until then, IP rate limiting may be keyed on a proxy address rather than the customer, which collapses every limit into one shared bucket |
| Rate limiting is per-process, in memory | Medium | Correct on one instance, wrong the moment there are two — each would count separately. Redis is the Phase 2 answer; until then do not scale the API horizontally |
| The audit environment could not run the DB-backed suites | Medium | `fastdl.mongodb.org` is blocked by egress policy, so `mongodb-memory-server` cannot fetch `mongod`. The 202 security tests and 68 other DB tests were **not** executed on 2026-08-15. GitHub CI runs them on every push and remains the gate — check it is green before merging that work |
| Tenant isolation regression as code grows | **Critical** | 4 defence layers + CI-blocking security suite |
| Render free tier sleeps; cold start is tens of seconds | **High at pilot** | must move to a paid always-on tier before a real restaurant goes live |
| Atlas M0 has no automated backups | **High at pilot** | paid tier before pilot **and** nightly `mongodump` to R2, with a tested restore |
| Payment merchant onboarding (CR + bank) lead time | High | start the application early; build against sandbox meanwhile |
| KSA SMS sender-ID registration lead time | Medium | apply early; console driver behind the `SmsProvider` interface for dev |
| Arabic RTL bugs found late | Medium | build RTL from the first component |
| Restaurants resist adopting another system | **High (commercial)** | validate the "keep your POS" pitch in sales calls before building Phase 3 |
| Customers ignore self-ordering | High (commercial) | measure taps → sessions → orders at the pilot |
| Custom requests destroy margin | Medium | feature flags; refuse bespoke code in Phase 1 |
| Support cost exceeds subscription | Medium | track support hours per restaurant from restaurant #1 |

---

## 18. Tests

Last run: **2026-08-12 — 270 API + 43 shared passed, 0 failed.** Security suite: **202 across 10
files.**

```
@rw/shared  money + VAT maths        19 passed   (float-drift, rounding, VAT reconciliation)
@rw/shared  menu schema contract     12 passed   (NEW 2026-08-12 — the payloads the admin item
                                                  editor builds, and the modifier rules its
                                                  form mirrors)
@rw/api     environment validation   11 passed   (defaults, production hardening rules)
@rw/api     app / http surface       13 passed   (health, headers, CORS, errors, request IDs)
@rw/api     database harness          3 passed   (in-memory mongod, sanitizeFilter on)
@rw/api     SECURITY admin surface    7 passed   (NEW 2026-08-12 — all 19 admin endpoints
                                                  walked as cashier, kitchen and platform admin)
@rw/api     SECURITY stock           16 passed   (NEW 2026-08-12 — the count never reaches a
                                                  customer, the last portion cannot sell twice,
                                                  cancel restocks, COMPLETED does not)
@rw/api     cloudinary adapter       10 passed   (NEW 2026-08-12 — signed folder scoping, the
                                                  API secret never reaching the browser, and the
                                                  round trip: a delivered URL passes isOwnedUrl)
@rw/api     authentication           20 passed   (login, lockout, rotation, reuse, revocation)
@rw/api     change password           7 passed   (current-password required, full revocation)
@rw/api     SECURITY tenant isolation 16 passed  (Sec-01/02/03/05/06 + all three guard layers)
@rw/api     SECURITY rbac + audit      9 passed  (Sec-07, Sec-08, append-only audit)
@rw/api     SECURITY platform admin   18 passed  (cross-tenant boundary, provisioning, suspension)
@rw/api     SECURITY table + token    27 passed  (Tbl-01..05, session forgery, QR/CSV, crypto)
@rw/api     SECURITY menu             27 passed  (Sec-01 on the real model, RBAC, image URLs)
@rw/api     SECURITY orders           40 passed  (Sec-04/06/09, Ord-01..05, Cash-01..03, races,
                                                  + the idempotency index itself)
@rw/api     SECURITY dashboard+chain  25 passed  (NEW 2026-08-11 — stats tenant scoping, the
                                                  sanitizeFilter regression, business-day
                                                  boundary, BRANCH vs CHAIN_MAIN vs sibling
                                                  isolation, one-level hierarchy, the
                                                  PLATFORM_ADMIN role guard, dashboard RBAC,
                                                  staff disable + session revocation + re-enable)
@rw/shared  order state machine       12 passed  (terminal freeze, role table, illegal moves)
```

Mandatory tenant-isolation matrix from the brief:

| # | Requirement | Status |
|---|---|---|
| 1 | Restaurant A cannot read B's menu | **passing** on the real `MenuItem` model |
| 2 | Restaurant A cannot read B's order | **passing** on the real `Order` model |
| 3 | Restaurant A cannot access B's users | **passing** |
| 4 | Table 15 cannot order against Table 14 | **passing** — a `tableId` in the body is ignored; table 15 also cannot read table 14's orders |
| 5 | Changing restaurant ID in a request fails | **passing** |
| 6 | Changing order ID across tenants fails | **passing** — 404 on read, transition and confirm-cash |
| 7 | Cashier cannot access admin functionality | **passing** |
| 8 | Kitchen user cannot modify payment | **passing** at both middleware and state-machine level |
| 9 | Customer cannot mark their own order paid | **passing** — no such route exists; a session token gets 401 on staff routes |
| 10 | Duplicate payment webhook cannot double-pay | Phase 2 (the idempotency machinery it will use is built and tested) |

**All nine Phase 1 rows pass. Row 10 belongs to Phase 2.**

```
Unit tests:                Passing
Integration tests:         Passing
Tenant isolation suite:    Passing — 134 tests, separate CI step, CI-blocking
Table security tests:      Passing — Tbl-01..05 complete
Order/state-machine tests: Passing — Ord-01..05, Cash-01..03, concurrency races
Payment webhook tests:     Phase 2
OTP tests:                 Phase 2
Integration adapter tests: Phase 3
Load tests (100/500/1000): Phase 4
External penetration test: Phase 4
Index review:              Passing — `npm run indexes:check`, 17 shapes, all indexed
```

**Index review (2026-08-09).** All 17 real query shapes checked with `explain('executionStats')`.
Sixteen use an index; the seventeenth is the platform restaurant list, where a collection scan is
correct because there will never be enough rows to matter.

Two real problems were found and fixed:

| Shape | Was | Now |
|---|---|---|
| Customer menu | `SORT → FETCH → IXSCAN` — a blocking in-memory sort on the hottest query in the product | `sortOrder` added to the index; the sort is served from it |
| Customer order status | Used `restaurantId + createdAt`, walking the restaurant's whole order history to find one session's orders | Compound `restaurantId + tableSessionId + createdAt` |

Two now-redundant indexes were dropped by `npm run indexes:sync`.

⚠️ Collections are small in development, so a plan choice here is indicative, not proof.
**Re-run `indexes:check` against pilot volume before launch.**

Notable checks already in place: VAT splitting reconciles exactly (`net + vat === gross`) across
every price from 0 to 50.00 SAR; production env validation rejects a missing database URI, a
short JWT secret, a wildcard CORS origin, and a plaintext `http` app URL; all four login failure
modes return byte-identical bodies; an `alg:none` JWT and a tampered signature are both rejected;
cross-tenant `findById` and "record does not exist" return identical results.

Failed tests are always recorded here, never hidden.

---

## 19. Deployment

```
Frontend:   Vercel or Cloudflare Pages — not created
Backend:    Render — not created
Database:   MongoDB Atlas — not created
Redis:      Upstash — Phase 2
Storage:    Cloudflare R2 — not created
Domain:     Not chosen
CI:         GitHub Actions — workflow written (.github/workflows/ci.yml), not yet running
            (needs a GitHub remote). Jobs: typecheck → lint → build → test, plus a
            secret-scan job that fails the build if any .env file is ever committed.
Local:      `npm run dev` works with no external service. API on :4000.
Production: NOT DEPLOYED
```

Environments: Local → Staging → Pilot production → Scaled production.

**Pilot prerequisites (blocking, do not launch without them):** paid always-on backend tier;
database backups configured **and a restore actually tested**; security suite green;
`docs/RUNBOOK.md` written.

**RPO/RTO proposal:** RPO ≤ 24 h in Phase 1, ≤ 1 h at pilot. RTO ≤ 4 h.

---

## 20. Infrastructure & Costs

| Service | Plan now | Cost now | Upgrade trigger | Next tier |
|---|---|---|---|---|
| GitHub | Free | 0 | private repos + Actions are free at this size | — |
| MongoDB Atlas | Free M0 | 0 | **backups required** or >512 MB or sustained load | paid tier — verify current price at purchase |
| Render | Free | 0 | **cold starts unacceptable at pilot** | Starter, ~$7/mo — verify before buying |
| Vercel / CF Pages | Free | 0 | bandwidth or team seats | — |
| Cloudflare R2 | Free tier | 0 | storage beyond the free allowance | usage-based, very low |
| Upstash Redis | Free (Phase 2) | 0 | daily command cap | low-cost tier |
| Moyasar | Sandbox | 0 | going live | per-transaction — **verify current rate at moyasar.com before signing** |
| SMS | Sandbox | 0 | going live | per-message — quote before signing |

**Estimated development cost through Phase 1: 0 SAR.** Everything runs on free tiers or locally.

Prices above are indicative and must be re-verified against the provider before any purchase —
vendor pricing changes and I will not present remembered figures as current fact.

Cost-control rule: **FREE → LOW-COST → MEASURE → IDENTIFY LIMIT → UPGRADE ONLY WHEN JUSTIFIED.**
Set billing alerts on every account that supports them.

---

## 21. Integrations

| Integration | Environment | Status | Next step |
|---|---|---|---|
| Payment (Mada/card) | — | **Provider chosen: Moyasar** | Phase 2: owner creates a Moyasar sandbox account; live account needs CR + bank account |
| SMS / OTP | — | Not started | Phase 2; owner picks a provider + sender ID |
| Qoyod | — | Planned | Phase 3, only if a pilot customer uses it |
| Foodics | — | Planned | Phase 3, only if a pilot customer uses it |
| E-invoicing / ZATCA | — | Planned | Phase 3, via a compliant provider — no certification claimed |

---

## 22. Future Work (do not build yet)

### TODO before real production (not before)

| Item | Why deferred | Trigger |
|---|---|---|
| **Move image storage from Cloudinary to Cloudflare R2** | Cloudinary's free tier is fine for development and demo. R2 charges no egress, which is what matters once real customers load menu images all day — that is the bill that surprises people. The `ImageProvider` interface exists precisely so this is one new adapter file, not a rewrite. | First paying restaurant, or measured image bandwidth |
| Arabic UI + RTL layout | Owner decision 2026-08-09: English-first. Schema is already bilingual, so no migration — only the UI layer changes. | Before a real Saudi restaurant's customers use it |
| Paid always-on backend tier | Free tier sleeps; cold start is tens of seconds | Pilot launch |
| Database backups + a tested restore | Atlas free tier has none | Pilot launch |
| Rotate the Atlas password | Exposed 2026-08-09, dev-only cluster | Before production |
| `IP_HASH_SALT` set | Audit logs currently store no IP hash rather than a weak one | Production (env validation enforces it) |

**Demo production also runs entirely on free tiers** — product-owner decision, 2026-08-09.

### Built as a placeholder — the seam exists, the feature does not

Found during the 2026-08-15 audit. Each of these is **deliberately incomplete**, not broken. They
are listed so nobody mistakes a stub for a bug, or ships assuming they work.

| Placeholder | What exists today | What is missing | Phase |
|---|---|---|---|
| **Card payment** | `PaymentMethod.CARD` in the enum; `PaymentStatus.FAILED`/`REFUNDED` reserved; `initialStatusFor()` throws `"Card payment is not available yet. Please choose cash."` | The provider, the hosted redirect, and the signature-verified webhook. Accepting a card order before a webhook can confirm it would mean trusting the browser, which the rules forbid | **2** |
| **Order expiry** | `OrderStatus.EXPIRED` is a terminal state, `SYSTEM` is authorised to move orders into it, and it restocks correctly | **Nothing ever produces it.** No scheduler exists, so an unpaid `CASH_PENDING` order sits on the cashier board indefinitely. Needs a decision about *where* a job runs — Render's free tier has no cron | 2 (needs an architecture decision) |
| **Customer order history** | `GET /public/orders` is built, tenant- and session-scoped, and tested; `fetchMyOrders()` is written in the client | No screen calls it. After placing a second order the first is unreachable except by browser back | 1.5 — small, but it is a new customer screen |
| **Image deletion / retention** | `ImageProvider.deleteImage()` is on the interface and called nowhere that matters | Cloudinary's implementation deliberately logs and returns. A half-written delete that removes the wrong asset costs more than an orphaned file on a free tier | Before R2 |
| **Cloudflare R2 image storage** | The whole `ImageProvider` seam exists so this is one new adapter file | The adapter. Cloudinary is the dev/demo choice; R2 charges no egress, which is the bill that matters once customers load menu images all day | Before production (§22) |
| **Redis rate limiting** | `middleware/rateLimit.ts` is correct for exactly one instance | A shared store. **Do not scale the API horizontally before this** — each instance would count separately and the limits would silently multiply | **2** |
| **OTP / phone verification** | `customerPhone` is validated as a Saudi mobile on the order schema and stored | Nothing sends or checks a code. The client never populates the field | **2** |
| **Takeaway and pickup** | `OrderType.TAKEAWAY` / `PICKUP` in the enum; `settings.orderTypes` defaults to `[DINE_IN]` | Every flow assumes a table session, which is what proves *where* the customer is | **2** |
| **Arabic / RTL** | Every user-visible string is bilingual in the schema and the editors capture `ar`; the frontend uses logical properties throughout so this is not a rewrite | The UI layer only ever renders `.en` | **2** (§22) |
| **POS / accounting integration** | Nothing. The commercial pitch depends on it | Foodics / Qoyod adapters | **3** |

### Missing outright — not a placeholder, no seam exists

| Gap | Impact | Why it is not being built here |
|---|---|---|
| ~~A restaurant cannot change its own settings~~ | ✅ **built 2026-08-15** — `/app/restaurant` (owner) and `/platform/restaurants/:id/finance` (platform). The owner/platform split was a product-owner decision, recorded in §14 | — |
| **Kitchen staff cannot edit stock** | Recorded separately in §16 as an open product decision from 2026-08-12 | Same reason — the requested behaviour and the built location disagree |

---

### Later phases / not scheduled

Native mobile app · waiter app · loyalty · coupons · customer accounts · advanced analytics ·
inventory · reservations · delivery integrations · kitchen display hardware · multi-branch ·
AI recommendations · demand forecasting · ERP integrations · enterprise SSO · advanced SLA.

---

## 23. Do Not Change Without Approval

- Do not convert to microservices.
- Do not build full accounting software.
- Do not store raw card data, ever.
- Do not remove or weaken tenant isolation, in any layer.
- Do not expose table or restaurant IDs as public authorisation credentials.
- Do not accept `restaurantId` or `tableId` from a client request body.
- Do not trust a frontend-reported payment status.
- Do not allow arbitrary order status transitions.
- Do not change money storage away from integer halalas.
- Do not commit secrets, or add a `.env` file to git.
- Do not claim ZATCA certification.
- Do not buy premium infrastructure without a measured, stated reason.
- Do not hard-code pricing into the application.

---

## 24. Last Session Summary

```
Date:      2026-08-15
Session:   Step 9c — security/a11y/performance audit, then the settings API
```

**Step 10 — restaurant settings API (built after the audit, on an explicit decision).**
The audit surfaced that a restaurant could not change anything about itself: VAT rate, service
charge, payment policy, logo and address were read by pricing and ordering but only ever written
as schema defaults at creation, and no `/app/restaurant` router existed. Because that decides
pricing behaviour, it was put to the product owner rather than built on assumption. The answers
became the design:

- **VAT is platform-only.** In KSA the rate is ZATCA's, not a restaurant's. `pricesIncludeVat`
  went the same way for the same reason — it is a silent boolean that moves every bill by the
  whole VAT rate. `PATCH /platform/restaurants/:id/finance` is new and is the *only* route that
  can set a rate; without it "platform-only" would have meant nobody, ever, since nothing in the
  codebase could previously change it at all.
- **Service charge is the owner's, capped at 15%.** The column allows 100, which would double a
  bill on one keystroke. The cap lives in the shared schema, not the form.
- **Two schemas, never one with a flag.** `updateRestaurantSettingsSchema` (owner) and
  `updateRestaurantFinanceSchema` (platform) cannot be confused at a call site, and Zod strips
  anything not in the one being used — so an owner posting `vatRatePercent` gets a 200 and no
  change, not a 403 arms race.
- **The route is `/app/restaurant`** — singular, no id. The tenant comes from the token, so there
  is nothing to tamper with.

Four new audit actions, of which three are deliberate: `RESTAURANT_VAT_CHANGED` and
`RESTAURANT_SERVICE_CHARGE_CHANGED` carry before/after values because they are money, and
`RESTAURANT_PAYMENT_POLICY_CHANGED` records who decided the kitchen may cook before the cash is
confirmed. The owner-facing screen at `/admin/settings` shows the VAT rate read-only with the
reason, and frames the payment policy as two named outcomes rather than a switch.

**29 new schema tests run everywhere** (they need no database) and cover the split, the caps,
and operator-shaped payloads. A 21-test API suite covers isolation, RBAC and the audit trail, and
`admin-surface.test.ts` gained the two new routes — those need Mongo, so **CI is where they first
execute.**

---

### Previous work this session

```
Date:      2026-08-15
Session:   Step 9c — full security, accessibility, performance and UX audit
```

**The cores held.** Tenant isolation (4 layers), the table-token exchange and its identical-404
discipline, server-side pricing from the database, the order state machine's conditional
`findOneAndUpdate`, refresh-token rotation with reuse detection, and audit-log immutability were
each traced from untrusted input to privileged action. No path was found through any of them. All
21 findings below are at the edges.

**The two that mattered most.** `resetOwnerPassword` changed a platform-reset owner's password
without revoking anything — so the attacker whose compromise prompted the reset kept a working
access token and a **30-day** refresh token. It now calls `revokeAllSessions()` like its
counterpart in `staff.service.ts` always has. And the deployed web origin served **no security
headers at all**: `vercel.json` had rewrites and nothing else, helmet only ever covered the API
host, so every staff and platform screen was framable next to one-click destructive actions.
`vercel.json` now carries a CSP scoped to what the app genuinely loads, plus HSTS, nosniff,
no-referrer, Permissions-Policy and COOP.

**One bug was the same bug twice.** "Export CSV" on `/admin/tables` was a plain `<a href>` to an
authenticated endpoint — byte for byte the mistake fixed for the QR `<img src>` on 2026-08-12,
in a second place, with the same cause: the staff token is a module variable by design, so the
browser has nothing to attach. Both now go through the authenticated client and an object URL.

**The performance finding was the whole of Zod.** Importing `OrderStatus` and `formatHalalas`
through the `@rw/shared` barrel dragged `schemas/*` — and therefore Zod — into a **19.8 kB
gzipped** chunk on the customer menu path, to read enum constants, against a stated 60 kB
customer budget. Subpath exports (`@rw/shared/enums`, `/money`, `/orderState`) removed it
entirely: that chunk is replaced by ~1 kB gzipped and no bundle contains Zod.

**Verification is partial and it matters.** `fastdl.mongodb.org` is blocked by this environment's
egress policy, so `mongodb-memory-server` cannot fetch a `mongod` binary and **all 10 DB-backed
suites abort at setup** — the 202 security tests did not run here. Typecheck, lint, build, the 43
shared tests and 44 DB-free API tests are green, and 12 new `csvExport` tests plus 7 new
`TRUST_PROXY_HOPS` tests cover the two backend fixes in a form that needs no database. **Check
GitHub CI is green before merging.**

**Second pass, same day.** Six more fixes after a sweep for anything else fixable without a
product decision: credential-bearing responses (every table URL, every one-time password) were
served with **no cache headers at all** — now `no-store` at router level on both routers, so a
new route cannot omit it; `TRUST_PROXY_HOPS` now diagnoses itself in the logs instead of asking
an operator to measure by hand; the dashboard's "Staff Online" counted disabled accounts and
measured no such thing; three more `<select>` labels named nothing; and two orphaned components
from the redesign — `StaffChrome` and `AdminShell`'s default export, each carrying its own stale
copy of the sign-out flow — were removed.

**What is deliberately still a stub is now written down.** §22 gained two new tables: ten
placeholders where the seam exists but the feature does not (card payment, order expiry, customer
order history, image deletion, R2, Redis, OTP, takeaway, Arabic, POS), and two gaps where no seam
exists at all. The important one: **a restaurant cannot change its own settings** — VAT rate,
service charge and `kitchenStartsBeforePayment` are read everywhere but only ever written as
defaults at creation, and there is no `/app/restaurant` router. That decides pricing behaviour,
so it is the product owner's call, not an agent's.

Full finding list with severities in §16; placeholders and gaps in §22; the one remaining
`TRUST_PROXY_HOPS` action in §17.

---

### Previous session

```
Date:      2026-08-12
Session:   Step 9b — close the two items left open, on the product owner's instruction
```

**Removing a staff member is now a disable.** The platform hard delete was wrong in two ways at
once: every audit entry stores an `actorUserId`, so deleting the account turned that person's
whole history into a dangling id; and the delete left their refresh tokens live, so the row
disappeared while the sessions did not. It now routes through the same
`revokeAllSessions()` the rest of the product uses — `tokenVersion` bumped, every refresh token
revoked — and the account survives in a `DISABLED` state. Proven by signing a cashier in, having
the platform admin remove them, and asserting the live access token 401s, the refresh cookie
401s, the row still exists, and the audit event's `targetId` still resolves to a real user.
The route returns 200 with the updated user instead of 204; the UI's "Remove" button is now
"Disable", with an "Enable" button for disabled accounts. `AuditAction.STAFF_DELETED` is retired
but kept in the map, because an append-only log may still hold historic rows carrying it.

**The idempotency index now says what it means.** `{restaurantId, idempotencyKey}` was
`sparse: true`, which on a *compound* index skips a document only when every indexed field is
absent — and `restaurantId` never is. A key-less order therefore indexed as `null` and the second
one collided; this was **observed for real** while writing the dashboard tests
(`E11000 … dup key: { restaurantId: …, idempotencyKey: null }`). Replaced with
`partialFilterExpression: { idempotencyKey: { $type: 'string' } }`. Three tests pin the three
cases: two key-less orders coexist, two orders sharing a key in one restaurant still collide, and
two restaurants may use the same key independently. **`indexes:sync` must be run against existing
databases** — see §6.

**Found while in there:** `updateRestaurantStaff` wrote `STAFF_ROLE_CHANGED` on any edit,
including a name-only one. Now conditional on the role actually moving, and it records `from`/`to`
like its `/app/staff` counterpart.

**Checked and found already correct:** `middleware/auth.ts` reads the role from the database, not
from the token claim, so a role change takes effect on the next request without revocation. No
change needed.

**Then two bugs reported from the browser, both of which made a shipped feature useless.**

The **QR code never rendered**. `<img src>` cannot authenticate — no `Authorization` header, and
the staff token is in memory by design rather than in a cookie — so the request was anonymous and
the route answered 401. Fixed by fetching the PNG through the authenticated client and rendering
an object URL, revoked on close. Verified in a real browser: the request is now `200 OK` and the
`<img>` reports `naturalWidth: 512`.

**Every table URL pointed at a dead port.** `PUBLIC_APP_URL` defaulted to 5173, Vite's default,
while `vite.config.ts` pins the dev server to **5174** — so scanning a tag gave `ERR_FAILED`. The
wrong port was in four files. Fixed in all of them, and the whole chain re-verified in the
browser: sign in → `/admin/tables` → QR 200 → open the tag URL → lands on `/menu` for Malabar
Spice with all 16 items. Both lessons are now in CLAUDE.md's frontend conventions, because both
are the kind of mistake that looks like a broken image rather than a broken rule.

**Then the menu item editor** (§4, Step 9c). Trying to enter a real menu exposed that
`/admin/menu` captured four fields and nothing else — no modifier groups, no allergens, no
Arabic. The API had accepted all of it since Step 5; only the interface was missing, and the
demo's working choices existed solely because `seedDemo.ts` wrote them straight to the database.
An owner could not have built the demo menu through the product.

Two things shaped the form. Modifier **keys are generated once and never rewritten on rename**,
because the key is what a customer's cart and an order's snapshot refer to. And an **Arabic-only
description is dropped rather than sent**, because `description.en` is required whenever
`description` is present — a 422 would be the only clue otherwise. Both are pinned by the new
schema tests.

**Verification** — `typecheck`, `lint`, `build` clean. 233 API + 43 shared tests, 0 failing.
Security suite 175, green. **Not verified in a browser**, by standing instruction: the product
owner runs the servers.

---

### Previous session

```
Date:      2026-08-11
Session:   Step 9 — repair the build after an untracked redesign, then reconcile the docs
```

**The starting position.** `typecheck` and `lint` both failed; tests passed. Work had landed
outside a tracked session: a replacement design system, a `/dashboard` surface and API module,
and `Restaurant.type` / `parentId` for chains and branches.

**Root cause of the TypeScript errors was a stale build, not the code.** `apps/api` imports
`@rw/shared` from `dist`, so the new `type` and `parentId` fields were invisible to the compiler.
`npm run build --workspace @rw/shared` cleared **every** reported API error at once. Only three
unused-symbol errors in `apps/web` were real.

**Three defects found while fixing lint, all detailed in §16.** The one that matters most:

- **The dashboard always reported zero.** `{ placedAt: { $gte: … } }` was not wrapped in
  `mongoose.trusted()`, so the global `sanitizeFilter` rewrote it to `{ $eq: { $gte: … } }` and it
  matched nothing. Proven by reverting the fix and watching the new test fail. **This is exactly
  the bug found and fixed in Step 6**, which is the argument for the convention rather than
  against it.
- **`PLATFORM_ADMIN` could be written onto a tenant user.** The `User` model blocks a platform
  admin with a `restaurantId` — but in a `pre('validate')` document hook, which does not run on
  `findOneAndUpdate`. The new platform staff route validated against the full `Role` enum, so the
  update path could produce the exact malformed account the hook exists to prevent. Now validated
  against `TENANT_ROLES`.
- **`seedDemo.ts` had been rewritten against the raw MongoDB driver** — wrong collections, string
  ids, SHA-256 passwords, tables with no token — and had stopped exporting `seedDemoData()`, which
  `dev-standalone.mts` imports. `npm run dev:standalone` was broken. Restored over the Mongoose
  models and verified end to end: staff login returns a session, and a seeded table token
  exchanges for a table session.

**Chain/branch isolation was audited and is sound.** A branch is an ordinary tenant; `parentId` is
never used to widen a query, and `core/tenant.ts` has no hierarchy logic. Twenty new security
tests pin that, including chain→branch, branch→chain and sibling→sibling. See §11.

**Docs.** `DESIGN.md` was rewritten from `apps/web/src` — the openwork/Al-Qatt system it described
no longer exists. It now records the glassmorphic system that is actually there, the two-accent
inconsistency (emerald in dark, **indigo** in light), the Google-Fonts dependency, measured bundle
sizes, and the eight previously approved rules the new system reverses. **Those eight are open
questions for the product owner, not agent decisions** — CLAUDE.md's Frontend section still
carries the old rules and now disagrees with the code.

**Removed:** four ad-hoc debug scripts at `apps/api/` root (`testApi.ts`, `testAudit.ts`,
`testStats.ts`, `testUsers.ts`), on the product owner's instruction. They connected straight to
the real database, bypassed tenant scoping, and one minted an OWNER access token.

**Verification** — `typecheck`, `lint`, `build` clean. 233 API tests + 31 shared, 0 failing.
Security suite 175, green.

**Next action** — see §6.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 8 — hardening. Phase 1 is functionally complete.
```

**Index review — the part that found real problems.** Built `scripts/check-indexes.mts`, which
runs `explain('executionStats')` against all 17 query shapes the application actually issues, and
`scripts/sync-indexes.mts`, which creates declared indexes and drops redundant ones (and refuses
to run in production, where index changes belong in a reviewed deployment step).

Two genuine findings, both on customer-facing hot paths:
1. **The customer menu was doing an in-memory sort.** The index stopped at `isAvailable`, so
   `sortOrder` could not be served from it and the planner had to collect and sort every matching
   row. This is the single hottest query in the product. Adding `sortOrder` to the index removed
   the blocking stage.
2. **The customer order-status query used the wrong index.** With only a single-field
   `tableSessionId` index available, the planner preferred `restaurantId + createdAt` because that
   also served the sort, which means walking a restaurant's entire order history to find one
   session's two orders. Replaced with a compound index that serves filter and sort together.

Neither would have shown up in testing. Both would have appeared as a slow menu on a busy night.

**`docs/THREAT_MODEL.md`** — 22 threats, each with the file the control lives in, the test that
would fail if it were removed, and the residual risk stated plainly. Several residuals are real
and unfixable (a photographed QR code, a token stolen from memory within 15 minutes); saying so
is better than implying they are solved.

**Forced password change** — `/staff/password`. Someone provisioned by an admin can now sign in
and nothing else until they replace the temporary password. Verified end to end: sign-in redirects
there, an attempt to navigate to the till bounces back, changing it revokes every session, the old
password returns 401 and the new one works.

**Tests** — 205 API tests, 147 in the security suite. Typecheck, lint and build clean.

**Left undone, and why** — the menu image upload interface. The API endpoint, the Cloudinary
adapter and the URL-ownership validation are built and tested, but the browser upload form cannot
be verified end to end without credentials, and shipping an unverifiable form is worse than
saying it is not done.

**Next action** — see §6: either close the image upload item, get a pilot ready, or start Phase 2.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 7c — admin surfaces. All five surfaces now exist.
```

**Gap found and closed first:** `/app/staff` did not exist. The platform creates a restaurant's
first owner, but that owner had no way to create a cashier or a kitchen account, so Phase 1 was
not actually complete. Built the module before the UI that needs it.

**Privilege rules in the staff module**, each one a real escalation path:
- Nobody can create a `PLATFORM_ADMIN` — that role has no tenant and would hand over the platform.
- A `MANAGER` cannot create or modify an `OWNER` or another `MANAGER`, so the least privileged
  person who can manage staff cannot promote themselves.
- Nobody can change their own role or disable themselves; the second locks a restaurant out of
  its own account.
- Disabling revokes sessions immediately; a password reset issues a new one-time password and
  kills every existing session. We never see or store a real password.

**Completed** — the staff module and 13 tests, `/admin/menu`, `/admin/tables`, `/admin/staff`,
`/platform`, and `lib/roles.ts` so the login screen and the route guards cannot disagree.

**Verified in a browser against Atlas:**
- Owner signs in → till, with an Admin link; admin tabs load the four seeded categories.
- Tables screen lists 4 tables, the QR image loads from the real endpoint, the NFC URL is shown.
- Staff screen lists the team, marks "you", and **disables the self-disable button with an
  explanation** rather than letting the server reject it.
- Creating a waiter through the UI showed a 24-character one-time password with the
  "cannot be shown again" warning, and the account persisted.
- Inline price edit 32.00 → 19.99 → back to 32.00, stored as exactly `3200` halalas, integer.
- An owner opening `/platform` is redirected to their own home; the console never renders.

**Known gaps, deliberately not built yet** — a `mustChangePassword` screen (someone created
through admin can sign in but cannot change their password in the UI), and the menu image upload
interface (the API and the Cloudinary adapter are both ready). Both listed in §6.

**Bundle:** entry 105.5 KB gzipped. Every admin screen is code-split at under 2 KB gzipped, so a
customer's phone downloads none of them.

**Next action** — Step 8: index review with `explain()`, the threat model document, and a final
security-suite pass.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 7b — kitchen + cashier, running on MongoDB Atlas
```

**Completed** — staff auth client (kept separate from the customer one so neither token can be
sent by the wrong surface), `/staff/login`, the dark `/kitchen` wall screen, the light
`/cashier` till, and role-aware route guards.

**Verified against Atlas in a real browser:**
- Kitchen ticket appeared **through the 5 s poll with no reload**.
- An unpaid order stayed **off** the kitchen board — the cook-after-payment default holding.
- Full kitchen walk: red "New" → ochre "Accepted" → ochre "Cooking" → green "Ready", with the
  action button correctly **disappearing at READY** because the kitchen role has no allowed next
  status. The UI reads `allowedNextStatuses` from `@rw/shared`, the same table the server enforces.
- Till: 3 × Hummus priced at 48.00 SAR, grouped into "Take payment" / "Ready to hand over" /
  "In the kitchen".
- A kitchen user hard-loading `/cashier` is redirected to `/kitchen`; "Cash received" never renders.

**Problems found and fixed**
1. **A redirect loop.** Restricting `/cashier` to non-kitchen roles while the rejection fallback
   pointed *at* `/cashier` would have bounced a kitchen user forever. Fallback is now role-aware,
   with an explicit "no screen for this account" terminal state.
2. **Plaster showing behind the dark kitchen screen** on overscroll, because `.surface-kiln` was
   on a div and `body` kept its light ground. Fixed with `body:has(.surface-kiln)`.

**Security note raised to the product owner:** the Atlas cluster is now open to `0.0.0.0/0`
while its password was exposed in an earlier session transcript. Dev data only today, but the
password should be rotated or the allowlist narrowed before anything real is stored.

**Bundle:** entry chunk 104.7 KB gzipped, still over the stated 60 KB. Kitchen and cashier are
1.5 KB and 1.4 KB gzipped and code-split, so a customer's phone never downloads them.

**Next action** — Step 7c: restaurant admin and platform admin.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 7a — customer frontend + design system
```

**Design direction (product owner approved)** — "openwork". Najdi triangular vents from
At-Turaif, Diriyah as the structural motif, Al-Qatt Al-Asiri pigment as the palette, on warm
plaster. Chosen to defeat both the first reflex for Saudi work (gold-on-black, flag green) and
the second (sand-and-terracotta minimalism). Three themes derived from three scene sentences,
not one applied by default: light for customer/cashier/admin, dark for the kitchen wall screen.

**The motif is load-bearing, not decoration.** The order status screen draws
`ORDER_TRANSITIONS` as a band of triangles that light as the order advances. One `clip-path`
transition, no library, zero image requests.

**Completed** — `apps/web` (React 19, Vite 7, Tailwind v4), OKLCH token layer, the openwork CSS,
five customer routes, session handling with silent renewal and tag re-exchange, cart in
`sessionStorage`, `dev:standalone` (API + in-memory Mongo + demo data in one command), and
`seed:demo`.

**Verified in a real browser against the real API**, not assumed:
- Full flow: tag → entry sweep → menu → options → cart → order → live status.
- Money: 32.00 burger + 5.00 cheese = 37.00, server-split to 32.17 net + 4.83 VAT. Exact.
- The state band advanced through a genuine cashier confirm and three kitchen transitions;
  partial fill measured at `inset(0 75% 0 0)` (25%) in Asiri red, full fill in Asiri green.
- A sold-out modifier option never reaches the customer; a required group gates the Add button.

**Problems found and fixed**
1. **The state band never lit.** `OpenworkBand` had no `style` prop, so the `--ow-reach` custom
   property was silently dropped and the `0%` fallback won. Caught by measuring `clip-path` in
   the browser rather than trusting the screenshot.
2. **20 px of horizontal overflow** from a `-mx-5` full-bleed sticky heading. Removed; items live
   in the same content column, so there was nothing to bleed over.
3. **A magic sticky offset** (`top-[3.55rem]`) that would drift the moment the header changed.
   Replaced with `--app-header-h`, derived from its parts; it computes to exactly the measured
   59 px.
4. **Two copies of Vite** (root 7, workspace 6) broke plugin types. Aligned on one.

**Known miss, not hidden:** the customer entry chunk is **103.5 KB gzipped against a stated
60 KB budget**. React + React Router baseline, not the design. Options and recommendation are in
`DESIGN.md`; awaiting a decision.

**Blocked externally:** MongoDB Atlas refused the connection — this machine's IP is not on the
cluster allowlist. Not fixed, because it is the product owner's account. `dev:standalone` was
built so frontend work never depends on it.

**Next action** — Step 7b: kitchen, cashier, restaurant admin, platform admin.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 6 — orders, state machine, cash
           THE PHASE 1 BACKEND IS COMPLETE
```

**Completed** — `Order`, `Counter` and `IdempotencyKey` models; the server-side pricing engine;
the order state machine in `@rw/shared/orderState.ts`; customer order placement, status and
self-cancel; staff order boards, transitions and cash confirmation; `CASH_CONFIRMED` audit.

**Tests** — 192 passed, 0 failed. Security suite 134 tests across six files. All nine Phase 1
rows of the mandatory tenant-isolation matrix now pass.

**Decisions made during the step**
- **The state machine is a data table with roles attached**, not `if` statements, and it lives in
  `@rw/shared` so the UI can grey out a button the server would refuse rather than discovering it
  by failing.
- **Terminal states have no outgoing transitions at all.** A completed order is frozen — items,
  totals and status can never change again. That is what makes it a financial record.
- **Concurrency is handled with a conditional `findOneAndUpdate` on the current status**, plus an
  optional `expectedCurrentStatus` from the client for stale screens. Tested with three
  simultaneous cash confirmations: exactly one succeeds, one audit event, one history entry.
- **Idempotency claims the key *before* doing the work.** The unique index decides the race at
  the database; the loser reads back and replays. Reusing a key with different content is a 409,
  because replaying the first answer would hide a client bug. A failed order releases its key so
  a corrected retry is not blocked for 24 hours.
- **Order numbers reset daily on the Saudi local day** (fixed UTC+3, no DST, so no timezone
  database is needed). Allocation is one atomic `$inc` with upsert.
- **Card payment is refused with a clear message rather than accepted.** Until a webhook can
  confirm payment, accepting a card order would mean trusting the browser.

**Problems found and fixed**
1. **`sanitizeFilter` broke our own `$in` queries.** Every order failed with a 500: the global
   NoSQL-injection guard wraps any operator-shaped object in `$eq`, including ours, so
   `{_id: {$in: ids}}` matched nothing. Fixed with `mongoose.trusted()` at the three deliberate
   call sites. Keeping the protection and marking our own operators is the right way round —
   disabling it would have removed a real defence to fix a self-inflicted symptom.
2. **Order creation leaked the internal `_id` to the customer.** The creation path returned the
   staff view. Now every customer-facing response goes through `toCustomerOrderView`, which
   strips both the database id and the staff `statusHistory` — including on the cancel route and
   in the stored idempotency snapshot, so a replay cannot return more than the original did.
3. Mongoose returns unset optional strings as `null`, so the snapshot types had to admit it.

**Pending user actions** — **give UI direction before Step 7**; Cloudinary credentials when
wanted; rotate the Atlas password before production; `IP_HASH_SALT` before production; GitHub
repo for CI; product name/domain.

**Next action** — ⛔ **Stop. Ask the product owner about frontend approach.** Do not write UI
code before that conversation.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 5 — menu
```

**Completed** — `MenuCategory` and `MenuItem` models (both tenant-guarded); owner/manager CRUD
with a cashier-only availability toggle; the customer menu behind the table session with ETag
revalidation; the `ImageProvider` adapter with a Cloudinary implementation and a `none` default;
image-URL ownership validation; menu audit actions including `MENU_PRICE_CHANGED`.

**Tests** — 155 passed, 0 failed. Security suite now 97 tests across five files. All green on
the first run.

**Product-owner decisions recorded this session**
- **Cloudinary for image storage in development and demo**, kept as a placeholder — no
  credentials yet, `IMAGE_PROVIDER=none` by default.
- **Cloudflare R2 is deferred to real production** and is a TODO in §22. Demo production also
  runs entirely on free tiers.
- **The agent must consult the product owner before any frontend work (Step 7).** They have UI
  tooling to bring. This is recorded in §2 and §3 as well.

**Decisions made during the step**
- **An image URL is only accepted if it belongs to our provider and this tenant's folder.**
  Without that check an admin could point an item's image at any host, and our customer page
  would then load content we do not control. With `IMAGE_PROVIDER=none` every external URL is
  refused rather than waved through.
- **No Cloudinary SDK.** The signature is a SHA-1 of sorted parameters plus the API secret —
  about a dozen lines of `node:crypto`. The secret never leaves the server and the file never
  touches it.
- **Uploads go browser-to-provider**, not through our API. A small backend instance should never
  be in the path of a phone photo.
- **Modifier price deltas are zero or positive in Phase 1.** Discounts are modelled as separate
  items. Negative deltas let a combination produce a negative line total, which every downstream
  money assertion would then have to defend against.
- **The customer menu is cached `private, max-age=30` with an ETag.** It is the first page a
  customer hits and the one that must feel instant on 4G. `private` keeps one tenant's menu out
  of any shared proxy.
- **Deleting a category with items in it is refused**, rather than silently orphaning them.
- Empty categories are omitted from the customer menu — noise on a phone screen.

**Problems found** — none. No bugs surfaced during this step.

**Pending user actions** — Cloudinary credentials when wanted (optional); rotate the Atlas
password before production; `IP_HASH_SALT` before production; GitHub repo for CI; product
name/domain.

**Next action** — Phase 1 Step 6: orders, state machine, cash. Then **stop before Step 7** and
discuss UI approach.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 4 — tables + secure table tokens
```

**Completed** — `Table` and `TableSession` models; AES-256-GCM helpers in `core/crypto.ts`;
`core/tableSessionToken.ts` (separate secret and audience from staff tokens);
`requireTableSession` middleware; the public token-exchange and session-refresh endpoints;
owner/manager table CRUD with token rotation, QR rendering and CSV export; per-IP and per-token
rate limiters.

**Tests** — 128 passed, 0 failed. Security suite now 70 tests across four files.

**Decisions made during the step**
- **Customer and staff tokens use different signing secrets and different JWT audiences.** Even
  if one key leaked it could not mint the other kind of token. Tested in both directions.
- **The table token is stored twice** — SHA-256 for lookup, AES-256-GCM for QR reprinting. A
  hash alone cannot be reversed, so the owner could never reprint a QR without rotating the
  token and rewriting the physical tag; plaintext would mean a database dump hands over working
  URLs. Both, with the key in the environment, gives us both properties.
- **`decryptSecret` returns null instead of throwing.** A rotated or lost key is an operational
  problem to surface in the UI ("QR unavailable — rotate this table's token"), not a 500.
- **Rotating a token immediately closes live sessions on that table.** If a card is stolen,
  waiting out the session window would defeat the point of rotating.
- **Table URLs are visible to owners and managers only**, not to cashiers or kitchen staff. The
  URL *is* the credential; a leaked screenshot should have the smallest possible blast radius.
- **Two rate limiters on the exchange**, per-IP and per-token. The IP limiter alone is defeated
  by a botnet; the token limiter caps attempts against any one table however they are spread.

**Problems found and fixed**
1. **The rejected-token audit write was fire-and-forget.** The response could return before the
   event was written, so probing attempts could go unrecorded — losing exactly the signal that
   matters. Now awaited, which also keeps every failure path doing equal work.
2. `env.test.ts` still described the old production requirements; `TABLE_SESSION_SECRET`,
   `TABLE_TOKEN_KEY` and `IP_HASH_SALT` are now mandatory in production, and the test was
   rewritten as a table-driven "remove one required field at a time" check.
3. Supertest does not buffer binary or `image/svg+xml` responses; the QR tests needed
   `.responseType('blob')`.
4. The table test factory was building a fully staffed tenant (four Argon2 hashes) per table.
   Reduced to one owner — Argon2 is intentionally slow, so this cut the suite's runtime sharply.

**Pending user actions** — Cloudflare R2 bucket before the image-upload part of Step 5; rotate
the Atlas password before production; GitHub repo for CI; product name/domain.

**Next action** — Phase 1 Step 5: menu.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 3 — platform admin
```

**Completed** — platform routes (create restaurant + first owner, list, get, suspend/reactivate,
cross-tenant audit view); slug rules with a reserved-word list; `seed:admin` bootstrap script;
`POST /auth/change-password` with `mustChangePassword`.

**Tests** — 97 passed, 0 failed. Security suite now 43 tests across three files.

**Decisions made during the step**
- **Owner provisioning uses a system-generated one-time password**, returned once at creation
  and never retrievable, with `mustChangePassword` set. The alternative — the platform admin
  choosing the owner's password — means we would know a customer's credentials. This one does
  not, and forces a change on first use.
- **`POST /auth/change-password` was added here rather than in a later step.** Without it the
  temporary-password flow is a dead end. It requires the current password even though the caller
  is authenticated, so a stolen access token cannot lock the real owner out, and it revokes every
  session including the caller's.
- **Restaurant + owner creation uses a compensating rollback, not a transaction.** MongoDB
  transactions need a replica set, which rules out the simplest local and test setups. The
  restaurant is created first and deleted again if the owner insert fails. Revisit transactions
  if an operation ever needs atomicity across more than two documents.
- **Slug case is normalised, not rejected.** `Burger-Palace` becomes `burger-palace`, so a
  differently-cased duplicate correctly returns 409.
- Suspension deliberately leaves refresh tokens intact, so reactivation restores service without
  forcing every member of staff to log in again.

**Problems found and fixed**
1. Express 5 types give `req.params.id` as `string | string[]`; the value is already validated to
   24 hex characters by then, so it is coerced with `String()`.
2. Mongoose returns optional fields as `string | null | undefined`; the platform response
   interfaces had to admit `null`.
3. One test asserted that an uppercase slug is rejected. It is normalised instead, which is the
   better behaviour — the test was wrong, and now asserts normalisation plus the resulting
   case-insensitive duplicate conflict.

**Pending user actions** — set `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` and run
`npm run seed:admin --workspace @rw/api`; rotate the Atlas password before production; GitHub
repo for CI; product name/domain.

**Next action** — Phase 1 Step 4: tables and secure table tokens.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 2 — tenancy + authentication core
```

**Completed** — `Restaurant`, `User`, `RefreshToken`, `AuditLog` models; Argon2id hashing;
login/refresh/logout/me; rotating opaque refresh tokens with reuse detection; `tokenVersion`
instant revocation; account lockout; RBAC; the `tenantRepo` accessor and `tenantGuardPlugin`;
the audited `unscoped()` hatch; append-only audit log with salted IP hashing; rate limiting.

**Tests** — 72 passed, 0 failed. Security suite: 25 tests, now its own CI step.

**Decisions made during the step**
- `tenantRepo` returns resolved promises, not chainable Mongoose queries. Partly for
  declaration-emit portability, mainly so a `.where()` cannot be appended far from the tenant
  check. Sorting/limiting/projection go through a `FindOptions` argument.
- The tenant guard plugin is **not** applied to `Restaurant`, `User`, `RefreshToken` or
  `AuditLog`. Each exception is justified in its model file (see §11). Applying it blindly would
  make platform admins impossible to create and login impossible to perform.
- Tests no longer load `apps/api/.env` at all. A test suite that inherits a real `MONGODB_URI`
  is one `deleteMany({})` away from wiping live data.
- Logger defaults to `silent` under `NODE_ENV=test`; expected 401s and 403s were burying real
  results.

**Problems found and fixed**
1. `tsc` could not name `tenantRepo`'s inferred return type for declaration emit
   (`TS2742`, mongoose internals). Fixed with explicit `TenantRepo<T>` / `UnscopedRepo<T>`
   interfaces — which also tightened the API.
2. The `pre('save')` tenant guard never fired: Mongoose runs `validate` first, so a
   `required: true` on `restaurantId` produced a generic ValidationError instead. Now hooked on
   both `validate` and `save`, so the specific "use tenantRepo" message is what a developer sees.
3. `/readyz` began failing once a real `MONGODB_URI` existed — the test process was reading the
   developer's `.env`. Root cause of a whole class of problems; fixed by not loading dotenv in
   tests at all.

**Pending user actions** — rotate the Atlas password (§7); GitHub repo for CI; product
name/domain when convenient.

**Next action** — Phase 1 Step 3: platform admin + first-admin seed script.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 1 Step 1 — foundation
```

**Completed**
- Monorepo scaffolded and verified: npm workspaces, TypeScript strict (ESM/NodeNext, project
  references), ESLint 9 flat config.
- `@rw/shared`: role/status/order enums, and the halala money module — exact integer
  arithmetic, symmetric rounding, and VAT splitting that reconciles exactly.
- `@rw/api`: Zod-validated fail-fast environment, pino logging with secret redaction and an
  automatic request-ID mixin, AsyncLocalStorage request context, Express 5 app with helmet,
  a CORS allowlist, a 100 kb body cap and correct `trust proxy`, an error taxonomy with a
  leak-proof handler, Zod validation middleware, a Mongoose helper with `sanitizeFilter`, and
  `/health` + `/readyz`.
- Test harness: Vitest + Supertest + `mongodb-memory-server`, proven by an actual connect/write
  test rather than assumed.
- CI workflow written, including a job that fails the build if an env file is ever committed.
- `git init` on `main`. Verified `apps/api/.env` is ignored by creating one, confirming git
  ignored it, then deleting it.

**Changed** — `docs/PHASE_0_ARCHITECTURE.md` and `walkthrough.md` updated for the three
decisions taken (table token storage, English-first UI, Moyasar).

**Tests** — `npm test`: **46 passed, 0 failed.** `npm run build`, `npm run typecheck` and
`npm run lint` all green. The built server was booted and probed: `/health` 200, `/readyz` 200
reporting `database: not-configured`, unknown route a structured 404, security headers present.

**Problems found and fixed during the step**
1. `tsc` rejected the project reference — `packages/shared` needed `composite: true`.
2. `import pinoHttp from 'pino-http'` failed to typecheck: pino-http is CommonJS, so under
   NodeNext its default export is the module namespace, not the function. Switched to the named
   import.
3. A log line emitted two `msg` keys because the error handler passed `msg:` in the merged
   object as well as a pino message. Renamed to `reason:`. Parsers keep the last duplicate key,
   so this would have quietly hidden error text in production logs.
4. A test tried to send a header containing a newline; Node's HTTP client refuses to transmit
   that, so the test could never reach the server. Rewritten to use a value that is legal in
   HTTP but correctly rejected by the request-ID safe-character check.

**After Step 1 — database connected**
- Product owner created a MongoDB Atlas cluster and added `MONGODB_URI` to `apps/api/.env`.
- The URI carried no database name, so it silently defaulted to `test`. Repaired to
  `restaurant_dev`, and the surrounding quotes were removed. Verified by connecting: MongoDB
  8.0.28, database `restaurant_dev`, 0 collections.
- **Security incident:** a diagnostic command printed raw `.env` line content, exposing the
  Atlas password in the transcript. Rotation instructions are in §7 and are outstanding.
  Root cause: printing value content to diagnose a parse problem. Correct approach is to print
  key names, lengths, and structural facts only.

**Pending user actions** — **rotate the Atlas password (§7)**; GitHub repo (for CI); product
name/domain when convenient.

**Next action** — Phase 1 Step 2: tenancy + authentication core.

---

### Previous session

```
Date:      2026-08-09
Session:   Phase 0 — discovery and architecture
```

**Completed**
- Inspected the working directory — empty, greenfield. Confirmed the adjacent `NFC/` folder
  (personal vcard project + an unrelated ERP prompt) is out of scope.
- Verified toolchain: Node v22.18.0, npm 11.3.0, git 2.35.1. Git not initialised.
- Wrote the full 16-section Phase 0 assessment: repo structure, tech choices, schema, API
  design, auth, tenant isolation, table/NFC security, payment architecture, accounting
  integration, Redis strategy, deployment, threat model (20 threats), Phase 1 plan (8 steps),
  complexity estimate (~13–16 agent sessions), risks and trade-offs.
- Created `PROJECT_STATE.md`, `CLAUDE.md`, `walkthrough.md`, `.gitignore`, `.env.example`.

**Changed** — nothing; there was no prior code.

**Tests** — none run; no code exists.

**Problems / flags raised**
- Render free tier sleeps → cold starts make it unusable for a live restaurant.
- Atlas M0 free tier has no automated backups → unsuitable for pilot production.
- Payment merchant onboarding and KSA SMS sender-ID registration both have real lead times.

**Decisions taken by the product owner (2026-08-09)**
- Table tokens: SHA-256 hash + AES-256-GCM encrypted reprint copy.
- Phase 1 UI: **English only**. Schema stays bilingual; Arabic UI + RTL move to Phase 2.
- Payment provider: **Moyasar** (Phase 2, sandbox first).
- Still open, non-blocking: product name/domain, and whether a pilot restaurant is identified.

**Pending user actions** — GitHub repo; MongoDB Atlas or local mongod; product name/domain.

**Next action** — approve `docs/PHASE_0_ARCHITECTURE.md`, then execute Phase 1 Step 1
(foundation).
