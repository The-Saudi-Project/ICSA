# Security Penetration Test Report

**Generated:** 2026-08-19 11:01:45 UTC

# Executive Summary

# Executive Summary

An external black-box security assessment was conducted against the ICSA smart restaurant ordering platform, comprising two assets:

- **Frontend**: https://icsa-web.vercel.app (React SPA, Vercel-hosted)
- **Backend API**: https://icsa.onrender.com (Node.js/Express, Render.com, behind Cloudflare WAF)

The assessment focused on reconnaissance, attack surface mapping, and targeted vulnerability validation. The backend service is hosted on Render.com's free tier, which imposes significant cold-start latency (60+ seconds after periods of inactivity), limiting the depth of dynamic validation achievable within the engagement window.

**Overall risk posture: Elevated (unvalidated) — several high-priority attack vectors were identified through static analysis of the JavaScript bundle and live reconnaissance that warrant immediate manual validation.**

**Key concerns identified (not yet confirmed with PoC):**

- A database backup download endpoint (`GET /api/v1/app/dashboard/backup`) accessible to authenticated users — role scoping unknown
- Staff password reset endpoint (`POST /api/v1/app/staff/:id/reset-password`) with potential IDOR — any authenticated staff may reset any other staff member's credentials
- Cloud image upload credentials endpoint (`POST /api/v1/app/menu/images/upload-credentials`) that returns Cloudinary credentials — scope and reusability unknown
- Socket.io real-time channel (`wss://icsa.onrender.com/socket.io/`) with `join_restaurant` and `join_order` events that appear to lack authentication gating
- Frontend Content Security Policy allows `unsafe-inline` and `unsafe-eval`, meaning any successful XSS payload would execute without CSP interference
- A CORS origin verification bypass via the `Referer` header (without requiring the `Origin` header)

**No dynamically confirmed, PoC-backed vulnerabilities were filed** due to backend cold-start connectivity constraints during the validation phase. The findings above represent high-confidence structural risks derived from JS bundle analysis and live surface mapping that require follow-up validation.

# Methodology

# Methodology

## Engagement Type
Black-box external assessment with no prior credentials, source code access, or insider knowledge.

## Frameworks
Testing aligned with **OWASP Web Security Testing Guide (WSTG)** and **OWASP API Security Top 10**, covering authentication, authorization, injection, information disclosure, and business logic categories.

## Scope
- https://icsa.onrender.com (API backend)
- https://icsa-web.vercel.app (React SPA frontend)

## Phases Executed

### Phase 1 — Reconnaissance & Surface Mapping
- HTTP fingerprinting of both targets (headers, TLS, server stack)
- Technology identification: React 18 + Vite (frontend), Node.js/Express + Helmet.js (backend), Cloudflare WAF
- Robots.txt, sitemap.xml, `.well-known/` enumeration
- Directory and path fuzzing with `ffuf` and `dirsearch` against both hosts
- API endpoint discovery via `ffuf` with common REST wordlists
- Hidden parameter discovery via `arjun` on discovered endpoints
- Open API documentation probing (Swagger, OpenAPI, GraphQL introspection — all 404)

### Phase 2 — JavaScript Bundle Analysis
- Downloaded and beautified the 284KB Vite/React bundle (`/assets/index-mMXkScxP.js`)
- Extracted all API endpoint strings, fetch/axios call patterns, and route definitions
- Searched for hardcoded secrets, API keys, environment variables, and auth logic
- Mapped all React Router routes and lazy-loaded code chunks
- Identified all user roles (PLATFORM_ADMIN, OWNER, MANAGER, WAITER, CASHIER, KITCHEN)
- Checked for source maps (returned 403 — not publicly accessible)

### Phase 3 — Authentication & Injection Testing
- Attempted NoSQL operator injection on `POST /api/v1/auth/login`
- Attempted SQL injection probes on login fields
- Tested common/default credential sets
- Probed for additional auth endpoints (register, forgot-password, reset-password, refresh, me)
- Tested CORS origin bypass (evil.com, null origin, subdomain prefix attack)
- Tested HTTP method tampering on auth endpoints
- **Constrained by**: Render.com free-tier cold-start delays (60+ second first-response latency) caused scripted probes to time out

