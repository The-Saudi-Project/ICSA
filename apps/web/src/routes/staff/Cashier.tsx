import { OrderStatus } from '@rw/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Price } from '../../components/Price.js'
import { minutesSince } from '../../lib/format.js'
import { confirmCash, transitionOrder, fetchBoard, type StaffOrder } from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'

export default function Cashier() {
  const queryClient = useQueryClient()

  const { data, isPending, isError } = useQuery({
    queryKey: ['board', 'cashier'],
    queryFn: () => fetchBoard('cashier'),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['board', 'cashier'] })

  const takePayment = useMutation({
    mutationFn: (order: StaffOrder) => confirmCash(order.id),
    onSettled: invalidate,
  })

  const complete = useMutation({
    mutationFn: (order: StaffOrder) =>
      transitionOrder(order.id, OrderStatus.COMPLETED, order.status),
    onSettled: invalidate,
  })

  const orders = data?.orders ?? []
  const awaitingPayment = orders.filter((o) => o.status === OrderStatus.CASH_PENDING)
  const ready = orders.filter((o) => o.status === OrderStatus.READY)
  const inProgress = orders.filter(
    (o) => o.status !== OrderStatus.CASH_PENDING && o.status !== OrderStatus.READY,
  )

  return (
    <div className="max-w-6xl mx-auto pt-10 pb-20 animate-fade-in relative px-6">
      {/* Decorative Orbs */}
      <div className="absolute top-[0%] right-[10%] w-96 h-96 bg-gold/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute top-[30%] left-[-5%] w-80 h-80 bg-accent/10 blur-[100px] rounded-full pointer-events-none mix-blend-screen" />

      <div className="mb-10 flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-ink tracking-tight">Till / Cashier</h1>
          <p className="text-body text-ink-soft mt-2">Manage payments and order handovers.</p>
        </div>
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

      <div className="space-y-16 relative z-10">
        <Section title="Needs Payment" color="var(--color-status-warning)" count={awaitingPayment.length} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M12 12h.01"></path><path d="M17 12h.01"></path><path d="M7 12h.01"></path></svg>}>
          <div className="grid gap-6 mt-6">
            {awaitingPayment.map((order) => (
              <Card key={order.id} variant="glass" className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative group">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-status-warning shadow-[0_0_15px_var(--color-status-warning)]"></div>
                <OrderDetails order={order} />
                <button
                  type="button"
                  onClick={() => takePayment.mutate(order)}
                  disabled={takePayment.isPending}
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
                <button
                  type="button"
                  onClick={() => complete.mutate(order)}
                  disabled={complete.isPending}
                  className="w-full md:w-auto shrink-0 bg-status-success-wash border-2 border-status-success text-status-success hover:bg-status-success hover:text-white shadow-lg hover:shadow-status-success/30 hover:-translate-y-0.5 transition-all rounded-xl px-10 py-4 font-bold flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5l10 -10"></path></svg>
                  Handed Over
                </button>
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
