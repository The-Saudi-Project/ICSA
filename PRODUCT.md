# PRODUCT.md

Design context. Written from the built system (Phase 1 backend, Steps 1–6) and
`docs/PHASE_0_ARCHITECTURE.md`, not from a prompt. Fields marked **[CONFIRM]** need the
product owner's decision.

---

## Register

**product** — for all five surfaces. Design serves the product; it is not the product.

The customer ordering flow has the most brand weight of the five, because it is the only surface
a paying restaurant's own customers ever see, and it is the thing they will judge the restaurant
by. It is still `product` register: someone is hungry and wants food, not a brand experience.

## Product purpose

Turn a restaurant table into a self-ordering terminal. A customer taps an NFC tag or scans a QR
code, the menu opens in their phone browser with no app and no login, they order, and the order
reaches the cashier and the kitchen.

The restaurant keeps its existing POS and accounting system. We are the ordering layer, not a
replacement till.

## Users

Five distinct people, in three physically different situations. They do not want the same
interface, and giving them the same one would be a design failure.

| User | Where they are | What they need |
|---|---|---|
| **Customer** | Seated at a table, phone in hand, often in bright daylight, hungry, possibly with company | Order in under a minute. See the price clearly. Know what is happening to their food. Never register an account. |
| **Cashier** | Standing at a till, glancing between a screen and a person's face | Confirm cash without error. See what is waiting. Never mis-tap. |
| **Kitchen** | Two metres from a wall-mounted screen, hands full, hot, noisy | Read the next ticket at a glance. Advance it with one large tap. See nothing about money. |
| **Restaurant owner / manager** | Desk or tablet, in the quiet part of the day | Edit the menu, print table QR codes, look at the day |
| **Platform admin (us)** | Anywhere | Create and suspend restaurants, read the audit log |

## Market

Saudi Arabia. SAR, 15% VAT, Saudi phone numbers, Mada card ecosystem (Phase 2).

Phase 1 ships an **English-only UI** by owner decision. The database is already bilingual
(`{en, ar}` on every user-visible field), so Arabic and RTL are a Phase 2 UI change with no
migration. Every layout must therefore be built so a direction flip is not a rewrite: logical
properties (`margin-inline-start`, not `margin-left`), no hard-coded left/right.

## Tone

Plain, quick, unfussy, quietly confident. A restaurant tool, not a lifestyle brand.

The product should feel like it was made *for Saudi Arabia*, not translated into it. That
distinction drives the whole visual concept below.

## Design principles

1. **The architecture is the design language.** The order state machine, the immutable snapshot,
   the tenant boundary — these are the product's real substance, and the interface should show
   them rather than decorate over them. An order's progress is a genuine state machine, so it
   should be drawn as one.
2. **Speed is a feature, and it is visible.** The menu is the first thing a customer loads, on
   4G, on a phone that is already warm. Weight is a design decision, not an engineering
   afterthought. No image the page can live without.
3. **Three physical situations, three treatments.** Bright table, till counter, hot kitchen wall.
   The same theme on all three would be a category reflex, not a decision.
4. **Money is never ambiguous.** Prices, VAT and totals are the one thing that must be
   unmistakable at a glance. Integer halalas server-side; unambiguous typography client-side.
5. **Saudi specificity, not Gulf-generic decoration.** Real, named, place-derived sources. See
   the anti-references.

## Anti-references

Things this product must not look like. **[CONFIRM]** — the product owner should add or remove.

- **Gold-on-black "luxury Arabian."** The single most exhausted visual for anything Saudi.
- **Flag colours as a palette.** Dark green + white is the reflex answer for "make it Saudi."
- **Generic arabesque scrollwork / mashrabiya wallpaper.** Pan-Islamic decoration applied as a
  texture, usually Moroccan or Persian in origin, standing in for "Middle East."
- **Camel, palm, dune, falcon and dome silhouettes.** Tourist iconography.
- **Desert-minimal sand-and-terracotta.** The second-order reflex: what you land on when you have
  correctly rejected gold-and-green and reach for "tasteful" instead.
- **Deliveroo / Talabat / Uber Eats layout.** Big photo cards in an endless scroll. We are not a
  delivery marketplace; the customer is already sitting in the restaurant.
- **Generic SaaS dashboard.** Hero metric, four stat cards, a chart nobody reads.

## Constraints that shape the UI

- **No login for customers, ever.** The table session is the identity.
- The customer's phone holds a session token in memory and sends nothing else. There is no table
  picker, no restaurant picker, no address form. The interface is smaller than a delivery app's
  by design.
- **English only in Phase 1**, RTL-ready in structure.
- Live boards poll (no websockets on free hosting). Polling must never make a screen flicker or
  jump.
- Menu images are optional and often absent. A restaurant with no photos must still look
  deliberate, not broken.

## Name and domain

**[CONFIRM] — still unchosen.** The repo and packages use the placeholder `restaurant-webapp` /
`@rw/*`. Nothing is hard-coded: the customer URL comes from `PUBLIC_APP_URL`.
