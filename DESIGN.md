# DESIGN.md

**Rewritten 2026-08-11 from the code, not from intent.**

The design system described in earlier versions of this file — "openwork", Najdi triangular
vents, Al-Qatt Al-Asiri pigment on warm plaster, OKLCH tokens, Instrument Sans — was **replaced
by the product owner** after that version was written. Almost none of it survives in
`apps/web/src`.

This file now records **what the code actually does**, so that the next person to open it is not
working from a system that no longer exists. Where the code contradicts a rule the product owner
previously approved, that is written down as an open conflict rather than quietly deleted —
those are decisions for the owner, not for an agent.

The superseded direction is preserved in `PRODUCT.md` and in the Step 7a session notes in
`PROJECT_STATE.md`.

---

## What the system is now

A **glassmorphic SaaS theme**: frosted translucent surfaces over an animated mesh-gradient
background, an emerald/indigo accent, a full light and dark mode, and Inter for Latin with
Tajawal for Arabic.

Everything lives in `apps/web/src/styles/theme.css` (one file, ~594 lines), plus a surviving
`openwork.css` used by exactly one component.

---

## Colour

Plain hex and `rgba()`, not OKLCH. Tokens are declared in a Tailwind v4 `@theme` block and given
their values in three places: `:root`, a `prefers-color-scheme: dark` block, and the `.theme-dark`
/ `.theme-light` classes.

| Token family | Purpose |
|---|---|
| `--color-ground` / `-raised` / `-sunken` | page and panel grounds |
| `--color-surface` / `-hover` / `-strong` | the translucent glass fills |
| `--color-border` / `-strong` / `-glow` | hairlines and focus glow |
| `--color-ink` / `-soft` / `-faint` | text |
| `--color-accent` / `-bright` / `-dim` / `-wash` / `-glow` | the brand accent |
| `--color-gold` / `-bright` / `-dim` / `-wash` | prices, one-time secrets |
| `--color-status-{success,warning,danger,info}` (+ `-wash`) | status roles |

### ⚠ The accent is not one colour

This is the single most confusing thing in the current system, and it is worth stating plainly.

| Where | Accent | Notes |
|---|---|---|
| `:root` (bare light) | `#059669` emerald 600 | **never actually rendered** — see below |
| `prefers-color-scheme: dark` | `#10b981` emerald 500 | |
| `.theme-dark` | `#10b981` emerald 500 | duplicate of the block above |
| `.theme-light` | **`#4f46e5` indigo 600** | **this is what light mode really looks like** |

`ThemeProvider` in `lib/theme.tsx` always resolves `'system'` to a concrete class and writes
`theme-light` or `theme-dark` onto `<html>`. Because `.theme-light` is declared after `:root` at
equal specificity, it wins. **So the app is emerald in dark mode and indigo in light mode**, and
the `:root` emerald light values are dead code.

The mesh gradients follow the same split: emerald/teal in dark, indigo/purple in `.theme-light`.

**Open question for the product owner:** is the light surface meant to be indigo, or was that
left over from a different theme? Two brand colours by accident is worth ten minutes to settle.

---

## Typography

- `--font-sans: 'Inter', 'Tajawal', ui-sans-serif, system-ui, …`
- **Loaded from Google Fonts** via a `<link>` in `apps/web/index.html`, with `preconnect` to
  `fonts.googleapis.com` and `fonts.gstatic.com`.
- Tabular figures are applied to `.tnum`, `th` and `td`.
- Tajawal is present in the stack from day one, which is genuinely useful for Phase 2 Arabic.

Scale (Tailwind v4 `@theme` text tokens):

```
display  3rem     / 800 / -0.03em
h1       2rem     / 700 / -0.02em
h2       1.5rem   / 700 / -0.01em     (aliased as `title`)
h3       1.25rem  / 600               (aliased as `lead`)
body     1rem     / 400
small    0.875rem / 500               (aliased as `meta`)
caption  0.75rem  / 500
```

The `meta` / `lead` / `title` names from the previous system are kept as aliases, so older
components still compile.

**⚠ Third-party font hosting is a real decision, not a detail.** Every customer page load now
makes requests to a Google domain before text renders. That costs a DNS lookup plus TLS on the
critical path from Saudi Arabia, puts a third party in the render path, adds an origin any
future CSP has to allow, and sends visitor IPs to Google. Self-hosting two subset woff2 files
removes all four. Flagged, not changed — it is a product-owner call.

