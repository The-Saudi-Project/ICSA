# Verification & Security Checklist

## 1. Quick Wins & UI Enhancements
- [ ] **Confetti**: Place an order from the cart; verify confetti appears on success.
- [ ] **"My Orders" Link**: Verify it appears in the Customer Header and works.
- [ ] **Category Jump**: On the Menu page, click categories; verify the page scrolls to them.
- [ ] **Need Help Footer**: Verify WhatsApp and Call links appear at the bottom of the customer app.
- [ ] **Audio Alerts**: Enable sound (toggle) in Kitchen Display; verify a chime plays for new orders.
- [ ] **Keyboard Shortcuts**: In Staff Layout, press `Shift + C` for Cashier, `Shift + K` for Kitchen.
- [ ] **Reduced Motion**: Set OS to "Reduce Motion"; verify confetti/animations are disabled.
- [ ] **Estimated Prep Time**: Check Kitchen Display to see the sum of prep times for active orders.
- [ ] **Dashboard Chart**: Go to Dashboard; verify the Y-axis (e.g. "SAR 32") is fully visible, not cut off.

## 2. Cart & Flow Fixes
- [ ] **Item Detail**: Add an item with options/modifiers to cart; verify it succeeds without crashing.
- [ ] **Cart Layout**: Open Cart; verify the "Place Order" button and total section look correct and stick to the bottom.
- [ ] **Quantity Toggles**: In Cart, use `+` and `-` buttons; verify quantity updates.
- [ ] **Cart Swipe**: Swipe left on a cart item to reveal the delete button.
- [ ] **Localization**: Switch language to Arabic; verify "إضافة المزيد" (Add More) appears in the Cart.

## 3. Staff & Admin Fixes
- [ ] **Health Monitoring**: Check OS Admin -> System Health; verify API Server and Database show as "Connected/OK".
- [ ] **Data Backup**: Check OS Admin -> Settings; click the "Download Backup" button (should trigger a ZIP download or navigation to the backup endpoint).

## 4. Security & Hardening Tests (Manual)
*Perform these in your browser or via Postman/cURL.*

- [ ] **CSRF / Origin Check (Login)**: 
  - *Test*: Open DevTools Console on `localhost:5174`. Run `fetch('http://127.0.0.1:4000/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({email: 'a', password: 'b'}) })`.
  - *Expected*: Fails with `401 Invalid origin` because `origin` header is missing or incorrect in a manual fetch without proper mode. (Alternatively, test using Postman with a fake Origin like `http://evil.com`).
- [ ] **NoSQL Injection (Auth)**:
  - *Test*: On the staff login screen, enter `{"$gt": ""}` as the email or password.
  - *Expected*: The system rejects it (zod validation fails) rather than bypassing authentication.
- [ ] **Rate Limiting**:
  - *Test*: Repeatedly click "Sign in" with wrong credentials very fast (or script 100 requests).
  - *Expected*: You receive a `429 Too Many Requests` error eventually.
- [ ] **XSS Protection**:
  - *Test*: Add an item to the cart and enter `<script>alert(1)</script>` in the "Note for Kitchen" field.
  - *Expected*: In the Kitchen display, the note is shown as plain text, not executed as an alert.
