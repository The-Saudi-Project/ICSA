import { forwardRef } from 'react'
import { money } from '../lib/format.js'
import type { StaffOrder } from '../lib/staffApi.js'

interface ReceiptProps {
  order: StaffOrder | null
  vatNumber?: string
  restaurantName?: string
  cashierName?: string
  vatRatePercent?: number
}

export const ReceiptPrint = forwardRef<HTMLDivElement, ReceiptProps>(({ order, vatNumber, restaurantName, cashierName, vatRatePercent = 15 }, ref) => {
  if (!order) return null

  return (
    <div ref={ref} className="hidden print:block font-mono text-black bg-white w-full max-w-[80mm] mx-auto text-[12px] leading-[1.2]">
      <style type="text/css" media="print">
        {`
          @page { margin: 0; size: 80mm auto; }
          body { margin: 0; padding: 0; background: white; }
          /* Ensure other elements are hidden */
          body > :not(.print\\:block) { display: none !important; }
        `}
      </style>

      <div className="p-2 sm:p-4">
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold uppercase tracking-tight">{restaurantName || 'Restaurant Webapp'}</h1>
          <p className="text-xs uppercase mt-1">Tax Invoice</p>
        </div>

        <div className="flex flex-col gap-1 text-xs mb-2 border-b border-black/30 pb-2">
          <div className="flex justify-between">
            <span>Order #{order.orderNumber}</span>
            <span>{new Date(order.placedAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Table: {order.tableLabel || 'Takeaway'}</span>
            <span>{order.paymentMethod}</span>
          </div>
          {cashierName && (
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{cashierName}</span>
            </div>
          )}
        </div>

        <div className="space-y-2 mb-4 pt-1">
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between text-xs leading-tight">
              <div className="flex-1 pr-2">
                <span className="font-bold">{item.quantity}x</span> {item.nameSnapshot.en}
                {item.modifiers.map((m, mIdx) => (
                  <div key={mIdx} className="text-[10px] pl-4">+ {m.nameSnapshot.en}</div>
                ))}
              </div>
              <div className="text-right">
                {money(item.lineTotalHalalas)}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-black/30 pt-2 space-y-1 mb-4">
          <div className="flex justify-between text-xs">
            <span>Subtotal</span>
            <span>{money(order.totals.subtotalHalalas)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>VAT ({vatRatePercent}%)</span>
            <span>{money(order.totals.vatHalalas)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm mt-1 pt-1 border-t border-black border-dashed">
            <span>TOTAL</span>
            <span>{money(order.totals.grandTotalHalalas)}</span>
          </div>
        </div>

        <div className="text-center text-[10px] space-y-1 pt-2">
          <p>Thank you for your visit!</p>
          {vatNumber && <p>VAT No: {vatNumber}</p>}
        </div>
      </div>
    </div>
  )
})