---

## Motion

```css
--ease-fast:     cubic-bezier(0.4, 0, 0.2, 1);
--ease-normal:   cubic-bezier(0.25, 1, 0.5, 1);
--ease-emphasis: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-bouncy:   cubic-bezier(0.34, 1.56, 0.64, 1.2);
```

Utilities: `.pressable` (scale 0.96 on `:active`), `.animate-slide-up`, `.animate-fade-in`,
`.animate-shimmer`, `.stagger` (six stepped delays), `.skeleton`, `.ticket-enter`.

`prefers-reduced-motion: reduce` is handled: `.pressable` drops the transform for an opacity
change, and the keyframe animations are switched off.

---

## Conflicts with the previously approved direction

These are **not** bugs — they are the new system doing what it was written to do. They are listed
because each one reverses a decision the product owner signed off on, and CLAUDE.md still carries
the old rule. Either the code or CLAUDE.md should change; right now they disagree.

| Previously approved | What the code does now |
|---|---|
| "Decorative glassmorphism" was a **banned pattern** | `backdrop-filter: blur(40px) saturate(150%)` on every surface, and it is the defining look |
| "Identical card grids" were a **banned pattern**; the menu was specified as a typographic list | `routes/Menu.tsx` renders `grid gap-4 grid-cols-1 sm:grid-cols-2` |
| "Never bounce", custom easing only | `--ease-bouncy` overshoots to 1.2 and is used by `.pressable`, `.card-glass:hover` and `.ticket-enter` |
| Only `transform`, `opacity`, `clip-path`, `filter` animate | `.bg-mesh-deep` animates `background-position` on a 20s infinite loop, with `background-attachment: fixed` |
| Kitchen new-ticket motion: "150ms opacity only, no slide, no stagger" | `.ticket-enter` is a 400ms bouncy slide-up; `.stagger` exists and steps six children |
| Theme is **per-surface** (light customer/cashier/admin, dark kitchen) | One global light/dark toggle for everything. Only the kitchen keeps a forced surface, via `.surface-kiln` |
| The openwork motif is load-bearing | Reduced to `StateBand` in `components/Openwork.tsx`, used only by `routes/OrderStatus.tsx`. The entry sweep and the menu category bands are gone |
| Gradient text / gradient buttons unmentioned | `.btn-gradient` is the primary button, with a hover glow |

The kitchen one is worth a second look on its own: that board is watched for hours from two
metres away, and a 400ms bouncy slide on every new ticket, every five seconds, is the specific
thing the original motion budget was written to prevent.

---

## Measured performance (2026-08-11, `npm run build --workspace @rw/web`)

| Asset | Old budget | Measured | |
|---|---|---|---|
| JS, entry chunk | ≤ 60 KB gz | **85.09 KB gz** (267.76 KB raw) | ❌ over |
| JS, shared/order chunk | — | 19.77 KB gz | |
| JS, customer menu route | — | 2.45 KB gz | ✅ |
| CSS | ≤ 12 KB gz | **13.28 KB gz** (83.24 KB raw) | ❌ marginally over |
| Fonts | ≤ 35 KB, self-hosted | **external Google Fonts request** | ❌ off-budget |
| Images required to render | 0 | 0 | ✅ |

The entry chunk improved from the 103.5 KB gz recorded in Step 7a — more routes are now
code-split — but it is still above the stated 60 KB, and the CSS has crossed its budget.

**These budgets were written for the old design system.** They should either be re-adopted
deliberately or replaced with numbers that match the current one. Recording a miss against a
budget nobody has agreed to is theatre.

---

## What survived, and should keep surviving

Three conventions from the previous system are still enforced in code and still correct:

1. **`<Price>` renders all money**, tabular, gold numeral with a quieter `SAR`. Never format a
   price by hand.
2. **Logical properties** (`ms-*`, `ps-*`, `text-start`) so Phase 2 RTL is not a rewrite.
3. **`--app-header-h`** for sticky offsets, never a measured constant.

And one new one worth keeping:

4. `.surface-kiln` plus `body:has(.surface-kiln)` keeps the kitchen dark regardless of the global
   theme, so the wall screen cannot be switched to a light panel by someone else's preference.
