import { forwardRef } from 'react'
import { money } from '../lib/format.js'
import type { StaffOrder } from '../lib/staffApi.js'

export const ReceiptPrint = forwardRef<HTMLDivElement, { order: StaffOrder | null }>(({ order }, ref) => {
  if (!order) return null

  return (
    <div ref={ref} className="hidden print:block p-4 font-mono text-black bg-white w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold uppercase">Restaurant Webapp</h1>
        <p className="text-sm">Tax Invoice</p>
      </div>

      <div className="flex justify-between text-sm mb-2 border-b border-black/20 pb-2">
        <span>Order #{order.orderNumber}</span>
        <span>{new Date(order.placedAt).toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-sm mb-4">
        <span>Table: {order.tableLabel || 'Takeaway'}</span>
        <span>{order.paymentMethod}</span>
      </div>

      <div className="space-y-3 mb-6">
        {order.items.map((item, index) => (
          <div key={index} className="flex justify-between text-sm leading-tight">
            <div className="flex-1 pr-2">
              <span className="font-bold">{item.quantity}x</span> {item.nameSnapshot.en}
              {item.modifiers.map((m, mIdx) => (
                <div key={mIdx} className="text-xs pl-4">+ {m.nameSnapshot.en}</div>
              ))}
            </div>
            <div className="text-right">
              {money(item.lineTotalHalalas)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-black/20 pt-3 space-y-1 mb-6">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{money(order.totals.subtotalHalalas)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>VAT (15%)</span>
          <span>{money(order.totals.vatHalalas)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t border-black">
          <span>TOTAL</span>
          <span>{money(order.totals.grandTotalHalalas)}</span>
        </div>
      </div>

      <div className="text-center text-xs space-y-1">
        <p>Thank you for your visit!</p>
        <p>VAT No: 310000000000003</p>
      </div>
    </div>
  )
})
