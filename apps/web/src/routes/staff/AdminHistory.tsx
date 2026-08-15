import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchOrderHistory, type StaffOrder } from '../../lib/staffApi.js'
import { Price } from '../../components/Price.js'
import { OrderStatus } from '@rw/shared'
import { Card } from '../../components/ui/Card.js'

function OrderModal({ order, onClose }: { order: StaffOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ground/80 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <div className="relative z-10 w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-surface md:rounded-[32px] shadow-2xl flex flex-col animate-slide-up border-l md:border border-border">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-surface md:rounded-t-[32px]">
          <div>
            <h2 className="text-h3 font-bold text-ink flex items-center gap-2">
              {order.invoiceNumber ?? order.publicId}
              <span className="text-small px-2 py-0.5 rounded-full bg-surface-strong text-ink-soft">
                {order.orderNumber}
              </span>
            </h2>
            <p className="text-small text-ink-soft">
              {new Date(order.placedAt).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-ink-soft hover:text-ink shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card variant="glass" className="p-4 bg-surface-hover">
              <span className="text-caption text-ink-faint uppercase font-bold tracking-widest">Table</span>
              <p className="text-body font-semibold text-ink mt-1">{order.tableLabel ?? 'Walk-in / No Table'}</p>
            </Card>
            <Card variant="glass" className="p-4 bg-surface-hover">
              <span className="text-caption text-ink-faint uppercase font-bold tracking-widest">Status</span>
              <p className="text-body font-semibold text-ink mt-1">{order.status}</p>
            </Card>
            <Card variant="glass" className="p-4 bg-surface-hover">
              <span className="text-caption text-ink-faint uppercase font-bold tracking-widest">Payment</span>
              <p className="text-body font-semibold text-ink mt-1">{order.paymentMethod} &bull; {order.paymentStatus}</p>
            </Card>
            <Card variant="glass" className="p-4 bg-surface-hover">
              <span className="text-caption text-ink-faint uppercase font-bold tracking-widest">Total</span>
              <p className="text-body font-semibold text-ink mt-1">
                <Price halalas={order.totals.grandTotalHalalas} />
              </p>
            </Card>
          </div>

          <div>
            <h3 className="text-h4 font-bold text-ink mb-3">Items</h3>
            <ul className="space-y-2">
              {order.items.map((line, i) => (
                <li key={i} className="flex justify-between items-start py-2 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink">
                      <span className="text-ink-soft mr-2">{line.quantity}x</span>
                      {line.nameSnapshot.en}
                    </p>
                    {line.modifiers.length > 0 && (
                      <p className="text-small text-ink-faint mt-0.5">
                        {line.modifiers.map(m => m.nameSnapshot.en).join(', ')}
                      </p>
                    )}
                    {line.note && (
                      <p className="text-small text-ink-faint italic mt-0.5">&ldquo;{line.note}&rdquo;</p>
                    )}
                  </div>
                  <Price halalas={line.lineTotalHalalas} className="font-semibold text-ink shrink-0 ml-4" />
                </li>
              ))}
            </ul>
          </div>
          
          {order.customerNote && (
            <div>
              <h3 className="text-h4 font-bold text-ink mb-2">Customer Note</h3>
              <p className="text-body text-ink-soft bg-surface-strong p-3 rounded-xl italic">
                {order.customerNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminHistory() {
  const [selectedOrder, setSelectedOrder] = useState<StaffOrder | null>(null)
  
  // Date range defaults to today
  const [dateStr, setDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState<string>('')
  
  // Create start and end of selected day for the query
  const start = new Date(dateStr)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dateStr)
  end.setHours(23, 59, 59, 999)

  const { data, isLoading } = useQuery({
    queryKey: ['orderHistory', dateStr, statusFilter],
    queryFn: () => fetchOrderHistory({
      from: start,
      to: end,
      ...(statusFilter ? { status: statusFilter } : {})
    })
  })

  return (
    <div className="min-h-full flex flex-col max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-h1 font-bold text-ink">Order History</h1>
          <p className="text-body text-ink-soft mt-1">Review past orders and receipts.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="h-10 px-3 bg-surface border border-border rounded-xl text-body text-ink outline-none focus:border-accent"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 bg-surface border border-border rounded-xl text-body text-ink outline-none focus:border-accent"
          >
            <option value="">All Statuses</option>
            {Object.values(OrderStatus).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <Card variant="glass" className="flex-1 overflow-hidden flex flex-col bg-surface shadow-xl">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="animate-spin text-ink-faint">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v4"/></svg>
            </div>
          </div>
        ) : data?.orders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-hover flex items-center justify-center text-ink-faint mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <h3 className="text-h3 font-bold text-ink">No orders found</h3>
            <p className="text-body text-ink-soft mt-1 max-w-xs mx-auto">Try selecting a different date or status filter.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse hidden md:table">
              <thead className="bg-surface-strong text-caption font-bold text-ink-faint uppercase tracking-widest sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-medium border-b border-border">Order ID</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Date & Time</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Table</th>
                  <th className="px-6 py-4 font-medium border-b border-border text-right">Total</th>
                  <th className="px-6 py-4 font-medium border-b border-border text-center">Status</th>
                  <th className="px-6 py-4 font-medium border-b border-border"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.orders.map(order => (
                  <tr key={order.id} className="hover:bg-surface-hover transition-colors group cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-body font-bold text-ink">{order.invoiceNumber ?? order.publicId}</p>
                      <p className="text-small text-ink-faint mt-0.5">{order.orderNumber}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-small text-ink-soft">
                      {new Date(order.placedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-small font-medium px-2.5 py-1 rounded-lg bg-surface-strong text-ink">
                        {order.tableLabel ?? 'Walk-in'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Price halalas={order.totals.grandTotalHalalas} className="font-bold text-ink" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-small font-semibold text-ink-soft">
                      {order.status}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-ink-faint group-hover:text-ink transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col p-4 gap-3">
              {data?.orders.map(order => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full text-left bg-surface-strong border border-border/50 rounded-2xl p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-body font-bold text-ink">{order.invoiceNumber ?? order.publicId}</span>
                      <p className="text-small text-ink-faint mt-0.5">{new Date(order.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="text-small font-medium text-ink-soft bg-surface px-2.5 py-1 rounded-lg border border-border/50">
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <span className="text-small font-semibold text-ink-soft truncate mr-4">
                      {order.tableLabel ?? 'Walk-in'}
                    </span>
                    <Price halalas={order.totals.grandTotalHalalas} className="font-bold text-ink" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {selectedOrder && (
        <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  )
}
