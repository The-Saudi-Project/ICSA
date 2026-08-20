# UX / UI Analysis — Restaurant Self-Ordering Platform

**Date:** 2026-08-19
**Scope:** All five product surfaces plus platform admin, judged against the approved design direction in `DESIGN.md`.
**Method:** Static analysis of `apps/web/src` cross-checked against a live observation log captured by driving the running app (desktop 1280 + mobile 375, dark + light). A second live pass (log addendum) covered the Platform surface and the full customer order flow (cart-with-items → place order → status → my-orders), so every surface in this report is grounded in live evidence. Visual facts from the live log are treated as ground truth. No dev server was started for this analysis.

---

## 1. Executive Summary

### What is strong

- **The customer menu is genuinely good.** Rich item cards (photo, allergens as "Contains: …", kcal, prep time, tabular gold prices), a sold-out pattern that stays readable instead of presenting a dead button (`routes/Menu.tsx:311-317`), quick-add vs. forced-choice logic driven by whether a modifier group is required (`Menu.tsx:240`), and haptic feedback on add. This is well above the plain-list baseline.
- **The safety-critical engineering shows up in the UI.** Idempotency keys generated once per checkout attempt (`lib/format.ts:33`), `expectedCurrentStatus` on staff transitions, snapshots rendered from the order not the menu, no price/table/restaurant in any customer request, and the `fetchStaffImage` object-URL pattern for authenticated images.
- **State communication on OrderStatus is the best screen in the app**: `aria-live="polite"` status card, socket push with 5s polling fallback that stops on settled states (`OrderStatus.tsx:109-111`), full skeleton, per-status semantic colour, notification opt-in.
- **Role architecture is clean and singular**: `lib/roles.ts` is genuinely the one table both the guard and the sidebar consult, with a documented redirect-loop terminal state (`App.tsx:128-148`).
- **Forms in the admin menu editor mirror server validation client-side** (`MenuItemEditor.tsx:62-78`) with human error copy — the right way to do it.
- Kitchen forced-dark (`.surface-kiln`), huge ticket typography, rush-first sorting, and per-status coloured advance buttons are the right instincts for a kitchen display.

### What is weak

1. **A family of ~12 CSS classes/tokens is referenced but never defined** (`bg-mesh`, `glass-strong`, `animate-float`, `animate-gradient`, `spin-slow`, `animate-shake`, `animate-slide-down`, `animate-slide-right`, `animate-pulse-slow`, `btn-secondary`, `hide-scrollbar`, `--ease-out-strong`). Consequences range from cosmetic (no float on empty-state art) to severe: the login/NoTable/ChangePassword "glass cards" have **no surface at all**, and the table-entry welcome text is left at `opacity: 0` **forever** because the `ow-rise` animation shorthand is invalidated by the missing `--ease-out-strong` variable. The signature moment of the product renders as a blank screen with a static ring.
2. **Colour contrast fails WCAG AA at the most important points.** Dark-mode primary buttons are white-on-emerald-gradient at **2.54:1 → 1.92:1** — every "Add", "Place Order", "Add to Order" in the default theme fails even the large-text minimum. Allergen text in light mode is **2.15:1**. Prices in light mode are **2.94:1**. `--color-ink-faint` fails in *both* themes (~2.6:1) and is used for real content.
3. **The i18n system exists but the staff surfaces don't use it.** `locales/en.ts` contains keys for the dashboard, kitchen and cashier (`goodMorning`, `needsPayment`, `boardClear` …) that no component calls; Dashboard, Cashier, Kitchen, Waiter, all six admin pages and both platform pages are hard-coded English. The عربي toggle in the sidebar changes nothing on the screen it sits in.
4. **Destructive/irreversible actions lack guardrails on staff surfaces**: platform tenant Suspend is one un-confirmed click; staff password reset is one un-confirmed click; the platform one-time password can be destroyed by a stray backdrop click; staff mutations fail silently (kitchen advance, cash confirm).
5. **Money communication has two trust-breaking copy defects**: printed receipts carry a hard-coded fake VAT registration number and the wrong merchant name (`components/ReceiptPrint.tsx:11,47,57`) — a compliance problem, not a polish problem — and the order-status page tells an *unpaid* cash customer "**Payment Confirmed**" (live-confirmed: status `CONFIRMED` with `paymentStatus CASH_PENDING` under kitchen-before-payment), while `/my-orders` labels the same order "CONFIRMED".

### Top 5 priorities

1. **Define or remove the missing CSS utilities** — restores the entry moment, login card, toast/drawer/ticket animations, and the Cashier History button in one file (`styles/theme.css`).
2. **Fix dark-mode primary button contrast and the light-mode allergen/price/faint-text colours** — tokens only, no component changes.
3. **Fix the two money-copy lies**: the receipt (tenant name, real VAT number, actual rate — it prints on paper handed to customers) and the order-status "Payment Confirmed" headline shown to unpaid cash customers (a two-string locale change).
4. **Repair the always-offline health page and the two 401-ing download links** (tables CSV export, database backup).
5. **Wire the staff surfaces through `t()`** — the keys already exist; this is the single biggest step toward the bilingual product the UI already promises.

---

## 2. Surface-by-Surface Analysis

### 2.1 Customer ordering (mobile-first)

**User goal:** sit down → tap tag → understand menu → configure a dish → order → track. No account, no app.

**Click path (from code):**
`/t/:token` (`TableEntry.tsx`, token exchanged once, ~900ms branded sweep) → `/menu` (`Menu.tsx`) → `/item/:id` (`ItemDetail.tsx`, modifiers/qty/note) → toast + back to `/menu` → floating cart bar → `/cart` (`Cart.tsx`, review + kitchen note) → `POST /public/orders` with `Idempotency-Key` → `/order/:publicId` (`OrderStatus.tsx`, live status) → optionally `/my-orders` (`MyOrders.tsx`). `/` (`NoTable.tsx`) catches sessionless visits.

**Information architecture:** Flat and correct for the job — no nav chrome, back-chevrons only, cart entry via a floating bar that only exists when the cart is non-empty (`Menu.tsx:191-208`). Category quick-jump chips scroll-to-section (`Menu.tsx:114-128`). Good.

**Visual hierarchy:** Strong on the menu (name > description > facts > price row) and item detail (full-bleed hero, content sheet at `-mt-16` over a gradient blend). Prices are consistently gold-on-dark via `<Price>` — distinctive and scannable.

**What's broken or creates friction:**

