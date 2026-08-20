# Production security audit — Restaurant self-ordering webapp

**Date:** 2026-08-19 (second pass, production-focused)
**Scope requested:** app code (deep) · dependencies · deploy/prod config · DoS/abuse.
**Excluded per owner:** `.env` secret values (will be rotated before production).
**Method:** static code review + `npm audit`. No live target (repo forbids starting the dev server).
**Relationship to first audit:** `SECURITY_AUDIT_2026-08-19.md` covered 8 findings, all fixed. This
pass looked for anything **production-affecting** that the first pass did not raise.

---

## Verdict

No critical or high remote-exploit vulnerability found in the application code. The auth, tenant
isolation, money, order-state, table-token, and error-handling layers hold up under a second, harder
read. `npm audit` is **clean (0 vulnerabilities)**, prod and dev.

Five items below are worth closing before real customers. The two that most "affect production" are
**P1 (missing security headers on the web app)** and **P3 (unbounded backup export)**.

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| P1 | **Medium** | Web app ships with no security headers (no CSP / X-Frame-Options / HSTS / nosniff / Referrer-Policy). Staff & admin login pages are frameable → clickjacking. | `vercel.json` |
| P2 | **Medium** | `/app/dashboard/backup` loads **all** orders/items/staff into memory and zips synchronously — no limit. OOM/DoS on the single instance; admin can repeat. | `dashboard.service.ts:112`, `dashboard.routes.ts` |
| P3 | **Low** | `staffCreateOrder` looks up a client-supplied `tableId` **unscoped**, so a staffer can attach another tenant's table label to their order (cross-tenant label leak / wrong attribution). | `order.service.ts` (staffCreateOrder) |
| P4 | **Low** | Backup zip contains customer PII (`customerPhone`) and internal user fields (tokenVersion, failedLoginCount, lockedUntil, ipHash). | `dashboard.service.ts:112` |
| P5 | **Info** | Socket events are not rate-limited; an authenticated client can spam `join_order`, each doing a DB lookup. | `core/socket.ts` |

---

## Findings

### P1 — Web app has no security headers (clickjacking + hardening)

`vercel.json` only defines rewrites. The frontend (which holds the staff access token in memory and
runs the admin/platform consoles) is served by Vercel **with no security headers**. `helmet` only
protects API responses on Render; it does nothing for the HTML/JS Vercel serves.

Missing, and each matters:
- **`X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`** — without it the staff/admin/login pages
  can be framed → clickjacking (an attacker frames the login and overlays it).
- **`Content-Security-Policy`** — no defence-in-depth against injected script on a token-holding page.
- **`Strict-Transport-Security`** — no HSTS on the app origin.
- **`X-Content-Type-Options: nosniff`**, **`Referrer-Policy: no-referrer`**, **`Permissions-Policy`**.

