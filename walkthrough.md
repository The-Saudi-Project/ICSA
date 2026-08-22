# Walkthrough

A plain-language tour of how this system works. No prior engineering knowledge assumed.

> **Status: this describes the design, not working software.** Nothing is built yet.
> Sections are marked ✅ built / 🔨 planned as work progresses. Right now everything is 🔨.

---

## 1. What the customer experiences 🔨

Sara sits down at table 12. On the table is a small card with an NFC chip and a printed QR code.

1. **She taps her phone on the card.** (Or scans the QR — same result. Older phones without NFC
   use the QR.) Her browser opens `https://app.<domain>/t/Xk9…` — a long random code, not
   "table 12". Nothing to install.
2. **The menu appears**, showing this restaurant's items with photos and prices in SAR.
   *(Phase 1 is English. Arabic and right-to-left layout arrive in Phase 2 — the restaurant can
   already enter Arabic names and descriptions, they simply are not displayed yet.)*
3. **She taps a dish.** Description, allergens, calories, preparation time, and any add-ons
   (extra cheese, no onion, large size) with their prices.
4. **She adds it to her cart** and keeps browsing. The running total is always visible.
5. **She reviews the cart** — items, quantities, subtotal, 15% VAT, and the grand total, clearly
   broken out.
6. **She picks cash or card.** *(Card arrives in Phase 2; Phase 1 is cash.)*
7. **She places the order.** A status page appears immediately.
8. **She watches the status change** — placed → confirmed → being prepared → ready — without
   refreshing.
9. *(Phase 2)* After the meal, an SMS invites her to rate the experience or leave a Google review.

**If she needs a person**, one tap on *Call waiter* puts her table on the waiter's screen. The
call stays there until a waiter clears it, so it cannot be missed because nobody happened to be
looking when it arrived.

She never created an account, never installed anything, and never typed a table number.

---

## 2. What the staff experience 🔨

**Cashier screen** — a live list of incoming orders. Table number, items, total, how long ago.
Sara pays at the counter; the cashier taps **Confirm cash payment**. The order moves on and the
kitchen sees it. That tap is permanently recorded with the cashier's name and the time.

**Kitchen screen** — a board of confirmed orders showing items, quantities, and modifiers in
large text. Accept → preparing → ready. Nothing about payments or prices appears here; the
kitchen does not need it and cannot change it.

**Waiter screen** — the orders that are ready to carry to a table, and any table that has pressed
*Call waiter*, oldest call first. A call arrives with a sound the moment it is made, and the screen
re-checks every few seconds as well, so a dropped connection cannot swallow one. Clearing a call
clears it for every waiter at once.

**Owner/manager dashboard** — an overview screen showing today's takings, today's order count,
how many orders are live right now, and the size of the team. "Today" means the Saudi calendar
day, so a restaurant serving past midnight sees the numbers it expects, and they agree with the
order numbers, which also restart at local midnight.

From the same sidebar: menu editing (categories, items, photos, prices, availability), table
management (create tables, print QR codes, export URLs to write onto NFC chips, rotate a table's
code if a card is stolen), staff accounts and roles, order history, and an audit log of who did
what.

**Platform admin (us)** — create and suspend restaurants, open any one of them to change its
details, reset its owner's password, manage its staff, view platform-wide totals and audit logs.
Only we have this.

**Removing someone from a team never deletes them.** It disables the account: they are signed out
of every device that instant and cannot sign back in, but the record stays. That is deliberate. The
audit log records who did what, and if we deleted the person, every action they ever took would
point at nobody. A disabled account can be switched back on with one click.

**Chains and branches.** A restaurant is a single site, the head of a chain, or a branch of one.
This is a label for our own records, not a shortcut: **a branch is a wholly separate tenant.** It
has its own menu, staff, tables and orders, and its dashboard shows its numbers alone — never the
chain's, never another branch's. A chain owner opening a branch's order gets the same "not found"
they would get for an order that does not exist. If a chain ever wants group-wide reporting, that
has to be built deliberately; it does not happen by accident.

---

## 3. The security idea that matters most 🔨

**The problem.** If the URL were `app.domain.com/table/12`, anyone could type `14` and order
food to someone else's table. People would do it as a prank, and the restaurant would eat the
cost.

**The fix, in three steps.**

*One — the code on the tag is unguessable.* 32 random bytes, roughly a 78-digit number. There is
no table 13 to guess your way to. And we store only a one-way fingerprint of it, so even someone
who stole our entire database could not reconstruct working table links.

*Two — the code is traded for a temporary pass.* When Sara taps, her phone sends the tag code
once. The server looks it up, confirms the table and restaurant are active, and hands back a
short-lived pass that says "this browser is at table 12 of restaurant X". The tag code is not
used again during her visit.

*Three — the order request contains no table number at all.* When Sara orders, her phone sends
only the items. The server reads the table and restaurant from her pass. **There is no field to
tamper with.** She could rewrite every byte her phone sends and still could not order to
table 14.

On top of that: passes expire; rate limits stop rapid-fire attempts; every rejected code is
logged; and the owner can rotate a table's code with one click if a card goes missing.

**Honest limitation:** someone could photograph a table's QR code and use it later from outside.
No cryptography prevents that — the tag is a physical object in a public room. What we do about
it: cash orders wait for staff confirmation before cooking (the default), sessions expire, each
table has a rate limit, and Phase 2 adds optional phone verification for larger orders.

---

## 4. How restaurants stay separate 🔨

Every restaurant is a *tenant*. Restaurant A must never see Restaurant B's menu, orders, staff,
or customers — not by accident, and not by anyone deliberately trying.

Four independent defences:

1. **The tenant is never asked for.** A staff member's login token carries their restaurant.
   The browser never sends a restaurant ID, so it cannot send the wrong one.
