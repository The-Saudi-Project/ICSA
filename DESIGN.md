# DESIGN.md

**Updated 2026-08-17**

This document describes the official design system for the product, as approved by the product owner. 

---

## The System

A **premium glassmorphic SaaS theme**: frosted translucent surfaces over an animated mesh-gradient background, sophisticated full light and dark modes, dynamic micro-animations, and modern typography (Inter for Latin, Tajawal for Arabic).

Everything lives in `apps/web/src/styles/theme.css`.

---

## Colour

Tokens are declared in a Tailwind v4 `@theme` block and given their values in three places: `:root`, a `prefers-color-scheme: dark` block, and the `.theme-dark` / `.theme-light` classes.

| Token family | Purpose |
|---|---|
| `--color-ground` / `-raised` / `-sunken` | page and panel grounds |
| `--color-surface` / `-hover` / `-strong` | the translucent glass fills |
| `--color-border` / `-strong` / `-glow` | hairlines and focus glow |
| `--color-ink` / `-soft` / `-faint` | text |
| `--color-accent` / `-bright` / `-dim` / `-wash` / `-glow` | the brand accent |
| `--color-gold` / `-bright` / `-dim` / `-wash` | prices, one-time secrets |
| `--color-status-{success,warning,danger,info}` (+ `-wash`) | status roles |

### The Accent Colors

The theme embraces distinct brand colors for light and dark modes to maximize visual impact:

| Where | Accent |
|---|---|
| `prefers-color-scheme: dark` / `.theme-dark` | `#10b981` emerald 500 |
| `.theme-light` | `#4f46e5` indigo 600 |

`ThemeProvider` in `lib/theme.tsx` always resolves `'system'` to a concrete class and writes `theme-light` or `theme-dark` onto `<html>`. The mesh gradients follow the same split: emerald/teal in dark, indigo/purple in light mode.

---

## Typography

- `--font-sans: 'Inter', 'Tajawal', ui-sans-serif, system-ui, …`
- **Loaded from Google Fonts** via a `<link>` in `apps/web/index.html`.
- Tabular figures are applied to `.tnum`, `th` and `td`.
- Tajawal is natively integrated into the stack to provide excellent Arabic (RTL) support.

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

---

## Motion & Interaction

Dynamic micro-animations are essential to the premium feel of the app. The system provides the following custom easing curves:

```css
--ease-fast:     cubic-bezier(0.4, 0, 0.2, 1);
--ease-normal:   cubic-bezier(0.25, 1, 0.5, 1);
--ease-emphasis: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-bouncy:   cubic-bezier(0.34, 1.56, 0.64, 1.2);
```

**Utilities and Effects:**
- `.pressable`: scale 0.96 on `:active` for interactive elements.
- `.animate-slide-up`, `.animate-fade-in`, `.animate-shimmer`.
- `.stagger`: allows stepped delays for child elements.
- `.ticket-enter`: a bouncy slide-up used for new items arriving on screen.
- `.bg-mesh-deep`: animates `background-position` on a 20s infinite loop to keep the application feeling alive and modern.

`prefers-reduced-motion: reduce` is fully handled: `.pressable` drops the transform for an opacity change, and the keyframe animations are switched off for users who request it.

---

## Key UI Patterns

1. **Card Grids over Typographic Lists:** Data and menus are presented in rich, interactive card grids (e.g., `grid gap-4 grid-cols-1 sm:grid-cols-2`) rather than plain lists.
2. **Global Theming with Local Overrides:** The application has a global light/dark toggle. However, specific operational surfaces enforce their own themes for visibility. For example, the kitchen board uses `.surface-kiln` to stay dark regardless of the global theme, ensuring legibility from a distance.
3. **Glassmorphism:** `backdrop-filter: blur(40px) saturate(150%)` is heavily utilized to build depth and hierarchy across the interface.
4. **Rich Buttons:** Primary actions utilize `.btn-gradient` with subtle hover glows, elevating the premium feel.

---

## Formatting Conventions

1. **`<Price>` renders all money**, tabular, gold numeral with a quieter `SAR`. Never format a price by hand.
2. **Logical properties** (`ms-*`, `ps-*`, `text-start`) are used everywhere so Phase 2 RTL is not a rewrite.
3. **`--app-header-h`** is used for sticky offsets, never a measured constant.

---

## The homepage (added 2026-08-22)

The marketing page follows the same system as the product, with one deliberate difference: it is
allowed to be slower. Product UI stays under 300ms because people use it hundreds of times a day;
a homepage section is seen once, so 400–550ms reads as considered rather than sluggish.

**Motion rules used there**

| Rule | Value | Why |
|---|---|---|
| Entrance easing | `cubic-bezier(0.23, 1, 0.32, 1)` | Strong ease-out. Movement starts immediately, which is the moment the eye is watching |
| Scroll reveal | `once: true`, `margin: -80px` | Fires *before* the element arrives, so the reader never waits for an animation |
| Stagger | 60ms between siblings | Reads as a cascade; long enough to notice, short enough not to delay |
| Screen swaps in the demo | 180ms | Fast enough to feel like software |
| Entrances | from `scale(0.96)`, never `scale(0)` | Nothing in the real world appears out of nothing |
| Status chip crossfade | 160ms + `blur(2px)` | Blur bridges the two labels; without it you see two words overlapping |
| Hover lift (`.lift`) | inside `@media (hover: hover) and (pointer: fine)` | On a touch screen `:hover` sticks after a tap |
| `prefers-reduced-motion` | fades kept, movement dropped, ambient loops stopped | Reduced motion means gentler, not absent |

**The 3D scene** (`styles/home.css`, `routes/home/Scene3D.tsx`) is CSS, not WebGL: `perspective`
on the frame, `transform-style: preserve-3d` on the stage, and each layer at a real `translateZ`.
The tilt follows the cursor through a spring and is applied as one `transform` string built with
`useMotionTemplate`, so it stays on the compositor while the page is still loading.

**Two fixes to the shared system**, both visible everywhere in the product:

- `.btn-gradient` now scales to `0.97` on `:active`. The primary button was the only pressable
  surface in the app that did not respond to a press.
- `Button` no longer uses `transition: all`; it names the properties it animates.
