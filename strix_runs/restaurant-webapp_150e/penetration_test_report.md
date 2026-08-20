# Security Penetration Test Report

**Generated:** 2026-08-19 10:33:07 UTC

# Executive Summary

# Executive Summary

A white-box security assessment of the **Restaurant Webapp** — a multi-tenant, NFC-enabled restaurant ordering platform built with Node.js/Express (API) and React/Vite (web) — identified **three confirmed vulnerabilities**, including one rated **Critical**.

## Overall Risk Posture: **Elevated**

The most significant finding is that all active production-grade secrets — including a MongoDB Atlas connection string, JWT signing keys, AES-256 table-token encryption keys, and Cloudinary API credentials — are stored in plaintext in `apps/api/.env`. Because the JWT signing secret uses a symmetric algorithm (HMAC-SHA-256), possession of this secret enables an attacker to forge access tokens for any user role, including the `PLATFORM_ADMIN` role that governs the entire multi-tenant platform with no restaurant boundary. This constitutes a complete platform takeover path requiring no exploitation of any other weakness.

## Key Findings

- **Critical (CVSS 10.0)**: All active service credentials stored in plaintext in `apps/api/.env`, enabling JWT token forgery, direct database access, and full Cloudinary image-store compromise.
- **Medium (CVSS 6.5)**: Business logic flaw in cash payment confirmation allows an authenticated cashier to re-mark a previously refunded order as paid, corrupting financial records silently with no audit trail.
- **Medium (CVSS 4.3)**: Missing maximum length constraint on the menu search query parameter enables authenticated staff to send arbitrarily large regex patterns to MongoDB, causing disproportionate resource consumption.

## Business Impact

- **Data exposure**: Direct MongoDB Atlas credentials expose all restaurant, order, menu, staff, and customer session data across all tenants.
- **Financial integrity**: The payment status manipulation flaw undermines the reliability of financial records and could facilitate internal fraud.
- **Platform availability**: Unbounded search queries degrade API performance under sustained load from an authenticated insider.
- **Compliance**: Plaintext storage of cryptographic secrets and database passwords conflicts with PCI-DSS, ISO 27001, and SOC 2 requirements for secrets management.

## Positive Security Observations

The application demonstrates strong security fundamentals in many areas: server-side-only pricing (clients cannot influence prices), tenant isolation via a custom `tenantRepo` abstraction enforced on every database call, JWT algorithm pinning (HS256, with audience and issuer verification), Argon2id password hashing, refresh token rotation with family revocation, idempotency keys preventing duplicate orders, and properly scoped httpOnly refresh-token cookies.

# Methodology

# Methodology

## Engagement Type

**White-box** static and code-assisted dynamic analysis of the `Restaurant-Webapp` local codebase at `/workspace/Restaurant-Webapp`.

## Scope

- `apps/api/src/` — Node.js/Express REST API (authentication, orders, menu, staff, tables, platform administration)
- `apps/web/src/` — React/Vite frontend (customer ordering flow, staff dashboards)
- `packages/shared/src/` — Shared Zod schemas, enums, and business logic

## Frameworks and Standards

Testing followed **OWASP WSTG** and **OWASP Top 10 (2021)** categories, with particular emphasis on:
- A01 Broken Access Control (IDOR, tenant isolation, RBAC enforcement)
- A02 Cryptographic Failures (secrets management, algorithm strength)
- A03 Injection (NoSQL injection, regex injection)
- A04 Insecure Design (business logic, state machine integrity)
- A05 Security Misconfiguration (secrets in plaintext, missing input constraints)
- A06 Vulnerable Components (dependency CVE scanning via npm audit)

## Testing Activities

1. **Architecture mapping**: Full traversal of the source tree — routes, middleware chain, services, models, shared schemas, and frontend components.
2. **Authentication and session analysis**: JWT signing, refresh token rotation, table session token separation, CSRF protection on auth endpoints.
3. **Authorization analysis**: RBAC middleware, tenant isolation (`tenantRepo`), platform-admin privilege separation.
4. **Business logic review**: Order state machine, pricing pipeline, payment status lifecycle, stock reservation atomicity.
5. **Input validation review**: Zod schema coverage on all endpoints, body size limits, search parameter constraints.
6. **Static analysis**: `semgrep` (security rulesets), `gitleaks` (secret detection across the filesystem).
7. **Dependency vulnerability scan**: `npm audit` across root, `apps/api`, and `apps/web` workspaces.
8. **Frontend XSS surface**: Review of all React components that render user-supplied content (review `customerName`/`comment`, order notes, menu descriptions) — all use JSX text interpolation, which escapes by default.

## Approach Notes

Dynamic runtime testing was not performed because the API requires a live MongoDB Atlas connection and the credentials in `.env` are treated as active secrets. All validation was performed through source-code analysis corroborated by the static tooling passes above. The business logic flaw in `confirmCashPayment` was identified and confirmed through code trace without requiring a live execution environment.

