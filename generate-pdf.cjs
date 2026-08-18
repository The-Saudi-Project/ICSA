/* eslint-disable */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({ margin: 40 });
doc.pipe(fs.createWriteStream('Testing_Checklist.pdf'));

doc.fontSize(16).font('Helvetica-Bold').text('Verification & Security Checklist', { align: 'center' });
doc.moveDown();

function addSection(title, items) {
    doc.fontSize(12).font('Helvetica-Bold').text(title);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    items.forEach(item => {
        doc.text(`[ ] ${item}`);
        doc.moveDown(0.3);
    });
    doc.moveDown();
}

addSection('1. Quick Wins & UI Enhancements', [
    'Confetti: Place an order from the cart; verify confetti appears on success.',
    '"My Orders" Link: Verify it appears in the Customer Header and works.',
    'Category Jump: On the Menu page, click categories; verify the page scrolls to them.',
    'Need Help Footer: Verify WhatsApp and Call links appear at the bottom of the customer app.',
    'Audio Alerts: Enable sound (toggle) in Kitchen Display; verify a chime plays for new orders.',
    'Keyboard Shortcuts: In Staff Layout, press Shift + C for Cashier, Shift + K for Kitchen.',
    'Reduced Motion: Set OS to "Reduce Motion"; verify confetti/animations are disabled.',
    'Estimated Prep Time: Check Kitchen Display to see the sum of prep times for active orders.',
    'Dashboard Chart: Go to Dashboard; verify the Y-axis (e.g. "SAR 32") is fully visible, not cut off.'
]);

addSection('2. Cart & Flow Fixes', [
    'Item Detail: Add an item with options/modifiers to cart; verify it succeeds without crashing.',
    'Cart Layout: Open Cart; verify the "Place Order" button and total section look correct and stick to the bottom.',
    'Quantity Toggles: In Cart, use + and - buttons; verify quantity updates.',
    'Cart Swipe: Swipe left on a cart item to reveal the delete button.',
    'Localization: Switch language to Arabic; verify "Add More" appears in the Cart.'
]);

addSection('3. Staff & Admin Fixes', [
    'Health Monitoring: Check OS Admin -> System Health; verify API Server and Database show as OK.',
    'Data Backup: Check OS Admin -> Settings; click the "Download Backup" button.'
]);

addSection('4. Security & Hardening Tests (Manual)', [
    'CSRF / Origin Check (Login): Open DevTools Console on localhost:5174. Run a manual fetch POST to /api/v1/auth/login. Expected: Fails with 401 Invalid origin.',
    'NoSQL Injection (Auth): On the staff login screen, enter {"$gt": ""} as the email or password. Expected: The system rejects it rather than bypassing authentication.',
    'Rate Limiting: Repeatedly click "Sign in" with wrong credentials very fast. Expected: You receive a 429 Too Many Requests error.',
    'XSS Protection: Add an item to the cart and enter <script>alert(1)</script> in the "Note for Kitchen" field. Expected: In the Kitchen display, the note is shown as plain text, not executed as an alert.'
]);

doc.end();
console.log('PDF generated successfully!');
