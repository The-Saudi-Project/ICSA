/**
 * Thermal receipt printing via a popup window.
 *
 * window.print() on the main tab is unreliable when the app uses dark themes,
 * backdrop-filter, or glassmorphism — these styles bleed into the print output
 * and the body > :not(receipt) hiding trick kills the #root container.
 *
 * Instead we open a minimal popup, write clean HTML into it and call
 * window.print() there. The popup is closed automatically once the dialog
 * dismisses (or the user cancels).
 */

import type { StaffOrder } from './staffApi.js'
import { money } from './format.js'
import { BRAND } from './brand.js'

export interface PrintReceiptOptions {
  order: StaffOrder
  restaurantName?: string
  vatNumber?: string
  cashierName?: string
  vatRatePercent?: number
}

/** Build receipt HTML as a plain string (no React deps). */
function buildReceiptHtml(opts: PrintReceiptOptions): string {
  const { order, restaurantName = 'Restaurant', vatNumber, cashierName, vatRatePercent = 15 } = opts

  const rows = order.items.map((item) => {
    const mods = item.modifiers.map((m) => `<div style="padding-left:1rem;font-size:10px;">+ ${m.nameSnapshot.en}</div>`).join('')
    return `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <div style="flex:1;padding-right:8px;">
          <span style="font-weight:700;">${item.quantity}x</span> ${item.nameSnapshot.en}
          ${mods}
        </div>
        <div style="text-align:right;white-space:nowrap;">${money(item.lineTotalHalalas)}</div>
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt – #${order.orderNumber ?? order.publicId}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 8px;
      width: 80mm;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .divider { border: none; border-top: 1px dashed #555; margin: 8px 0; }
    .divider-solid { border: none; border-top: 1px solid #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .grand { font-size: 15px; font-weight: 900; }
    .small { font-size: 10px; }
    .mt { margin-top: 8px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size:16px;text-transform:uppercase;letter-spacing:1px;">${restaurantName}</div>
    <div class="small mt">TAX INVOICE</div>
  </div>

  <hr class="divider" />

  <div class="row"><span>Order #${order.orderNumber ?? order.publicId}</span><span>${new Date(order.placedAt).toLocaleString()}</span></div>
  <div class="row"><span>Table: ${order.tableLabel ?? 'Takeaway'}</span><span>${order.paymentMethod ?? ''}</span></div>
  ${cashierName ? `<div class="row"><span>Cashier:</span><span>${cashierName}</span></div>` : ''}

  <hr class="divider" />

  ${rows}

  <hr class="divider-solid" />

  <div class="row"><span>Subtotal</span><span>${money(order.totals.subtotalHalalas)}</span></div>
  <div class="row"><span>VAT (${vatRatePercent}%)</span><span>${money(order.totals.vatHalalas)}</span></div>

  <hr class="divider-solid" />

  <div class="row grand"><span>TOTAL</span><span>${money(order.totals.grandTotalHalalas)}</span></div>

  <hr class="divider" />

  <div class="center mt">
    <div>Thank you for your visit!</div>
    ${vatNumber ? `<div class="small mt">VAT No: ${vatNumber}</div>` : ''}
    <div class="small mt">${BRAND.name}</div>
  </div>
</body>
</html>`
}

/**
 * Open a print popup for the given order.
 * Returns immediately; printing is async inside the popup.
 */
export function printReceipt(opts: PrintReceiptOptions): void {
  const html = buildReceiptHtml(opts)

  // Open a small popup. Some browsers block popups if there's no user gesture;
  // this is always called from a click handler so it's fine.
  const popup = window.open('', '_blank', 'width=420,height=680,menubar=no,toolbar=no,location=no,status=no')
  if (!popup) {
    // Fallback: write into current tab if popup was blocked
    const win = window.open() as Window
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
    return
  }

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()

  // Wait for assets (fonts, etc.) then print. afterprint auto-closes.
  popup.onload = () => {
    popup.print()
  }

  popup.addEventListener('afterprint', () => {
    popup.close()
  })

  // Fallback timeout in case onload doesn't fire (data: URIs, etc.)
  setTimeout(() => {
    try { popup.print() } catch { /* already printed */ }
  }, 600)
}