# Technical Analysis

# Technical Analysis

## Severity Model

Severity is derived from demonstrated or directly traceable exploitability and confirmed impact. CVSS v3.1 base scores were calculated from the actual attack prerequisites and the worst realistic consequence — no speculative pivots were scored.

## Finding 1 — Plaintext Credential Storage (Critical, CVSS 10.0)

`apps/api/.env` contains every active secret the API depends on:

- **MongoDB Atlas URI** with embedded username and password — full read/write access to all tenants' data.
- **`JWT_ACCESS_SECRET`** (HS256 symmetric key) — possession allows forging a valid `PLATFORM_ADMIN` access token for any user ID, with any role, bypassing all RBAC checks and all tenant boundaries.
- **`TABLE_SESSION_SECRET`** — allows forging customer table-session tokens without physical NFC tag access.
- **`TABLE_TOKEN_KEY`** (AES-256-GCM) — allows decrypting every stored NFC table token retrieved from the database.
- **Cloudinary API key/secret** — allows uploading, listing, and deleting all restaurant images.
- **Platform admin email** — facilitates phishing and credential-stuffing targeting the highest-privilege account.

The attack chain with the JWT secret requires no database access at all: forge a `PLATFORM_ADMIN` JWT → call `GET /api/v1/platform/restaurants` to enumerate all tenants → call `PATCH /api/v1/platform/restaurants/:id/status` to suspend any restaurant → or call `POST /api/v1/platform/restaurants` to create rogue tenants.

While `.gitignore` correctly excludes `.env` files from version control, the file exists in the developer workspace with real credentials, exposing them to any party with filesystem access to the development environment.

**Systemic root cause**: No secrets management tooling is in use. Credentials are provisioned as static strings in a file rather than being loaded from an OS keychain, a cloud secret manager, or a deployment platform's encrypted environment variable store.

## Finding 2 — Payment Status Manipulation After Refund (Medium, CVSS 6.5)

In `order.service.ts`, `confirmCashPayment()` guards against re-payment when `paymentStatus === PAID` but not when `paymentStatus === REFUNDED`:

```typescript
// Only guard present:
if (order.paymentStatus === PaymentStatus.PAID) {
  throw conflict('This order is already paid')
}
// No guard for REFUNDED — falls through to:
const updated = await repo.findOneAndUpdate(
  { _id: order._id, paymentStatus: order.paymentStatus },  // matches REFUNDED
  { $set: { paymentStatus: PaymentStatus.PAID } },          // overwrites to PAID
  { new: true }
)
```

An authenticated cashier, manager, or owner can execute the sequence `POST /orders/:id/refund` → `POST /orders/:id/confirm-cash`, which atomically reverts a `REFUNDED` payment status back to `PAID`. Because the `findOneAndUpdate` branch does not call `writeAudit`, this reversal produces no audit log entry, making it undetectable through normal monitoring.

A secondary gap was identified in the same function: the `kitchenStartsBeforePayment = true` path (the `else` branch after the `CASH_PENDING` check) also lacks a `writeAudit(CASH_CONFIRMED)` call for first-time legitimate payments, making those transactions similarly invisible in the audit log.

## Finding 3 — Unbounded Search Regex (Medium, CVSS 4.3)

`GET /api/v1/app/menu/items/search?q=<string>` validates `q` with `z.string().min(1)` only, omitting `.max()`. The value is compiled into a `new RegExp(safeQuery, 'i')` and issued as a four-field `$or: [...$regex]` MongoDB query. Unlike the JSON body (capped at `BODY_LIMIT=100kb`), query strings bypass the body-size middleware. A very long `q` value is compiled into a proportionally sized regex pattern and transmitted to MongoDB as a `$regex` BSON clause, consuming CPU and memory on both the API server and the database. The general rate limiter (300 req/min) bounds the request rate but not the per-request cost.

## Static Analysis Summary

- **Semgrep**: 5 findings; all reviewed — 3 false positives (the `SETTINGS_KEYS` property access is from a hardcoded const, not user input; `Object.assign` in validate middleware processes Zod-parsed output; AES-GCM auth tag is set via `setAuthTag`); the non-literal RegExp finding corresponds to the already-reported vuln-0002.
- **Gitleaks**: 16 findings; all attributable to the `.env` file and scan artefacts (vuln-0001).
- **npm audit**: Zero vulnerabilities across all three workspaces (root, `apps/api`, `apps/web`).

## Areas Confirmed Clean