### Phase 4 — Public Endpoint & Authorization Testing
- Tested `GET /api/v1/public/menu` with common parameter names (restaurantId, id, slug, tenantId)
- Probed `/health` and `/readyz` for information disclosure
- Tested authorization bypass techniques (empty Bearer token, `Authorization: Bearer null`, X-Original-URL header injection)
- Tested the backup endpoint with forged headers
- **Constrained by**: Same cold-start connectivity issue

## Tooling
`katana`, `ffuf`, `dirsearch`, `arjun`, `nuclei`, `httpx`, `js-beautify`, `curl`, custom Python scripts

# Technical Analysis

# Technical Analysis

## Infrastructure Overview

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Frontend | React 18 SPA (Vite build) | Vercel CDN |
| Backend API | Node.js / Express + Helmet.js | Render.com (free tier) |
| WAF | Cloudflare | In front of API |
| Images | Cloudinary | External CDN |
| Real-time | Socket.io v4 | On API host |

## Authentication Architecture

The platform uses a dual-token model:
- **Staff authentication**: JWT Bearer token (stored in-memory as JS variable, not localStorage), refreshed via `POST /api/v1/auth/refresh` with `credentials: include` (cookies also sent)
- **Guest/table authentication**: Session token derived from a table QR token (`POST /api/v1/public/table-sessions`), stored in `sessionStorage`
- **Rate limiting**: 10 login requests per 15 minutes per IP; 30 table session creations per hour
- **Origin enforcement**: `POST /api/v1/auth/login` and related auth endpoints require `Origin: https://icsa-web.vercel.app` — however, sending `Referer: https://icsa-web.vercel.app/` without an `Origin` header bypasses this check

## Identified High-Priority Attack Surfaces

### 1. Database Backup Endpoint
`GET /api/v1/app/dashboard/backup` is triggered via `window.location.href` redirect in the frontend (browser file download). The JS bundle does not enforce any role-check on the client side beyond general authentication. If the server-side role check is missing or insufficient (e.g., any authenticated staff role can trigger it rather than only OWNER/PLATFORM_ADMIN), this endpoint could expose a full database backup to lower-privilege accounts (WAITER, CASHIER, KITCHEN).

### 2. Staff Password Reset IDOR
`POST /api/v1/app/staff/:id/reset-password` accepts a staff member ID in the path. If the backend does not verify that the requesting user owns or manages the target staff account (i.e., same restaurant, appropriate role), any authenticated staff member could reset another staff member's — or even the restaurant owner's — password, resulting in account takeover.

### 3. Cloud Upload Credentials Exposure
`POST /api/v1/app/menu/images/upload-credentials` returns Cloudinary upload credentials. If these credentials are not scoped to a specific upload path/folder, or if they are long-lived, an attacker with any authenticated staff session could use them to upload arbitrary content to the application's image store.

### 4. Socket.io Unauthenticated Channel Join
The Socket.io endpoint at `wss://icsa.onrender.com/socket.io/` is publicly reachable. The client emits `join_restaurant <restaurantId>` and `join_order <orderId>` events. If the server does not verify authentication on these events, unauthenticated clients could subscribe to real-time order and restaurant data streams for arbitrary tenants.

### 5. Frontend CSP Weakness
The frontend's Content Security Policy (delivered via HTML meta tag) includes `unsafe-inline` and `unsafe-eval` in the `script-src` directive. This means that any reflected or stored XSS vulnerability found in the frontend would execute without CSP interference.

### 6. CORS Referer Bypass
The `Origin` header check on auth endpoints can be bypassed by supplying a `Referer: https://icsa-web.vercel.app/` header without an `Origin` header. While not exploitable for cross-origin browser-based attacks on its own, it weakens the origin-based validation layer.

### 7. mustChangePassword Flag Enforcement
The frontend redirects staff with `mustChangePassword: true` to a password-change page. It is unknown whether the backend API enforces this restriction at the middleware level or relies solely on the frontend redirect. If only the frontend enforces it, a staff account in this state could use its token directly against API endpoints without completing the password change.

## Security Controls Observed