**Fix:** add a `headers` block to `vercel.json`, e.g.

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; img-src 'self' https://res.cloudinary.com data:; connect-src 'self' https://icsa.onrender.com; style-src 'self' 'unsafe-inline'; script-src 'self'" }
      ]
    }
  ]
}
```
The `connect-src`/`img-src` values must match the real API host and Cloudinary; tighten `script-src`
after checking the built bundle needs no inline script.

---

### P2 — Unbounded backup export (resource exhaustion / DoS)

```
export async function getRestaurantBackupData() {
  const [orders, categories, menuItems, staff] = await Promise.all([
    tenantRepo(OrderModel).find({}),   // every order, ever — no limit
    ...
  ])
}
```

`GET /app/dashboard/backup` (owner/manager) reads the tenant's **entire** order history into memory,
`JSON.stringify`s it, and streams a zip. For a busy restaurant (tens/hundreds of thousands of orders)
this is a large heap spike on a single Render instance, and an admin can trigger it repeatedly. It is
admin-gated (so not anonymous DoS) but it is a self-service way to knock over the box.

**Fix:** stream orders with a cursor and append in batches rather than materialising the whole array;
or cap the export (e.g. last N days / paginated) and document it. At minimum add a `limit` and a
sort, and stream via `OrderModel.find(...).cursor()`.

---

### P3 — Cross-tenant `tableId` in `staffCreateOrder`

```
if (input.tableId) {
  table = await TableModel.findOne({ _id: input.tableId }).setOptions({ unscoped: true })
  if (!table) throw notFound('Table not found')
  ...
}
```

`input.tableId` is client-supplied and looked up **unscoped**. The order is still created under the
caller's own tenant (`tenantRepo` stamps `restaurantId`), and the active-session lookup is tenant-
scoped so it won't match — but `tableLabelSnapshot` is taken from the foreign table, so a staffer can
stamp another tenant's table label onto their order. Low impact (a label string), but it is a real
break of the "resolve tenant data through `tenantRepo`" rule.

Contrast the customer path, which is safe: it reads `context.tableId` from the **verified session
token**, not from the body.

**Fix:** scope the lookup — `tenantRepo(TableModel).findById(input.tableId)` — so a foreign or unknown
id resolves to `null` → `notFound`, identical to any other not-found table.

---

### P4 — PII and internal fields in the backup zip

The backup includes `orders` (with `customerPhone`) and `staff` (full `User` docs minus the
`select:false` `passwordHash`, so still `tokenVersion`, `failedLoginCount`, `lockedUntil`, `ipHash`,
`lastLoginAt`). No password hashes leak (verified `select:false`), but a downloadable file with
customer phone numbers and internal auth counters is worth trimming to the fields a backup actually
needs, and worth an audit event when generated.

**Fix:** project explicit fields for each collection; write a `RESTAURANT_*` audit event on export.

---

### P5 — Socket events are not rate-limited

The Socket.IO handshake is now authenticated (fixed in the first pass), but individual events are not
throttled. `join_order` performs a DB `exists` per event, so an authenticated client could spam it.
Bounded (authenticated, one small query each) and low-risk, but socket traffic bypasses the HTTP
rate limiters entirely.

**Fix (optional):** cap joins per socket / per interval, or debounce room joins server-side.

---

## Re-verified as correct (production-relevant)

- **Dependencies:** `npm audit` and `npm audit --omit=dev` → 0 vulnerabilities.
- **Error handling:** non-operational errors return a generic `500` with only a request id; stack
  traces and internal messages go to logs only. Oversized/malformed bodies map to `413`/`400`.
- **Request id:** an inbound `X-Request-Id` is accepted only if it matches `^[A-Za-z0-9._-]{8,64}$`,
  so it cannot inject into logs.
- **Env fail-fast (prod):** requires `MONGODB_URI`, `JWT_ACCESS_SECRET`, `TABLE_SESSION_SECRET`,
  `TABLE_TOKEN_KEY`, `IP_HASH_SALT`; rejects wildcard `CORS_ORIGIN`; forces https `PUBLIC_APP_URL`.
- **Image uploads:** browser-to-Cloudinary via a server-signed, tenant-folder-scoped credential; the
  secret never reaches the browser; stored URLs are pinned to `res.cloudinary.com/<cloud>/<tenant>/`;
  SVG excluded; server never fetches the URL (no SSRF).
- **Password hashes:** `passwordHash` is `select:false`; the backup and every ordinary query exclude
  it.
- **Rate limiting:** the table-token limiter keys on `sha256(token)`, so a raw token never enters the
  limiter store; per-surface limiters exist for login/refresh/menu/orders/staff.
- **Socket auth (from first pass):** every connection verified in the handshake; rooms derived from
  the verified token; `join_order` authorised by ownership.
- **No dangerous sinks:** no `eval`/`child_process`; the one `new RegExp` escapes its input; no
  `dangerouslySetInnerHTML`; customer review text is rendered as escaped JSX.

---

## Notes / assumptions

- Secret rotation before production is assumed (per owner) — this report raises no finding about the
  current `.env` values, only about config *structure* (P1).
- `vercel.json` proxies `/api/*` to `https://icsa.onrender.com` — confirm that host is the intended
  production API and that its `CORS_ORIGIN`/`PUBLIC_APP_URL` env match the Vercel app origin.
- No live/dynamic testing was performed; a DAST pass against a staging instance (with the app running
  by the owner, on non-default ports) would complement this static review — especially for P1/P2.