- **Entry screen text invisible (code-level defect, high confidence).** `.ow-rise` sets `opacity: 0` then animates with `var(--ease-out-strong)` (`styles/openwork.css:119-121`) — a variable defined nowhere. An invalid `var()` invalidates the whole `animation` shorthand, so the animation never runs and opacity stays 0. "Welcome / {restaurant} / No app, no sign-up" never appears; users see a background and a *non-spinning* ring (the `spin-slow` keyframes are also undefined, `TableEntry.tsx:85`). Ironically, `prefers-reduced-motion` users *do* see the text (`openwork.css:140-145` forces `opacity: 1`). Fix: define `--ease-out-strong` in the `@theme` block of `styles/theme.css` (or replace with existing `--ease-normal`).
- **"Add to Order" truncates to "Add to Or…"** (confirmed live, issue #5). The label span is `truncate whitespace-nowrap` inside a `flex-1` button competing with the qty stepper and price (`ItemDetail.tsx:337-348`). Fix: on `<sm` drop the inline price from the button (total is one tap away), or use the shorter key `addToOrder` → "Add · {price}". The `ar` translation ("إضافة للطلب") will hit the same wall — test both.
- **Sticky action bar overlaps the last modifier option** (confirmed live, issue #6). The scroll body has `pb-32` (`ItemDetail.tsx:114`) which *should* clear the ~100px bar, but the live session observed "Wheat +2.00" trapped behind it. Make clearance robust: measure the bar (it already renders `sm:p-4` + safe-area) and set `padding-bottom: calc(<bar-h> + env(safe-area-inset-bottom) + 16px)` via a CSS var, and add `scroll-margin-bottom` to option rows so keyboard/assistive focus scrolls clear.
- **A search with zero hits renders a blank page.** Categories with no matches return `null` when a search is active (`Menu.tsx:172`), and the "No items found" state only fires when the *restaurant* has no categories (`Menu.tsx:154`). Add a "Nothing matches '{query}'" state + a clear-search button.
- **Sticky offsets are measured constants.** Category headers stick at `top-[150px]` with `scroll-mt-[160px]` (`Menu.tsx:216-217`), but the app header's height varies with the wait-time row, search and chips (~190px on 375px). Category titles will slide under the header or leave a gap. `DESIGN.md` and `CLAUDE.md` both mandate `--app-header-h` — **which appears nowhere in the codebase**. Introduce it for real.
- **Cart "Place Order" hover state erases itself**: `bg-accent hover:bg-accent-wash` (`Cart.tsx:121`) turns a solid emerald button into a 10-15% wash while the text stays white — near-invisible on light theme desktops. Should be `hover:bg-accent-dim`.
- **`aria-label` renders "Remove [object Object]"** — `line.name` is a `{en, ar}` object (`Cart.tsx:171`). Use `line.name?.en`.
- **"Payment Confirmed" shown to customers who have not paid** (live-confirmed on order #001). `headline()` maps order status `CONFIRMED` → `stateConfirmedTitle` = "Payment Confirmed" (`OrderStatus.tsx:80-81`, `locales/en.ts:73`). With *"Kitchen starts preparing before cash payment is confirmed"* enabled (this tenant's setting), a cash order reaches `CONFIRMED` while `paymentStatus` is still `CASH_PENDING` — so the biggest headline on the page asserts a payment that hasn't happened. A customer can reasonably walk out believing they've paid. Meanwhile `/my-orders` labels the same order "CONFIRMED" — the two customer screens disagree about the same state. *Fix:* change `stateConfirmedTitle`/`stateConfirmedDetail` to "Order Confirmed / Your order is in the queue" in `en.ts` and `ar.ts` (payment language should only ever come from `paymentStatus`, which the customer view doesn't currently expose — if it ever does, branch the copy on it); and give `/my-orders` the same humanised label via a shared `statusLabel()`.
- **Cart shows a bare Total with no VAT line** (live-confirmed). KSA customers expect the VAT position stated; `walkthrough.md` §1.5 promises "subtotal, 15% VAT, and the grand total, clearly broken out". The locale keys already exist unused — `includesVat` ("Includes {0}% VAT…") and `addedVat` (`locales/en.ts:45-46`) — and the session carries `vatRatePercent` + `pricesIncludeVat` (`lib/session.ts:31`). One caption line under the Total (`Cart.tsx:103-107`) closes the gap without inventing client-side money maths.
- **Review modal is off-system**: `alert()` for success and error (`OrderStatus.tsx:24-29`), hard-coded English, no dialog role/focus trap, star buttons without labels. The toast system already exists — use it.
- **Skip link and route-change focus are broken on customer pages.** `App.tsx:59` renders a "Skip to main content" link to `#main`, and `FocusManager` focuses `#main` on navigation — but only `OrderStatus.tsx:262` and `StaffLayout.tsx:302` have `id="main"`. Menu, ItemDetail, Cart, MyOrders don't.
- **MyOrders is the least finished customer screen**: raw enum status pills (`CASH_PENDING`, and live-confirmed "CONFIRMED" — contradicting the status page's "Payment Confirmed" for the same order), a two-colour scheme where CANCELLED renders as info-blue (`MyOrders.tsx:58-62`), hard-coded English loading/empty/error strings, an unlabeled icon back-button, and physical `mr-4`.
- **What the live order-flow pass confirmed working well:** the qty-1 trash-icon swap on the cart stepper reads clearly; the sticky Total + "Add more"/"Place Order ›" footer is the right structure; the status page's stepper (Ordered ✓ → Confirmed ✓ → Being made → Ready), wait-time chip and "Placed just now" all rendered as designed.

**Empty/loading/error states:** Menu skeleton is proper (`MenuSkeleton`), cart-empty state is polished (3D tray + CTA), order-status has a full skeleton, entry failure shows a calm identical-404 card. Good coverage; the one hole is the search-empty case above.

### 2.2 Cashier / Till

**User goal:** see what needs payment, take cash fast, hand over ready orders, reprint receipts.

**Click path:** `/cashier` (`Cashier.tsx`) — three sections: *Needs Payment* → tap Confirm → cash modal (amount received / change due) → `confirmCash`; *Ready for Handover* → Print / Refund; *In Progress* read-only. `+ New Order` → `/cashier/pos` (`WaiterPOS.tsx`). History → `OrderHistoryModal` (date-filtered, reprint).

**What works:** The three-lane structure matches the cashier's mental model; the change-due calculator (`Cashier.tsx:184-191`) is a genuinely useful touch; left status-colour rails and counts per section scan well; history reprint flow is sound (`ReceiptPrint` + `window.print`).

**Friction and defects:**

- **The History button has no styles**: `btn-secondary` (`Cashier.tsx:222`) is not defined anywhere — it renders as bare text with padding next to a fully-styled gradient "New Order". Confirmed visually as inconsistent in the live log.
- **Silent failures on the money path.** `takePayment`'s `onSettled` closes the modal and clears state whether it succeeded or failed (`Cashier.tsx:125-132`). A failed cash confirmation looks identical to a successful one until the list refreshes. Add `onError` → error toast, keep the modal open.
- **"Amount received" validates nothing.** "Confirm Paid" is enabled with an empty or insufficient amount — the field is purely decorative. Fine for speed, but then it should not look like a required step; either gate the button on `amount >= total` or visually mark the field as an optional change calculator.
- **The Refund button's icon is a house** (`Cashier.tsx:318` — the `M3 9l9-7 9 7…` home glyph). Refund also uses `window.confirm` while payments get a designed modal.
- **Every socket event beeps.** `order_updated` fires `playAlertBeep()` (`Cashier.tsx:109-112`), so kitchen progress updates make the till chirp, not just new work.
- Whole surface is hard-coded English; keys like `needsPayment`, `readyHandover`, `nothingToPay` already exist in `locales/en.ts:139-153` unused.
- **POS (`WaiterPOS.tsx`, shared with waiter) cannot sell configured items.** The cart is `Record<itemId, qty>` and always submits `modifiers: []` (`WaiterPOS.tsx:41`); an item with a required group will be rejected by the server *after* the cashier builds the order, surfacing as a raw error string (`WaiterPOS.tsx:145`). Either filter such items out with a "needs options — use customer flow" badge, or add a minimal option picker. Also: no search, English-only names, `money()` without the `<Price>` treatment, and no VAT-inclusive total preview (cashier later collects grand total, not the subtotal shown).

**Empty states:** Section-level dashed placeholders are good; the surface-level "All clear!" uses the checkerboard-PNG asset (issue #4, below).

### 2.3 Kitchen display

**User goal:** see new tickets instantly from meters away, advance them with big targets, keep an eye on load.

**What works:** Forced dark via `.surface-kiln` regardless of theme (`Kitchen.tsx:150`, `theme.css:503-510`) — the right call, documented in `DESIGN.md`. 5xl ticket numbers, big per-status advance buttons coloured by `toneFor`, rush pinning with a red top strip, per-ticket age with a 15-minute lateness flip, table grouping toggle, editable wait-time that broadcasts to customers, sound chime on new orders, socket + invalidate.

**Defects:**

- **The global Enter shortcut fires while typing.** A `window` keydown listener advances the oldest actionable ticket on every Enter press (`Kitchen.tsx:111-127`) — including Enter inside the wait-time `<input>` (`Kitchen.tsx:178`), where the natural gesture is "type 20, press Enter to save". Result: pressing Enter to save the wait time *starts cooking someone's order* and doesn't save the wait time. Guard with `if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select')) return`, and make Enter in the wait-time field save it.
- **Advance failures are silent.** `advance` has only `onSettled` invalidate (`Kitchen.tsx:105-109`). When two cooks tap the same ticket, the second `findOneAndUpdate` correctly fails server-side — and the UI says nothing. Add an `onError` toast ("Ticket already moved").
- **The new-ticket attention ring doesn't pulse**: `animate-pulse-slow` (`Kitchen.tsx:243`) is undefined. Either define it or use Tailwind's `animate-pulse`.
- **Wait-time edit affordance is a clickable `<div>`** (`Kitchen.tsx:183`) — no keyboard access, no button semantics.
- Ticket lines render `nameSnapshot.en` only (`Kitchen.tsx:296`) — an Arabic-speaking kitchen crew gets English-only tickets even though `ar` snapshots exist.
- Hover-dependent styles (`hover:-translate-y-1` on cards, hover reveals) are wasted on what is almost certainly a touch screen.

**Empty state:** clear copy ("Board is clear / Waiting for new tickets…") but the chef-hat PNG has the baked-in transparency checkerboard (issue #4).

### 2.4 Waiter

**User goal:** know what's READY, deliver it, occasionally punch in an order.

`Waiter.tsx` is a leaner Kitchen clone (also forced-dark `surface-kiln`): READY-first sort, non-ready tickets dimmed to 70%, one action ("Mark Delivered") only on READY. That focus is right.

**Issues:** same silent `advance` failure; same undefined `animate-pulse-slow`; whole surface English-only; **the empty state is a flat outline smiley** (`Waiter.tsx:116-123`) while sibling surfaces use rendered 3D artwork — the inconsistency called out in the live log (issue #7). The `+ NEW ORDER` button leads to the same modifier-less POS as the cashier's.

One design question worth raising: the waiter board being forced-dark makes sense for a wall display, but waiters use handhelds in bright dining rooms — the global light theme is arguably *more* appropriate here than in the kitchen. Recommend letting the waiter surface follow the global theme.

### 2.5 Admin / Owner

**User goals:** watch today's numbers, edit the menu mid-service, manage tables/QR/NFC, staff accounts, settings, history.

**IA / navigation:** `StaffLayout.tsx` sidebar (Management / Operations sections, role-filtered through `mayVisit`) is coherent, and the mobile hamburger drawer mirrors it. Two problems: (1) the mobile drawer omits the footer block, so theme toggle and Change Password are unreachable on mobile (sign-out survives in the header); (2) **two dead navigation systems still exist** — `AdminShell.tsx`'s default export renders a whole alternative "Restaurant Admin" header with tabs that no route mounts, and `StaffChrome.tsx` is imported nowhere. Dead chrome invites divergence; delete both shells and keep the exported helpers (`AdminSection`, `Field`, `inputClass`…) in a neutral module.

**Dashboard (`Dashboard.tsx`):**
- Warm greeting, decent KPI grid, highlighted Active Tickets card with live ping — good hierarchy.
- **Revenue renders as bare `0.00`** — `formatHalalas` without currency or the `<Price>` component (`Dashboard.tsx:76`), violating the "all money through `<Price>`" convention and reading ambiguously.
- Chart: colours correctly ride CSS variables (theme-safe); server sends trend revenue already in SAR (`dashboard.service.ts:85`) so amounts are right. The live log caught a **tooltip open with no hover** (issue #10) — with no `defaultIndex` set, the likely culprit is a stale `activeIndex` after the animated area mount or a lingering synthetic pointer position; verify after upgrading recharts, and explicitly pass `<Tooltip active={undefined}>` nothing else — but do gate: if it reproduces, set `isAnimationActive={false}` on the `Area` as the known workaround.
- Hard-coded `en-US` date (`Dashboard.tsx:39`); the entire screen ignores `t()` despite `goodMorning`/`revenue`/`quickActions` existing in the locale files.
- The Kitchen quick-action icon is a plus-sign glyph (`M12 2v20 M2 12h20`) and Revenue/Cashier icons are **dollar signs** in a SAR-only market — swap for a neutral coins/banknote glyph or the SAR symbol.

**Menu editor (`AdminMenu.tsx` + `MenuItemEditor.tsx`):** the strongest admin page. Inline price edit with Enter/Escape (`PriceCell`), one-tap availability, "Arabic name recommended" nudges, category editor with sort-gap advice, delete blocked while items exist with an explanatory tooltip. Frictions: the editor opens in a section at the *top* of the page while Edit buttons live far down — desktop gets no auto-scroll (mobile does, `AdminMenu.tsx:426`); `window.confirm` for category delete while the rest of the app uses designed modals.

**Tables (`AdminTables.tsx`):** solid table with inline edit-row, QR modal, rotate-with-confirm. **The Export CSV control is a plain `<a href="/api/v1/app/tables/export">`** (`AdminTables.tsx:245`) — that endpoint requires a Bearer token (`tests/security/admin-surface.test.ts:54`), and anchors send none, so the flagship NFC-writing export 401s. Same bug class the repo's own CLAUDE.md warns about for `<img>`. Fix: fetch via `staffApi`/`rawBlob` → blob → object-URL download (the pattern `AdminHistory.exportCSV` already uses client-side).

**Settings (`AdminSettings.tsx`):** clear grouping with helper text under each checkbox — good form design. But: the **single Save button sits below all three sections** (`AdminSettings.tsx:144-153`), off-viewport at 1280×800 (live log: "No visible Save button"), with no dirty indicator, so VAT edits can silently never be saved. Success feedback is `alert()`. **"Download Backup" navigates the window to a Bearer-authenticated endpoint (`staffApi.ts:283-286`) — 401 for the same reason as the CSV link.** Recommend: sticky save bar with dirty-state, toast on success, authenticated blob download.

**Staff (`AdminStaff.tsx`):** role badges, contextual role hints while choosing (`ROLE_HELP`), `OneTimeSecret` pattern with "cannot be shown again" copy, self-disable prevented. Two guardrail gaps: **Reset Password fires on a single unconfirmed click** (`AdminStaff.tsx:207-214`) and immediately invalidates a colleague's credentials mid-shift; and the resulting one-time password renders inside the *Add someone* card at the top — reset from the bottom of a long team list and the secret appears off-screen.

**History (`AdminHistory.tsx`):** date + status filter, client-side CSV, detail modal, socket refresh — good bones. Raw status enums in both the filter and the table (`CASH_PENDING` shown to owners), no status colour coding, refund via `window.confirm`+`alert` and the modal doesn't invalidate the query after refunding (stale PAID until a socket event lands).

**Health (`AdminHealth.tsx`):** permanently lies — see finding P0-2.

### 2.6 Platform admin (now captured live — see log addendum)

`Platform.tsx` (overview KPIs / tenant directory / audit trail as pseudo-tabs off the URL) + `PlatformTenantDetail.tsx` (settings, staff, billing, features tabs). Live pass verified: Overview stat cards (Active Tenants 1 / Total Orders 8 / Total Revenue SAR 170.00 / Total Users 6), the Hotel Shaba tenant card with Suspend/Reset actions, and a working Security & Audit table with real rows (TOKEN_REFRESHED, USER_LOGIN, USER_LOGIN_FAILED).

- **Resolved during the live pass:** the Overview initially showed "Failed to load platform stats" because `GET /platform/analytics` returned 500 — a backend bug in `apps/api/src/core/tenant.ts` (`unscoped().aggregate()` didn't set the `unscoped` option, so the tenant-guard rejected the platform revenue pipeline). Fixed by adding `.option({ unscoped: true })`; verified 200 live. From a UX standpoint the incident is a reminder that this error state (`Platform.tsx:123-126`) is a bare one-liner card with no retry affordance — add one.
- **One subtitle serves three pages** (live-confirmed copy bug). "Manage tenants, view platform metrics, and monitor activity." renders identically under "Platform Console", "Tenant Directory" *and* "Security & Audit" (`Platform.tsx:95` — the `<p>` is static while the `<h1>` switches on `activeTab`). Make it per-tab: Overview → "Platform-wide metrics at a glance"; Tenants → "Provision, suspend and manage restaurants"; Security → "Who did what, across every tenant".
- **The tenant directory looks abandoned at low tenancy** (live: one small card in a large empty canvas). With `md:grid-cols-2` and one tenant, most of the viewport is dead space. Add a directory empty/sparse state that sells the next action (a ghost "Provision your next restaurant" card).

- **Suspend has no confirmation** (`Platform.tsx:214-221`). This is the single most destructive click in the product — it takes a paying restaurant offline mid-service — and it sits as a ghost button on every tenant card, one click, no dialog, no undo framing. Reset Password *does* confirm (`Platform.tsx:225`), which makes the asymmetry worse. Require a typed-slug confirm dialog for suspend.
- **The one-time owner password can be lost to a stray click.** The provision modal's backdrop closes it (`Platform.tsx:287`) even while the unrecoverable `secret` is displayed (`Platform.tsx:360-373`). Disable backdrop-close (and Escape) while a secret is on screen; reuse `OneTimeSecret` which forces an explicit "I have copied it".
- Tenant cards navigate via `div onClick` (`Platform.tsx:188-191`) — not keyboard reachable, no link semantics; wrap in a real `<Link>`.
- "Total Revenue" is `SAR {n.toFixed(2)}` (`Platform.tsx:150`) — hand-formatted money, against convention.
- Audit trail shows relative time + action + actor type only: no tenant column, no absolute timestamp (even as `title`), no filter/pagination — fine for a demo, thin for a real forensic view.
- `PlatformTenantDetail.tsx:35-42` syncs the settings draft with a render-time `setState` guard (`if (restaurant && !settingsDraft.nameEn …)`) — fragile (a tenant legitimately clearing a field re-triggers the sync); move to `useEffect` keyed on load, or key the form by `restaurant.id`.
- No empty state for a zero-tenant directory; loading is plain text. Acceptable for an internal tool, but this surface will onboard every future customer — the provision flow deserves the same polish as AdminStaff.

---

## 3. Cross-Cutting Analysis

### 3.1 Design system & tokens

`styles/theme.css` is a real token system: grounds/surfaces/borders/ink/accent/gold/status families exposed through a Tailwind v4 `@theme` block, runtime-valued in `:root`, `@media (prefers-color-scheme: dark)`, `.theme-dark`, `.theme-light`. Radii are consistent-ish (12 inputs / 20 cards / pills), elevation is tokenised (`--shadow-sm/md/lg/glass` + `--glass-highlight`), and glassmorphism is centralised in `.glass/.card-glass/.input-glass` with `blur(40px) saturate(150%)`.

**The accent-hue flip (confirmed issue #3) — verdict: documented as intentional, implemented with a drift bug, and a questionable call.**

The tokens, quoted:

```css
/* :root — the default (light) palette, theme.css:113 */
--color-accent: #059669;        /* Emerald 600 */

/* @media (prefers-color-scheme: dark) :root — theme.css:167 */
--color-accent: #10b981;        /* "Neon Emerald" */

/* .theme-dark — theme.css:217 */
--color-accent: #10b981;

/* .theme-light — theme.css:261 */
--color-accent: #4f46e5;        /* Indigo 600  ← the flip */
```

`DESIGN.md:31-40` explicitly blesses this: *"The theme embraces distinct brand colors for light and dark modes"* — emerald in dark, indigo in light, mesh gradients following suit. So it is **not an accidental token mapping**. But two problems remain:

1. **The implementation contradicts itself.** Bare `:root` (light) is *emerald* (`#059669`, emerald border-glow at `theme.css:107`, emerald/sky mesh at `:139-144`), while `.theme-light` is *indigo* with indigo/purple mesh (`:261, :283-288`). `ThemeProvider` (`lib/theme.tsx:33-48`) stamps a class after React mounts, so the `:root` values are what paint first (and what any pre-hydration or error state shows): a light-mode user gets an emerald flash that snaps to indigo. Whatever the brand decision is, `:root` and `.theme-light` must agree.
2. **The design decision itself deserves a challenge.** The accent *is* the brand here — logo tile, sidebar active states, every primary button, the live dots. Users toggling theme (a first-class control in the sidebar) watch the product change identity. For a multi-tenant SaaS whose tenants will eventually want their own accent, a single hue family with per-mode *lightness* variants (emerald-500 dark / emerald-600-700 light, which also fixes button contrast) is the safer system. If the two-brand look is kept, at minimum keep semantic anchors (success ≠ accent in dark mode — currently both are `#10b981`, so "success" and "brand" are indistinguishable on kitchen/cashier boards).

**Other token-level findings:**
- Dark mode `--color-accent == --color-status-success` (`#10b981`) — status colour loses meaning.
- `.theme-light` shadows differ from `:root` shadows (e.g. `--shadow-md`), another copy-drift axis; three near-copies of every palette (`:root` dark media block vs `.theme-dark`) will keep drifting — generate them from one source or use `@custom-media`/`light-dark()`.
- `Card` hover applies `translateY(-4px)` to *all* glass cards including non-interactive ones (`theme.css:468-472`) — cart line items levitate on hover with nothing to click.
- `text-h4` is used five times (`AdminStaff.tsx:288`, `AdminHistory.tsx:75,101`, `AdminMenu.tsx:383`, `AdminTables.tsx:597`) but the scale defines nothing between `h3` and `small` — these headings silently render at base size.
- `mie-2` (`OrderStatus.tsx:327`) is not a Tailwind class (`me-2` is) — the "2×" quantity runs into the item name.

### 3.2 Typography

- Stack is per design (`--font-sans: 'Inter', 'Tajawal', …`, `theme.css:10`) — but `DESIGN.md:47` says fonts load from Google Fonts via a `<link>` in `index.html`; in reality they're self-hosted through `@fontsource` imports in `main.tsx:1-6`. The reality is *better* (no third-party request, works offline with the PWA) — update DESIGN.md, and note the CSP (`font-src 'self' data:`) would have blocked the documented approach anyway.
- **Loaded weights don't match the scale.** `main.tsx` imports 400/700/900 for both families, but the scale demands **500** (small/caption/meta, `theme.css:15,19`), **600** (h3, `:26`) and **800** (display, `:41`) — plus components use `font-medium/semibold/extrabold` liberally. Browsers will map 500→400, 600→700, 800→900: metadata reads lighter than designed, h3s heavier, display maximal. Import the missing weights (or the variable fonts) — Tajawal has no 600/800/900, so define its mapping deliberately (Tajawal ships 500/700/800).
- Hierarchy in practice is good on customer surfaces; staff surfaces frequently bypass the scale with ad-hoc `text-4xl/5xl/6xl font-black` (Kitchen, Waiter, Cashier, Dashboard) — fine for display boards, but it means the `@theme` scale governs only half the app.
- Tabular numerals via `.tnum, th, td` (`theme.css:332`) — consistently applied to prices, counts, timers. Good.

### 3.3 Colour contrast & accessibility (WCAG AA)

Measured ratios (WCAG relative luminance):

| Pair | Ratio | Verdict |
|---|---|---|
| White on `btn-gradient` dark (emerald #10b981→#34d399) | **2.54 → 1.92:1** | Fails AA even for large text. Every primary CTA in default dark theme. |
| `--color-status-warning` #f59e0b on white (light) | **2.15:1** | Fails — this is the **allergen** "Contains: Coconut" text (`Menu.tsx:362-366`). |
| `--color-gold` #ca8a04 on white (light) | **2.94:1** | Fails for body-size prices (`Price.tsx:25`). |
| `--color-ink-faint` dark #475569 on #020617 | **2.66:1** | Fails — used for kcal/prep facts, captions, SAR suffix, placeholders. |
| `--color-ink-faint` light #94a3b8 on white | **2.56:1** | Fails, same usage. |
| White on `--color-status-warning` (Cashier "Confirm Paid", `Cashier.tsx:203`) | **2.15:1** | Fails. |
| `--color-ink-soft` (both themes) | 7.6–7.9:1 | Passes. |
| White on indigo #4f46e5 (light primary) | 6.29:1 | Passes. |

Fixes: dark primary buttons → gradient `#059669→#10b981` with the *text* checked against the lighter stop, or dark-ink text on bright emerald (the "neon on black" look survives); light-mode warning text → amber-700 `#b45309` (4.6:1); light gold → `#a16207` (already in the palette as `--color-gold-dim`); `ink-faint` → reserve for disabled/decorative only and promote real content to `ink-soft`, or darken the token to ~`#64748b`/`#5b6b81`.

**Beyond contrast:**
- **Positives:** global `:focus-visible` outline (`theme.css:337-341`), skip link (`App.tsx:58-63`), `FocusManager` route focus, `aria-live` status card, `role="alert"` on error banners, `role="progressbar"` with valuetext on `StateBand`, real `fieldset/legend` + visually-hidden radios on modifiers (`ItemDetail.tsx:209-237`), 44px+ tap targets on customer steppers/buttons, `sr-only` inputs paired with 24px visual controls.
- **Gaps:** `Input` component's label has no `htmlFor`/`id` and errors aren't `aria-describedby`-linked (`components/ui/Input.tsx:12-24`) — every form built on it (all of Platform provision, cart note, item note) has unlabelled inputs to a screen reader; **no modal in the app** (cash confirm, order history, review, staff/menu mobile sheets, provision) has `role="dialog"`, `aria-modal`, focus trap or Escape handling; toasts lack `role="status"` (`ToastContext.tsx:39`) so "Added to cart" is never announced; icon-only buttons missing names (MyOrders back `MyOrders.tsx:21`, mobile theme/locale buttons `StaffLayout.tsx:291-296`, POS remove `WaiterPOS.tsx:125`); `#main` missing on most pages (§2.1); quick-add's "Added" flip isn't announced; kitchen wait-time edit is a click-div; tenant cards are click-divs; `<meta name="color-scheme" content="dark">` in `index.html:6` forces dark UA form controls/scrollbars even in light theme — set it to `light dark` and let the themes declare `color-scheme`.

### 3.4 Internationalisation & RTL

**Verdict: real infrastructure, half-adopted product.** RTL is more than a stub but far from done.

- **Infrastructure (good):** `I18nProvider` persists locale, sets `document.documentElement.lang` and `dir` (`lib/i18n.tsx:37-40`); full `en`/`ar` dictionaries with typed keys and `{0}` interpolation; Tajawal in the stack; `body[dir="rtl"] { text-align: right }` base rule.
- **Customer surface:** genuinely bilingual — menu names/descriptions/modifiers render `name[locale] ?? name.en` throughout, admin nudges push tenants to enter Arabic. Remaining gaps: "View", "Wait: ~15m", "Need Assistance?" block (`Menu.tsx:79,185-186,308`), "Placing Order…" (`Cart.tsx:124`), stepper aria-labels, `StateBand` stage labels (`Openwork.tsx:43-48`), the entire ReviewModal, MyOrders strings, `relativeTime()` (`format.ts:18-25` — English-only and Arabic pluralisation is non-trivial; use `Intl.RelativeTimeFormat`).
- **Staff surfaces:** the sidebar labels translate; essentially nothing else does (§1-weak-3). Kitchen tickets ignore the `ar` snapshot entirely.
- **Logical properties:** the convention holds in some places (`start-3` search icon, `ms-1` in Price, `text-start` table headers, `start-4 end-4` popover) but **64 physical-direction utilities across 21 files** (`ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`) violate it — e.g. Cashier's status rails `left-0`, Kitchen rush button `-right-4`, ChangePassword layout, AdminHealth `pl-4`. Directional chevrons are hard-coded left-pointing SVGs everywhere (back buttons, table row affordances) and won't mirror; `SwipeableItem` only recognises left-swipe (`SwipeableItem.tsx:33`). None of this blocks Phase 1, but each one is Phase 2 rework the conventions were written to prevent. Recommend an ESLint ban (`no-restricted-syntax` on those class patterns) now.
- Numbers/dates: `toLocaleDateString('en-US')` (Dashboard), bare `toLocaleString()` elsewhere; money is western-digit "12.50 SAR" — fine as a product decision for Phase 1, but make it a decision, not an accident.

### 3.5 Motion & performance

`DESIGN.md` leans hard on motion; the implementation splits into **play-once** (fine) and **loop-forever** (the problem the live log measured as "the page never goes idle", issue #9):

| Loops forever | Where | Notes |
|---|---|---|
| `mesh-movement` 20s `infinite alternate` | `.bg-mesh-deep` on `<body>` (`index.html:13`, `theme.css:320`) | Every page, every surface, plus `background-attachment: fixed` (repaint-heavy on mobile). **Not covered by any reduced-motion block.** |
| `animate-pulse` live dots | Menu header (`Menu.tsx:70`), Kitchen "New" counter, Waiter "Ready" counter, OrderStatus skeletons | Tailwind built-in, honours nothing by default. |
| `animate-ping` | Dashboard active-tickets dot (`Dashboard.tsx:100`) | Conditional on activity — acceptable. |
| `animate-spin` loaders | various | Legitimate while loading. |
| `shimmer` 1.5–2s | `.skeleton::after`, `.animate-shimmer` | Correctly disabled under reduced motion (`theme.css:611-615`). |
| `SoundToggle` 2s `setInterval` | every staff board (`SoundToggle.tsx:12-15`) | JS timer that never stops, even after unlock succeeds. |

Play-once set (`slide-up`, `fade-in`, `stagger`, `ticket-enter`, `ow-rise/ow-sweep`) is well-built with `both`/`forwards` fills and *is* gated behind `prefers-reduced-motion` (`theme.css:522-530, 611-615`, `openwork.css:134-152`).

**Recommendations:** add `.bg-mesh-deep { animation: none; background-attachment: scroll }` under reduced motion; pause the mesh on customer mobile entirely (a static gradient reads identically through 40px-blurred glass); replace pulsing dots with a static dot + pulse only on state *change*; clear the SoundToggle interval once unlocked. This directly serves the log's testability complaint and phone battery life.

**Bundle/runtime notes:** routes are properly lazy-loaded with a neutral fallback; recharts ships only in the Dashboard chunk — acceptable; the PWA (`vite.config.ts`) caches Cloudinary images CacheFirst for 30 days — good for menus; **manifest `icons: []`** means an installed PWA gets a blank icon (cashier tablets are exactly the install case); `chunkSizeWarningLimit: 220` shows the 60KB-gzip customer budget is being watched. The `ItemDetail` hero `<img>` has no dimensions/aspect placeholder → CLS on slow menus (minor; the container has `aspect-[4/3]`, so this is covered — verified fine).

### 3.6 Responsive behaviour

- Staff shell: `md:` sidebar ↔ hamburger drawer works, and the second live pass confirmed the breakpoint behaviour explicitly — hamburger at a 736px pane, full sidebar at ≥~1024px. **This is intended, correct responsive design, not a defect.** Two nits remain: the drawer lacks the footer controls (§2.5) and its `animate-slide-right` class is undefined so it pops rather than slides.
- Admin tables collapse to card lists with per-row action sheets on mobile (`AdminStaff`, `AdminMenu`, `AdminTables`) — a genuinely nice pattern, consistently implemented.
- Customer pages are mobile-first with `max-w-2xl` desktop framing; ItemDetail/Cart get a "device frame" treatment on `md:` (`rounded-[32px]` bordered panel) — coherent.
- Kitchen grid scales 1→4 columns to `2xl` for wall displays; header controls will wrap awkwardly between ~768-1100px (four pill clusters + title) — minor.
- WaiterPOS on mobile stacks the cart *below* the menu with `h-dvh overflow-hidden` (`WaiterPOS.tsx:57`) — on a phone the fixed-height split leaves the item grid a short inner scroll area with the cart consuming the bottom; worth a real pass if waiters will use phones.

### 3.7 Consistency audit

- **Empty states — three visual languages** (issue #7): premium 3D renders (cart, cashier, kitchen), flat outline icons in circles (waiter, history, tables), plain text (POS "No items added", staff "No staff found"). Pick the illustration system for surface-level empties and the icon-tile for section-level empties, and re-export the two checkerboard PNGs (issue #4): `public/images/empty_cashier.png`, `empty_kitchen.png` (`empty_cart.png` appears clean in the log).
- **Buttons — four competing systems**: `components/ui/Button` (variants/sizes), `AdminShell`'s `primaryButtonClass`/`quietButtonClass` strings, raw `btn-gradient` usage, and fully hand-rolled buttons (Cart submit, Kitchen advance, Cashier confirm). Plus the undefined `btn-secondary`. Consolidate on `Button`; keep the string classes only as a migration bridge.
- **Confirmation UX**: designed modals (cash confirm, rotate tag, delete table) vs `window.confirm` (refunds ×2, category delete, platform password reset) vs *nothing* (platform suspend, staff password reset). One `ConfirmDialog` component would fix guardrails and consistency simultaneously.
- **Feedback**: toast system (customer add-to-cart) vs `alert()` (settings saved, review submitted, backup failed, refund error) vs silence (kitchen/waiter/cashier mutation failures). Route everything through `useToast`.
- **Iconography**: all inline SVG (fine, no library) but with semantic errors — refund=house, kitchen=plus, currency=$ (three sites) — and no shared icon module, so the same glyph is copy-pasted with drift.
- **Money rendering**: `<Price>` (most places) vs `formatHalalas` raw (Dashboard KPI) vs `money()` raw (POS, receipts — receipts legitimately) vs `SAR ${n.toFixed(2)}` (Platform, chart tooltip). Convention says `<Price>` always.
- **Raw enums shown to humans**: MyOrders pills, AdminHistory table + filter, AdminHistory modal status card, OrderHistoryModal rows. One `statusLabel(status, t)` helper would fix all.
- **Dead code**: `AdminShell` default export, `StaffChrome`, unused locale keys, `text-h4`/`mie-2`/`btn-secondary` ghost classes — each one a trap for the next contributor.

---

## 4. The 15 Confirmed Live Issues — Expanded

1. **Health page always OFFLINE (bug).** `fetchHealth`/`fetchReady` call `staffApi('/health' | '/readyz')` which prefixes `/api/v1` (`lib/staffApi.ts:17,623-627`), but the API mounts these at server root; the Vite proxy only forwards `/api` (`vite.config.ts` proxy) and Vercel likewise. The SPA's HTML comes back, `parse()` returns null, and `AdminHealth.tsx:44,69` renders "Offline/Disconnected" forever — while polling every 5s. *Impact:* an owner's only self-serve diagnostic reads "down" while everything works — it destroys trust in the whole page. *Fix:* add authenticated `/api/v1/health` + `/api/v1/readyz` routes on the API (preferred — the page is admin-only anyway), or fetch absolute root paths and add proxy/rewrite rules for both environments.
2. **CSP `frame-ancestors` via `<meta>` is ignored** (`apps/web/index.html:10`). Browsers discard `frame-ancestors` (and `sandbox`) delivered by meta tag — the console says so on every load — so clickjacking protection is not active; the policy also allows `unsafe-inline`/`unsafe-eval` scripts and `connect-src https: http: ws: wss:` (any host). *Fix:* deliver CSP + `X-Frame-Options: DENY` as HTTP headers (Vercel `headers` config / Express `helmet` for API-served assets), tighten `connect-src` to self + the API origin, and keep the meta only as a fallback without frame-ancestors.
3. **Accent hue flips between themes.** Fully analysed in §3.1: intentional per `DESIGN.md:31-40`, but `:root` (emerald) vs `.theme-light` (indigo) drift guarantees a wrong-brand first paint, and dark mode's accent collides with `--color-status-success`. *Fix:* make `:root` match `.theme-light` verbatim; then decide — recommended — to converge on one hue family with per-mode lightness, which also resolves the button-contrast P0.
4. **Checkerboard baked into empty-state PNGs** (`public/images/empty_cashier.png`, `empty_kitchen.png`; referenced `Cashier.tsx:260`, `Kitchen.tsx:221`). The export included the editor's transparency grid, so it shows behind the object on any background. *Fix:* re-export with true alpha (and consider WebP; also note `animate-float` on them is an undefined class — they were never going to float).
5. **"Add to Order" truncates** — §2.1; `ItemDetail.tsx:339`. Drop the in-button price below `sm`, or shorten via locale key; verify Arabic label too.
6. **Sticky bar overlaps last modifier** — §2.1; `ItemDetail.tsx:114,301-352`. Measured-bar padding + `scroll-margin-bottom` on options.
7. **Inconsistent empty-state language** — §3.7; unify on one system, waiter (`Waiter.tsx:116-123`) is the odd one out.
8. **Staff login reads unbalanced at desktop widths** — observed twice, described differently each pass ("top-anchored with empty area below"; addendum: "card in a left panel with a large empty dark right panel, no brand art"). The code centres a single `max-w-sm` card (`Login.tsx:35-36`: `flex min-h-dvh items-center justify-center` + `mx-auto`) and git shows the file unchanged — so the imbalance is perceptual, and its root cause is that the card's class `glass-strong` is **undefined**: with no visible card surface, the eye reads only the floating form fields against a vast dark ground, and the emptiness dominates. *Fix in two steps:* (1) define `.glass-strong` (e.g. `.glass` + `--color-surface-strong` background + `rounded-3xl`) in `theme.css` — NoTable, TableEntry-error and ChangePassword use the same class and get fixed together — then re-verify; (2) since two independent passes still read the page as unfinished at 1280px, consider committing to a deliberate `lg:` split layout: form left, brand/value panel right (mesh + logo + one line of product promise), which is what the current rendering accidentally half-suggests.
9. **Perpetual animation / page never idle** — §3.5. The `<body>`-level 20s mesh loop with `background-attachment: fixed` is the main offender and is exempt from the reduced-motion blocks; the 2s SoundToggle poll and always-pulsing dots are the rest. *Fix:* gate the mesh behind reduced-motion and consider disabling it on the customer surface; stop the poll after unlock; pulse only on change.
10. **Dashboard chart tooltip open by default** (`Dashboard.tsx:149-153`). No `defaultIndex` is set, so this is emergent (recharts version behaviour or a synthetic hover left by mount animation). *Fix:* upgrade recharts, set `isAnimationActive={false}` on the `Area` if it reproduces, and confirm the `Tooltip` renders only on hover/touch. While in there: give the tooltip formatter locale-aware money via a shared helper instead of `SAR ${(value).toFixed(2)}`.
11. **Platform analytics 500 — resolved during the live pass.** `GET /platform/analytics` failed because `unscoped(Model).aggregate()` in `apps/api/src/core/tenant.ts` didn't set the `unscoped` option; the tenant-guard `pre('aggregate')` hook rejected the platform revenue pipeline. Fixed with `.option({ unscoped: true })`, verified 200 live. UX residue: harden the stats error card with a retry button (`Platform.tsx:123-126`).
12. **All three platform pages share one subtitle.** "Manage tenants, view platform metrics, and monitor activity." is static while the `<h1>` switches per tab (`Platform.tsx:95`). *Fix:* per-tab subtitle map — see §2.6.
13. **"Payment Confirmed" for an unpaid cash order** (live: order #001, status `CONFIRMED`, payment `CASH_PENDING`), and `/my-orders` disagrees, showing raw "CONFIRMED". *Impact:* customers can believe they've paid and walk out; two customer screens contradict each other about the same order. *Fix:* `stateConfirmedTitle` → "Order Confirmed" in `locales/en.ts:73` and `ar.ts`; humanise the `/my-orders` pill with the same shared label helper. Full analysis in §2.1.
14. **Cart has no subtotal/VAT line** (live-confirmed — only a Total). *Fix:* one caption line using the already-existing-but-unused `includesVat`/`addedVat` locale keys and the session's VAT settings — §2.1.
15. **Split-feel login with an empty right panel at desktop widths** — same root cause and fix as issue 8 above (undefined `glass-strong`, then optionally a deliberate `lg:` brand panel).

---

## 5. Prioritised Findings Table

**P0 — broken function, trust, or the primary action** (5) · **P1 — significant UX/accessibility/consistency defects** (20) · **P2 — polish, debt, conventions** (19)

| # | Pri | Surface | Issue | Impact | Fix | File(s) |
|---|-----|---------|-------|--------|-----|---------|
| 1 | P0 | All | ~12 referenced-but-undefined CSS classes (`glass-strong`, `bg-mesh`, `animate-float/gradient/shake/slide-down/slide-right/pulse-slow`, `spin-slow`, `btn-secondary`, `hide-scrollbar`, `--ease-out-strong`) | Entry-screen text stuck invisible; login/NoTable/ChangePassword have no card; toasts/drawer/tickets don't animate; History button unstyled | Define them in `theme.css` (or replace with existing utilities); add a CI grep for classes used-but-undefined | `styles/theme.css`, `styles/openwork.css:103,121`, `TableEntry.tsx:72-99`, `Login.tsx:35-36`, `Cashier.tsx:222` |
| 2 | P0 | Admin | Health page can never read healthy — fetches `/api/v1/health|readyz` which don't exist behind the proxy | Owner's diagnostic permanently reports outage; erodes trust in all admin data | Mount authed `/api/v1/health` + `/readyz` on API; or absolute fetch + proxy/rewrite rules | `lib/staffApi.ts:623-627`, `routes/staff/AdminHealth.tsx`, `vite.config.ts` |
| 3 | P0 | Cashier | Receipt prints hard-coded merchant "Restaurant Webapp", fixed "VAT (15%)" label, fake VAT No 310000000000003 | Incorrect tax invoice handed to customers; compliance risk in SA | Pull tenant name (en/ar), actual VAT rate and the tenant's registered VAT number from settings; blank line when absent | `components/ReceiptPrint.tsx:11,47,57` |
| 4 | P0 | Customer | Dark-mode primary buttons: white on emerald gradient = 2.54→1.92:1 | Every "Add"/"Place Order"/"Add to Order" fails AA even at large-text threshold in the default theme | Darken gradient stops (`#059669→#10b981`) or use dark ink text on bright emerald | `styles/theme.css:409-421,167-169` |
| 5 | P0 | Platform | Tenant Suspend is a single unconfirmed click | Takes an entire restaurant offline mid-service; sits beside routine buttons | Typed-slug confirm dialog + explicit reactivate framing | `routes/staff/Platform.tsx:214-221` |
| 6 | P1 | All | CSP `frame-ancestors` via `<meta>` ignored; `unsafe-inline/eval`, `connect-src` any host | No clickjacking protection; weak script policy | Real HTTP headers (Vercel/helmet): CSP + `X-Frame-Options: DENY`; tighten connect-src | `index.html:10` |
| 7 | P1 | Admin | Tables "Export CSV" anchor and Settings "Download Backup" navigate to Bearer-authed endpoints with no header → 401 | Two advertised admin features are broken (NFC-writing export is core setup flow) | Fetch via `staffApi` → blob → object-URL download | `AdminTables.tsx:245`, `staffApi.ts:283-286`, `AdminSettings.tsx:127-139` |
| 8 | P1 | All | Accent token drift: `:root` light = emerald, `.theme-light` = indigo; dark accent == status-success | Wrong-brand first paint; brand flips per theme; success/brand indistinguishable in dark | Sync `:root` with `.theme-light`; converge on one hue family (recommended) or separate success from accent | `theme.css:113,167,217,261`; `DESIGN.md:31-40` |
| 9 | P1 | Customer | Allergen text 2.15:1 (light), gold prices 2.94:1 (light), `ink-faint` ~2.6:1 (both themes) | Safety-relevant and money-relevant text unreadable for low-vision users | warning text → amber-700 in light; gold → `--color-gold-dim`; darken `ink-faint` / promote content to `ink-soft` | `theme.css:119,126,111,165`, `Menu.tsx:358-366`, `Price.tsx:25` |
| 10 | P1 | Kitchen | Global Enter shortcut advances oldest ticket — including while typing in the wait-time input | Editing wait time can start cooking an order; no shortcut discoverability | Ignore keydown from form fields; Enter saves wait time; show shortcut hint | `Kitchen.tsx:111-127,176-187` |
| 11 | P1 | Kitchen/Waiter/Cashier | Mutations fail silently (`advance`, `takePayment` closes modal on error) | Concurrency conflicts and network failures look like success on money/food paths | `onError` → toast; keep cash modal open on failure | `Kitchen.tsx:105-109`, `Waiter.tsx:55-59`, `Cashier.tsx:125-132` |
| 12 | P1 | Staff | Entire staff/admin/platform UI hard-coded English; existing locale keys unused | The bilingual promise (عربي toggle, Tajawal, Arabic data entry) stops at the sidebar | Wire `t()` through Dashboard/Kitchen/Cashier/Waiter/admin pages; keys largely exist | `Dashboard.tsx`, `Cashier.tsx`, `Kitchen.tsx`, `Waiter.tsx`, `Admin*.tsx`, `locales/en.ts:90-153` |
| 13 | P1 | Customer | ItemDetail: label truncation + sticky-bar overlap (live-confirmed) | Primary CTA unreadable; last modifier hidden | §4.5 / §4.6 | `ItemDetail.tsx:114,337-348` |
| 14 | P1 | All | No modal has dialog semantics, focus trap or Escape | Keyboard/SR users can tab behind modals; Escape does nothing | One `Dialog` primitive (`role="dialog"`, `aria-modal`, trap, Esc, restore focus) used everywhere | `Cashier.tsx:157`, `AdminHistory.tsx:11`, `OrderStatus.tsx:32`, `Platform.tsx:284`, mobile sheets |
| 15 | P1 | Customer | Search with no hits renders a blank menu | Dead-end with zero feedback | "No results for X" state + clear button | `Menu.tsx:154-177` |
| 16 | P1 | Platform | One-time owner password dismissible by backdrop click | Unrecoverable credential lost; owner must be re-reset | Block backdrop/Esc close while secret shown; reuse `OneTimeSecret` | `Platform.tsx:287,360-373` |
| 17 | P1 | Admin | Staff password reset: one click, no confirm; secret renders off-screen at top | Accidental credential invalidation mid-shift; secret easily missed | Confirm dialog; show secret adjacent to the person's row | `AdminStaff.tsx:207-214,148-156` |
| 18 | P1 | Staff | SoundToggle cannot turn sound off; polls `isAudioUnlocked` every 2s forever | Staff can't silence a noisy till/kitchen; needless timer | Real on/off state (mute flag in audio lib); clear interval after unlock | `components/SoundToggle.tsx` |
| 19 | P1 | Customer | Skip link & route-focus target `#main` missing on Menu/ItemDetail/Cart/MyOrders | A11y features silently no-op on the highest-traffic pages | Add `id="main"` to each page's `<main>` | `Menu.tsx:132`, `Cart.tsx:76`, `ItemDetail.tsx:112`, `MyOrders.tsx:34` |
| 20 | P1 | Customer | `aria-label` interpolates object → "Remove [object Object]" | Broken SR label on cart's destructive control | `line.name?.en` (or localized) | `Cart.tsx:171` |
| 21 | P1 | All | `Input` labels not associated; errors not linked; toasts not announced | Forms unlabeled for SR; validation invisible | `useId` + `htmlFor`/`aria-describedby`/`aria-invalid`; `role="status"` on toast container | `components/ui/Input.tsx`, `ToastContext.tsx:39` |
| 22 | P1 | Customer (light) | StateBand track/dots hard-coded white-alpha | Order progress bar invisible in light theme | Use `--color-border`/`--color-surface-strong` tokens | `components/Openwork.tsx:89,118` |
| 23 | P1 | All | 20s infinite mesh animation on `<body>` + `background-attachment: fixed`, exempt from reduced-motion; always-pulsing dots | Battery/repaint cost on phones; automation never sees idle; ignores user motion preference | Reduced-motion gate; static mesh on customer mobile; pulse on change only | `theme.css:311-326`, `index.html:13`, `Menu.tsx:70` |
| 24 | P1 | Cashier/Waiter | POS cannot handle modifier items (`modifiers: []` always) | Orders for configured dishes fail post-hoc with raw server error | Badge + block such items, or minimal option picker; friendlier error | `WaiterPOS.tsx:35-54,144-146` |
| 25 | P2 | Admin | Settings Save below the fold, no dirty state, `alert()` on success | Edits silently unsaved (live-confirmed); jarring feedback | Sticky save bar + dirty indicator + toast | `AdminSettings.tsx:37-43,144-153` |
| 26 | P2 | Cashier/Kitchen | Empty-state PNGs have baked-in transparency checkerboard | Undermines the premium look on big idle screens | Re-export with clean alpha | `public/images/empty_cashier.png`, `empty_kitchen.png` |
| 27 | P2 | Waiter | Flat-smiley empty state vs 3D renders elsewhere | Inconsistent visual language | Adopt the illustration system | `Waiter.tsx:116-123` |
| 28 | P2 | Admin | Dashboard chart tooltip open without hover (live-confirmed) | Looks glitchy on the first screen owners see | Upgrade recharts / disable area animation; verify hover-only | `Dashboard.tsx:149-155` |
| 29 | P2 | Admin | Revenue KPI = bare `0.00`; Platform revenue = `SAR n.toFixed(2)`; POS uses raw `money()` | Money convention (`<Price>`) violated; ambiguous figures | Route through `<Price>` / one shared formatter | `Dashboard.tsx:76`, `Platform.tsx:150`, `WaiterPOS.tsx:82,141` |
| 30 | P2 | Staff | Raw status enums shown (MyOrders, AdminHistory table/filter/modal) | `CASH_PENDING` is not customer/owner language; wrong pill colours | `statusLabel(status, t)` + status→colour map | `MyOrders.tsx:58-62`, `AdminHistory.tsx:60,211-214,266` |
| 31 | P2 | Staff | Iconography errors: refund=house, kitchen nav=plus, $ glyphs in a SAR market | Misleading affordances; brand dissonance | Central icon module; correct glyphs | `Cashier.tsx:318,233`, `StaffLayout.tsx:51-52`, `Dashboard.tsx:72` |
| 32 | P2 | Customer | Cart submit hover `bg-accent-wash` with white text | Primary CTA fades to unreadable on hover (desktop) | `hover:bg-accent-dim` | `Cart.tsx:121` |
| 33 | P2 | All | Fonts: weights 500/600/800 in scale but only 400/700/900 loaded | Meta text lighter, h3 heavier, display synthesised | Import missing weights / variable fonts; map Tajawal deliberately | `main.tsx:1-6`, `theme.css:13-41` |
| 34 | P2 | Customer | Sticky offsets `top-[150px]`/`scroll-mt-[160px]` vs variable header; `--app-header-h` exists nowhere | Category headers gap/underlap; violates repo convention | Introduce real `--app-header-h` set from the header | `Menu.tsx:216-217` |
| 35 | P2 | All | `window.confirm`/`alert()` scattered (refunds, category delete, review, settings, backup) | Inconsistent, unstylable, blocks the thread | Shared `ConfirmDialog` + toasts | `Cashier.tsx:310`, `AdminHistory.tsx:33,37`, `AdminMenu.tsx:595`, `AdminSettings.tsx:41,133`, `OrderStatus.tsx:24-29` |
| 36 | P2 | All | 64 physical-direction utilities in 21 files; unmirrored chevrons; left-only swipe | Every one is Phase-2 RTL rework | Codemod to logical utilities; lint rule; `rtl:`-aware icons | rep. `Cashier.tsx:271`, `MyOrders.tsx:24`, `AdminHealth.tsx:34`, `SwipeableItem.tsx:33` |
| 37 | P2 | All | Dead UI code: `AdminShell` default export, `StaffChrome`, ghost classes `text-h4`/`mie-2` | Second nav system waiting to diverge; silent no-op styles | Delete shells (keep helpers); add `--text-h4` or use `text-h3`; fix `me-2` | `AdminShell.tsx:16-72`, `StaffChrome.tsx`, `AdminStaff.tsx:288`, `OrderStatus.tsx:327` |
| 38 | P2 | All | `<meta name="color-scheme" content="dark">` + static `theme-color` | Dark UA form controls/scrollbars inside light theme | `light dark` + per-theme `color-scheme` in CSS; dynamic theme-color | `index.html:6-7`, `theme.css` |
| 39 | P2 | Staff | PWA manifest `icons: []` | Installed app (cashier tablets) gets a blank icon | Add maskable icon set | `vite.config.ts` VitePWA manifest |
| 40 | P2 | Kitchen | Tickets render `.en` names only | Arabic-speaking kitchen staff unserved despite stored `ar` snapshots | Respect staff locale with `.en` fallback | `Kitchen.tsx:296-299`, `Waiter.tsx:174` |
| 41 | P2 | Customer | Cart shows Total only — no VAT line (live-confirmed; walkthrough promises a breakdown) | KSA customers expect the VAT position stated; trust nit at the decision point | Caption line via existing unused `includesVat`/`addedVat` keys + session VAT settings | `Cart.tsx:103-107`, `locales/en.ts:45-46`, `lib/session.ts:31` |
| 42 | P2 | Admin | Desktop menu Edit opens editor at page top with no scroll; category chips lack active state; search absent in POS/menus lists | Small wayfinding frictions | Scroll-into-view on open; scroll-spy chips | `AdminMenu.tsx:106-109`, `Menu.tsx:114-128` |
| 43 | P1 | Customer | "Payment Confirmed" headline for unpaid cash orders (live-confirmed); `/my-orders` shows contradicting raw "CONFIRMED" | Customers can believe they've paid; two screens disagree about the same order state | `stateConfirmedTitle` → "Order Confirmed" (en + ar); shared `statusLabel()` on MyOrders | `OrderStatus.tsx:80-81`, `locales/en.ts:73`, `locales/ar.ts`, `MyOrders.tsx:58-62` |
| 44 | P2 | Platform | One static subtitle under three different page titles (live-confirmed); sparse one-tenant directory canvas; stats error card has no retry | Pages feel templated; directory looks abandoned at low tenancy | Per-tab subtitle map; ghost "Provision" card; retry button on error card | `Platform.tsx:95,123-126,176` |

**Counts: P0 ×5 · P1 ×20 · P2 ×19 — 44 findings.** (A 45th — the platform analytics 500 — was found and fixed server-side during the live pass; noted in §2.6/§4.11, not carried as an open finding.)

---

## 6. Positives Worth Protecting (do not regress)

- Identical-404 table errors, byte-compared in tests, with calm customer-facing copy (`TableEntry.tsx:47-66`).
- `OneTimeSecret` pattern and its language ("It cannot be shown again").
- The sold-out non-button and the required-modifier "Choose" fork on menu cards.
- Session model UX: sessionStorage lifetime rationale, silent renew + tag re-exchange (`lib/api.ts:86-101`).
- Menu editor's server-mirrored validation with human copy; category sort-gap guidance; delete-blocked-while-populated.
- Skeletons that match real layout (Menu, OrderStatus, Dashboard KPIs).
- Route-level code splitting with a flash-free fallback; PWA image caching.
- `mayVisit` as the single source of truth for nav *and* guards, with the loop-guard terminal state.

*Report generated from static analysis of `apps/web/src` @ branch `main` plus the 2026-08-19 live observation log. Ratios computed per WCAG 2.x relative luminance. Everything cited as `file:line` was read directly; the two items flagged "verify" (tooltip cause, entry-text invisibility) are code-derived and need one visual confirmation each by someone with the app running.*