| Area | Assessment |
|---|---|
| Tenant isolation (tenantRepo) | Enforced on every query; cross-tenant access not possible through application code |
| Pricing pipeline | Server-side only; client input contains no price or total fields |
| JWT algorithm | Pinned to HS256 with issuer/audience verification; algorithm confusion not possible |
| Refresh token rotation | Family-based revocation on reuse; stolen-token scenarios detected and contained |
| CSRF on auth endpoints | `requireValidOrigin` checks Origin/Referer; other endpoints use Bearer tokens (CSRF-immune) |
| XSS in React frontend | All user-supplied strings rendered via JSX text interpolation (auto-escaped); `dangerouslySetInnerHTML` not used anywhere |
| Argon2id password hashing | OWASP-baseline parameters (19 MiB / 2 iterations / 1 lane) |
| Order state machine | Transitions enforced by role and current status; no direct status injection possible |
| Stock reservation atomicity | Single conditional `findOneAndUpdate`; double-deduction race condition not possible |
| Platform admin RBAC | `tenantRoleSchema` explicitly excludes `PLATFORM_ADMIN`; double-guarded at route and service layer |

# Recommendations

# Recommendations

## Immediate Actions (within 24 hours)

### 1. Rotate All Credentials in `apps/api/.env`
Every secret in the file must be treated as compromised and rotated immediately:
- **MongoDB Atlas**: Reset the `shamalkhalidnp_db_user` password from the Atlas console; review Atlas access logs for unexpected connections.
- **JWT secrets** (`JWT_ACCESS_SECRET`, `TABLE_SESSION_SECRET`): Generate fresh 48-byte random values (`openssl rand -base64 48`). All existing sessions will be invalidated on restart — plan a brief maintenance window.
- **AES key** (`TABLE_TOKEN_KEY`): Generate a new 32-byte key (`openssl rand -base64 32`); existing table tokens will be unreadable until staff rotate each table's NFC token from the admin UI.
- **Cloudinary**: Regenerate the API key/secret from the Cloudinary console; audit the media library for unexpected uploads.
- **Platform admin account**: Change the password for `shamalkhalidnp@gmail.com` immediately; review audit logs (`GET /api/v1/platform/audit`) for unexpected platform-admin actions.

### 2. Remove the Plaintext `.env` File from Developer Workspaces
Replace `apps/api/.env` with a file containing only placeholder values (matching `.env.example`) and provision real secrets through the deployment platform's encrypted environment variable store (Vercel / Render environment UI, or a secrets manager such as HashiCorp Vault or AWS Secrets Manager).

## Short-term Actions (within 1 week)

### 3. Fix the `confirmCashPayment` Payment Status Guard
Add a guard for `PaymentStatus.REFUNDED` in `order.service.ts` so that a refunded order cannot be re-marked as paid. Also add a `writeAudit(CASH_CONFIRMED)` call to the `kitchenStartsBeforePayment` branch so that all legitimate first-time cash confirmations are recorded. The business logic agent has already applied the code fix; the patch should be reviewed, tested, and merged.

### 4. Add Maximum Length to Menu Search Parameter
Add `.max(200)` to the `searchSchema` in `apps/api/src/modules/menu/menu.routes.ts`. This one-line change prevents oversized regex patterns from reaching MongoDB. The fix has been documented with a verbatim `fix_before`/`fix_after` pair in the vulnerability report.

### 5. Add Pre-commit Secret Scanning
Integrate `gitleaks` or `trufflehog` as a Git pre-commit hook and as a CI/CD pipeline step. This prevents future accidental secret commits even if a developer re-populates a `.env` file with real values. A sample configuration:

```bash
# .pre-commit-config.yaml addition
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.x.x
  hooks:
    - id: gitleaks
```

## Medium-term Actions (within 1 month)

### 6. Replace MongoDB `$regex` Search with Text Index
The `searchItems` function uses `$regex` against four fields, which cannot use standard B-tree indexes and performs a collection scan on every request. Replacing it with a MongoDB text index (`db.menuItems.createIndex({ "name.en": "text", "name.ar": "text", "description.en": "text" })`) and `{ $text: { $search: query } }` queries eliminates both the performance issue and the regex-amplification risk entirely.

### 7. Adopt a Secrets Rotation Schedule
Implement automated rotation for JWT signing secrets on a 90-day schedule using a dual-key window (old and new secret both accepted for one access-token lifetime), eliminating the operational disruption of rotation.

### 8. Add Integration Tests for Payment State Transitions
Add test cases that assert:
- `refundOrder` → `confirmCashPayment` returns `409 Conflict` (validates the fix for vuln-0003).
- `confirmCashPayment` on an already-`PAID` order returns `409 Conflict` (existing behaviour).
- Both `refundOrder` and `confirmCashPayment` produce audit log entries.

## Retest and Validation

After implementing the above:
1. Verify `JWT_ACCESS_SECRET` rotation by confirming that tokens signed with the old secret are rejected.
2. Verify the `confirmCashPayment` fix by attempting the `refundOrder → confirmCashPayment` sequence and asserting a `409` response.
3. Verify the search length fix by submitting a 201-character `q` value and asserting a `422 VALIDATION_ERROR`.
4. Run `gitleaks detect --source . --no-git` across the workspace and confirm zero findings on the rotated secrets.