| Control | Status |
|---------|--------|
| HSTS | ✅ Enabled (max-age=31536000) |
| Cloudflare WAF | ✅ Active on API |
| Helmet.js headers | ✅ Well-configured |
| Rate limiting (auth) | ✅ 10 req/15min |
| CORS (REST API) | ✅ Strict — Vercel origin only |
| JWT in-memory storage | ✅ Not in localStorage |
| Source maps | ✅ Blocked (403) |
| API docs exposed | ✅ None (all 404) |
| Frontend CSP | ⚠️ unsafe-inline + unsafe-eval |
| Socket.io auth | ❓ Unverified |
| Backup endpoint role check | ❓ Unverified |
| Staff reset IDOR check | ❓ Unverified |

# Recommendations

# Recommendations

## Immediate Actions

**1. Enforce role-based access on the backup endpoint**
Restrict `GET /api/v1/app/dashboard/backup` to OWNER and PLATFORM_ADMIN roles at the server-side middleware layer. Validate that no lower-privilege role (WAITER, CASHIER, KITCHEN, MANAGER) can trigger a backup download. Log all access attempts to this endpoint.

**2. Fix staff password reset IDOR**
On `POST /api/v1/app/staff/:id/reset-password`, verify server-side that:
- The requesting user belongs to the same restaurant as the target staff member
- The requesting user holds a role that is authorized to reset passwords (OWNER or MANAGER only)
- A lower-privilege staff member cannot reset the credentials of an equal or higher-privilege account

**3. Scope and rotate cloud upload credentials**
The credentials returned by `POST /api/v1/app/menu/images/upload-credentials` must be:
- Short-lived (signed upload presets, not permanent API keys)
- Scoped to a specific Cloudinary folder per restaurant tenant
- Never reusable across tenants

Audit the Cloudinary configuration to ensure credentials cannot be used for arbitrary uploads outside the restaurant's assigned namespace.

**4. Authenticate Socket.io channel joins**
Require a valid authentication token before processing `join_restaurant` and `join_order` events on the Socket.io server. Validate that the requesting user is authorized to observe the specific restaurant or order they are attempting to join. Unauthenticated or cross-tenant subscriptions must be rejected server-side.

**5. Enforce `mustChangePassword` at the API layer**
Add server-side middleware that checks the `mustChangePassword` flag on the authenticated user's session and returns a `403 Forbidden` response on all non-password-change endpoints until the flag is cleared. Do not rely solely on the frontend redirect.

## Short-term Actions

**6. Harden the frontend Content Security Policy**
Remove `unsafe-inline` and `unsafe-eval` from the frontend CSP `script-src` directive. Migrate any inline scripts to external files and eliminate `eval()` usage. Use nonces or hashes for any unavoidable inline content. This ensures that XSS vulnerabilities cannot execute arbitrary JavaScript.

**7. Strengthen origin verification**
The current `Origin` header check can be bypassed via the `Referer` header. Ensure the server validates the `Origin` header exclusively (ignoring `Referer` as a substitute) and rejects requests where `Origin` is absent on state-changing auth endpoints.

**8. Validate platform endpoint authorization**
Confirm that all `/api/v1/platform/*` endpoints enforce PLATFORM_ADMIN role at the middleware level and cannot be accessed by OWNER, MANAGER, or other restaurant-scoped roles — even with a valid JWT.

**9. Migrate backend from free-tier hosting**
The Render.com free tier introduces cold-start delays that affect both user experience and security tooling (monitoring, alerting, logging). Upgrading to a paid tier ensures consistent availability and removes the reliability gap that also hampered this security assessment.

## Medium-term Actions

**10. Implement centralized authorization middleware**
Consolidate role and resource ownership checks into reusable middleware applied consistently across all protected routes. A deny-by-default policy should require explicit grant of access rather than relying on each endpoint to implement its own checks independently.

**11. Conduct a follow-up assessment with authenticated access**
The highest-impact vectors (backup endpoint, staff IDOR, Socket.io auth, upload credentials) require an authenticated session to validate fully. A follow-up assessment using test credentials for each role level (WAITER, CASHIER, KITCHEN, MANAGER, OWNER) would confirm or rule out each identified risk.

## Retest Guidance
After remediating items 1–5, re-test each endpoint with tokens for every role (WAITER, CASHIER, KITCHEN, MANAGER, OWNER) to confirm that role boundaries are enforced correctly. Use a stable (non-free-tier) hosting environment during retesting to eliminate cold-start interference.