2. **Every database query is automatically stamped with the tenant.** Looking up an order by ID
   really means "find this order *belonging to my restaurant*". Someone else's order comes back
   empty, and empty becomes "not found" — the attacker cannot even confirm it exists.
3. **A safety net inside the database layer** refuses any query on tenant-owned data that forgot
   the tenant filter. A developer's mistake becomes a loud error in testing rather than a quiet
   data leak in production.
4. **Automated tests that block the build.** Ten mandatory cross-tenant attack tests run on
   every code change. If any passes where it should fail, the code cannot ship.

---

## 5. How money is handled 🔨

**Prices are stored as whole numbers of halalas** (1 SAR = 100 halalas). Computers are famously
bad at decimals — `0.1 + 0.2` gives `0.30000000000000004`. Counting in halalas means the
arithmetic is exact, so receipts are always right.

**The customer's phone never decides a price.** It says "two of item ABC with extra cheese". The
server looks up the current price, applies 15% VAT, computes the total, and that is the order.
A tampered phone changes nothing.

**Orders freeze their contents.** Every order stores a full copy of the item names, prices, VAT
rate, and modifiers as they were at that moment. If the owner raises a price tomorrow,
yesterday's bill is untouched.

**We never touch card details** *(Phase 2)*. The customer is handed to the payment provider's own
secure page. Their card number goes to the provider, never through us. The provider then tells
our server — with a cryptographic signature we verify — whether the payment succeeded. We do
**not** believe the browser when it says "paid": that would be trivially forgeable, and would
mean free food.

---

## 6. How an order moves 🔨

An order can only travel along defined paths, checked on the server. It cannot jump around.

```
in the browser        server-side
   DRAFT     ──►   PLACED ──► CASH_PENDING ──► CONFIRMED ──► KITCHEN_ACCEPTED
  (cart)              │                                            │
                      ├──► REJECTED (staff, with a reason)         ▼
                      └──► CANCELLED (customer, ~2 min window) PREPARING
                                                                   │
                                                 COMPLETED ◄── READY
```

The cart lives only in the browser — abandoned carts never touch the database. Each state also
records **who** is allowed to make each move: only the kitchen marks food ready, only a cashier
or manager confirms cash. Once an order is completed or cancelled, it is frozen; no route in the
system can edit it. Every change is stamped with who did it and when.

---

## 7. What runs where 🔨

```
Customer's phone / staff tablet
        │
   app.<domain>      the React app — a static site on a global CDN, so it loads fast
        │
   api.<domain>      the Node/Express server — all rules, all security, all data access
        │
   ┌────┴──────────────┬─────────────────────┐
MongoDB Atlas    Cloudflare R2        (Phase 2) payment provider, SMS
 (the data)      (menu photos)
```

One backend program, organised in modules (menu, orders, tables, auth…). Not dozens of small
services — at this size that would cost more and break more.

---

## 8. Keeping it cheap 🔨

Everything through Phase 1 runs on free tiers or on your own machine. **Expected development
cost: zero.**

Two free-tier limits will bite the day a real restaurant depends on this, so they are flagged
early rather than discovered live:

- **The free backend tier goes to sleep** when idle and takes tens of seconds to wake. A
  customer tapping a tag after a quiet hour would stare at a blank screen. Before a real
  restaurant launches, this must move to a paid always-on tier (a few dollars a month).
- **The free database tier has no automatic backups.** Not acceptable for a restaurant's live
  orders. Before launch: a paid tier and/or a nightly copy to cheap storage — plus an actual
  test restore, because a backup nobody has restored is not a backup.

Rule for everything else: start free, measure real usage, and upgrade only when something
measurable says we must.

---

## 9. Where the project stands

**Phase 0 (architecture) complete. The Phase 1 back end — Steps 1–6 of 8 — is built and tested.**

Working today, with 192 automated tests passing (134 of them security tests):

- ✅ Staff accounts, login, sessions that can be revoked instantly
- ✅ Restaurants kept completely separate from each other
- ✅ Platform admin: create a restaurant and its owner, suspend it, review the audit log
- ✅ Tables with unguessable NFC/QR codes, QR images, CSV export for writing tags
- ✅ The secure table-session exchange described in section 3
- ✅ Menu: categories, items, prices, add-ons, availability
- ✅ Ordering: server-calculated prices and VAT, frozen snapshots, cash confirmation,
     the kitchen workflow, and orders that cannot be edited once finished

**And now the screens exist too.** All five of them:

- ✅ **Customer** — tap the tag, browse, order, watch it being made
- ✅ **Kitchen** — a dark wall screen, huge numbers, one tap per stage
- ✅ **Till** — take cash, hand orders over
- ✅ **Restaurant admin** — build the menu, print table QR codes, manage the team
- ✅ **Platform admin** — create and suspend restaurants, read the audit log

What remains is Step 8: checking the database is using the right indexes under real data,
writing up the threat model, and a last security pass. Two smaller gaps are known and listed in
`PROJECT_STATE.md`: a screen for changing your password after being given a temporary one, and
the interface for uploading menu photos.

- **Phase 1** 🔨 core ordering — tables, menu, cart, orders, cashier, kitchen, cash payment
- **Phase 2** 🔨 Mada/card payments (via Moyasar), phone OTP, takeaway and pickup, SMS,
  **Arabic UI + right-to-left layout**
- **Phase 3** 🔨 integration with the restaurant's existing POS/accounting system
- **Phase 4** 🔨 production hardening, subscriptions, analytics, penetration testing

Current details, decisions, and the exact next task live in `PROJECT_STATE.md`.
The full technical design lives in `docs/PHASE_0_ARCHITECTURE.md`.
