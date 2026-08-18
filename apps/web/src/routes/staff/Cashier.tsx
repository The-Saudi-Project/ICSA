import { OrderStatus, PaymentStatus } from '@rw/shared'
import { useEffect, useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Price } from '../../components/Price.js'
import { minutesSince } from '../../lib/format.js'
import { confirmCash, fetchBoard, getStaffUser, staffApi, type StaffOrder } from '../../lib/staffApi.js'
import { Link } from 'react-router'
import { Card } from '../../components/ui/Card.js'
import { ReceiptPrint } from '../../components/ReceiptPrint.js'
import { SoundToggle } from '../../components/SoundToggle.js'
import { useRestaurantSocket } from '../../lib/socket.js'
import { playAlertBeep } from '../../lib/audio.js'

export default function Cashier() {
  const queryClient = useQueryClient()
  const [confirmModalOrder, setConfirmModalOrder] = useState<StaffOrder | null>(null)
  const [amountReceived, setAmountReceived] = useState<string>('')
  const receiptRef = useRef<HTMLDivElement>(null)
  const [receiptOrder, setReceiptOrder] = useState<StaffOrder | null>(null)

  const { data, isPending, isError } = useQuery({
    queryKey: ['board', 'cashier'],
    queryFn: () => fetchBoard('cashier'),
  })

  const user = getStaffUser()
  const { socket, isConnected } = useRestaurantSocket(user?.restaurantId)

  useEffect(() => {
    if (!isConnected) return

    const handleUpdate = () => {
      void queryClient.invalidateQueries({ queryKey: ['board', 'cashier'] })
      playAlertBeep()
    }

    socket.on('order_created', handleUpdate)
    socket.on('order_updated', handleUpdate)

    return () => {
      socket.off('order_created', handleUpdate)
      socket.off('order_updated', handleUpdate)
    }
  }, [socket, isConnected, queryClient])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['board', 'cashier'] })

  const takePayment = useMutation({
    mutationFn: (order: StaffOrder) => confirmCash(order.id),
    onSettled: () => {
      setConfirmModalOrder(null)
      setAmountReceived('')
      invalidate()
    },
  })

  const handlePrint = (order: StaffOrder) => {
    setReceiptOrder(order)
    setTimeout(() => {
      window.print()
    }, 100)
  }

  const refund = useMutation({
    mutationFn: (order: StaffOrder) => staffApi<{ order: StaffOrder }>(`/app/orders/${order.id}/refund`, { method: 'POST' }),
    onSettled: invalidate,
  })

  const orders = data?.orders ?? []
  const awaitingPayment = orders.filter((o) => o.paymentStatus === PaymentStatus.CASH_PENDING)
  const ready = orders.filter((o) => o.status === OrderStatus.READY)
  const inProgress = orders.filter(
    (o) => o.paymentStatus !== PaymentStatus.CASH_PENDING && o.status !== OrderStatus.READY && o.status !== OrderStatus.COMPLETED
  )

  return (
    <div className="max-w-6xl mx-auto pt-10 pb-20 animate-fade-in relative px-6 no-print">
      <div className="hidden">
        <ReceiptPrint ref={receiptRef} order={receiptOrder} />
      </div>

      {confirmModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModalOrder(null)}></div>
          <Card variant="glass" className="relative z-10 w-full max-w-md p-8 shadow-2xl bg-ground">
            <h2 className="text-2xl font-black text-ink mb-6">Confirm Cash Payment</h2>
            
            <div className="flex justify-between items-center mb-6 py-4 border-y border-border">
              <span className="text-ink-soft font-bold">Total Due</span>
              <span className="text-3xl font-black text-status-warning"><Price halalas={confirmModalOrder.totals.grandTotalHalalas} /></span>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-ink-soft mb-2 uppercase tracking-widest">Amount Received</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint font-bold">SAR</span>
                <input 
                  type="number" 
                  step="0.01"
                  className="input-glass pl-14 text-2xl font-bold font-mono"
                  value={amountReceived}
                  onChange={e => setAmountReceived(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
            </div>

            {Number(amountReceived) * 100 >= confirmModalOrder.totals.grandTotalHalalas && (
              <div className="flex justify-between items-center mb-8 p-4 bg-status-success-wash rounded-xl border border-status-success/30">
                <span className="text-status-success font-bold uppercase tracking-widest text-sm">Change Due</span>
                <span className="text-3xl font-black text-status-success">
                  <Price halalas={Math.max(0, Math.round(Number(amountReceived) * 100) - confirmModalOrder.totals.grandTotalHalalas)} />
                </span>
              </div>
            )}

            <div className="flex gap-4">
              <button 
                onClick={() => setConfirmModalOrder(null)}
                className="flex-1 py-4 font-bold text-ink hover:bg-surface-hover rounded-xl transition-colors border-2 border-border"
              >
                Cancel
              </button>
              <button 
                onClick={() => takePayment.mutate(confirmModalOrder)}
                disabled={takePayment.isPending}
                className="flex-1 py-4 font-black text-white bg-status-warning hover:bg-orange-500 rounded-xl shadow-lg transition-colors disabled:opacity-50"
              >
                {takePayment.isPending ? 'Confirming...' : 'Confirm Paid'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Decorative Orbs */}
      <div className="absolute top-[0%] right-[10%] w-96 h-96 bg-gold/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute top-[30%] left-[-5%] w-80 h-80 bg-accent/10 blur-[100px] rounded-full pointer-events-none mix-blend-screen" />

      <div className="mb-10 flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-ink tracking-tight">Till / Cashier</h1>
          <p className="text-body text-ink-soft mt-2">Manage payments and order handovers.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/cashier/pos" className="btn-gradient px-6 py-3 shadow-md flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New Order
          </Link>
          <SoundToggle />
          <div className="bg-surface-strong border border-border/50 shadow-sm rounded-2xl px-6 py-4 flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
             </div>
             <div>
               <span className="text-small font-bold text-ink-soft uppercase tracking-wider block leading-none">Active</span>
               <span className="text-2xl font-bold text-ink leading-none mt-1 block">{orders.length}</span>
             </div>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center gap-3 text-ink-soft py-4">
          <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin"></div>
          <span className="font-medium">Loading orders…</span>
        </div>
      ) : null}
      
      {isError ? (
        <Card variant="glass" className="p-6 mb-8 border-status-danger/30 bg-status-danger-wash text-status-danger flex items-center gap-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span className="font-bold">Lost connection. Retrying every few seconds...</span>
        </Card>
      ) : null}

      {!isPending && orders.length === 0 ? (
        <div className="pt-24 pb-32 flex flex-col items-center justify-center relative z-10">
          <div className="mb-8 relative w-56 h-56 drop-shadow-2xl">
            <img src="/images/empty_cashier.png" alt="Empty Cashier" className="w-full h-full object-contain animate-float" />
          </div>
          <h2 className="text-4xl font-bold text-ink-soft">All clear!</h2>
          <p className="mt-4 text-xl font-medium text-ink-faint">No active orders right now.</p>
        </div>
      ) : (
        <div className="space-y-16 relative z-10">
          <Section title="Needs Payment" color="var(--color-status-warning)" count={awaitingPayment.length} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M12 12h.01"></path><path d="M17 12h.01"></path><path d="M7 12h.01"></path></svg>}>
            <div className="grid gap-6 mt-6">
              {awaitingPayment.map((order) => (
                <Card key={order.id} variant="glass" className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative group">
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-status-warning shadow-[0_0_15px_var(--color-status-warning)]"></div>
                  <OrderDetails order={order} />
                  <button
                    type="button"
                    onClick={() => setConfirmModalOrder(order)}
                    className="w-full md:w-auto shrink-0 bg-gradient-to-br from-status-warning to-orange-500 hover:to-orange-600 text-white shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all rounded-xl px-8 py-4 font-bold flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Confirm <Price halalas={order.totals.grandTotalHalalas} className="ml-1 opacity-90" />
                  </button>
                </Card>
              ))}
              {awaitingPayment.length === 0 && !isPending ? (
                <div className="py-12 border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-ink-faint">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M12 12h.01"></path><path d="M17 12h.01"></path><path d="M7 12h.01"></path></svg>
                  <p className="text-body font-medium">Nothing waiting to be paid.</p>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Ready for Handover" color="var(--color-status-success)" count={ready.length} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>}>
            <div className="grid gap-6 mt-6">
              {ready.map((order) => (
                <Card key={order.id} variant="glass" className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative group border-status-success/30 bg-status-success-wash/20">
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-status-success shadow-[0_0_15px_var(--color-status-success)]"></div>
                  <OrderDetails order={order} />
                  <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePrint(order)}
                      className="bg-surface-strong border border-border text-ink hover:bg-surface-hover shadow-sm transition-all rounded-xl px-6 py-4 font-bold flex items-center justify-center gap-2"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to refund this order?')) {
                          refund.mutate(order)
                        }
                      }}
                      disabled={refund.isPending}
                      className="bg-status-danger-wash text-status-danger hover:bg-status-danger hover:text-white transition-colors rounded-xl px-4 py-4 font-bold flex items-center justify-center"
                      title="Refund Order"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </button>
                  </div>
                </Card>
              ))}
              {ready.length === 0 && !isPending ? (
                <div className="py-12 border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-ink-faint">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  <p className="text-body font-medium">Nothing ready yet.</p>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="In Progress (Kitchen)" color="var(--color-ink-faint)" count={inProgress.length} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>}>
            <div className="grid gap-6 mt-6 grid-cols-1 md:grid-cols-2">
              {inProgress.map((order) => (
                <Card key={order.id} variant="glass" className="p-5 flex items-center justify-between gap-4 border-border/40 opacity-80 hover:opacity-100 transition-opacity">
                  <OrderDetails order={order} compact />
                  <span className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-sm ${order.status === OrderStatus.PREPARING ? 'bg-accent-wash text-accent ring-1 ring-accent/30' : 'bg-surface-strong text-ink-soft ring-1 ring-border'}`}>
                    {order.status === OrderStatus.PREPARING ? 'Cooking' : 'Queued'}
                  </span>
                </Card>
              ))}
              {inProgress.length === 0 && !isPending ? (
                <div className="py-12 border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-ink-faint col-span-1 md:col-span-2">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  <p className="text-body font-medium">Nothing in the kitchen.</p>
                </div>
              ) : null}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  color,
  icon,
  children,
}: {
  title: string
  count: number
  color: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm border" style={{ color, borderColor: `${color}40`, backgroundColor: `${color}15` }}>
          {icon}
        </div>
        <h2 className="text-xl font-bold tracking-tight" style={{ color }}>
          {title}
        </h2>
        <span
          className="tnum rounded-full px-3 py-1 text-sm font-bold shadow-inner border"
          style={{ color, borderColor: `${color}30`, backgroundColor: `${color}10` }}
        >
          {count}
        </span>
      </div>
      <div className="h-px w-full mt-2" style={{ background: `linear-gradient(90deg, ${color}30, transparent)` }} />
      {children}
    </section>
  )
}

function OrderDetails({ order, compact = false }: { order: StaffOrder, compact?: boolean }) {
  return (
    <div className="min-w-0 flex-1 flex items-center gap-5">
      <div className="w-16 h-16 shrink-0 bg-surface-strong rounded-2xl shadow-inner border border-border/50 flex flex-col items-center justify-center relative overflow-hidden group-hover:bg-surface transition-colors">
         <div className="absolute inset-0 bg-gradient-to-br from-ink/5 to-transparent"></div>
         <span className="text-[10px] text-ink-soft uppercase font-bold tracking-widest leading-none mb-1">#</span>
         <span className="tnum text-xl font-bold text-ink leading-none">{order.orderNumber}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <p className="text-lg font-bold text-ink">
            {order.tableLabel ? `Table ${order.tableLabel}` : 'Takeaway'}
          </p>
          <span className="tnum rounded-full bg-surface-strong px-2.5 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-border shadow-sm">
            {minutesSince(order.placedAt)}m ago
          </span>
        </div>
        <p className={`text-small text-ink-soft truncate ${compact ? 'mt-1' : 'mt-1.5'}`}>
          {order.items.map((i) => `${i.quantity}x ${i.nameSnapshot.en}`).join(', ')}
        </p>
      </div>
    </div>
  )
}
