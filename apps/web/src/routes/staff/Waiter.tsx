import { OrderStatus, allowedNextStatuses } from '@rw/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchBoard, transitionOrder, getStaffUser, type StaffOrder, fetchWaiterCalls, resolveWaiterCall } from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'
import { SoundToggle } from '../../components/SoundToggle.js'
import { useRestaurantSocket } from '../../lib/socket.js'
import { useToast } from '../../components/ToastContext.js'
import { useI18n } from '../../lib/i18n.js'
import { playAlertBeep } from '../../lib/audio.js'

function useMinuteTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])
}

const NEXT_LABEL: Partial<Record<string, string>> = {
  [OrderStatus.COMPLETED]: 'Mark Delivered',
  [OrderStatus.CASH_PENDING]: 'Verify',
  [OrderStatus.CONFIRMED]: 'Verify',
}

function toneFor(status: string) {
  if (status === OrderStatus.PENDING_VERIFICATION) return { color: 'var(--color-status-danger)', label: 'Verify Phone' }
  if (status === OrderStatus.READY) return { color: 'var(--color-status-success)', label: 'Ready to Serve' }
  if (status === OrderStatus.CONFIRMED) return { color: 'var(--color-status-info)', label: 'New' }
  return { color: 'var(--color-status-warning)', label: 'Cooking' }
}

export default function Waiter() {
  useMinuteTick()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { t, locale } = useI18n()

  const { data, isPending, isError } = useQuery({
    queryKey: ['board', 'waiter'],
    queryFn: () => fetchBoard('waiter'),
  })

  const { data: callsData } = useQuery({
    queryKey: ['waiterCalls'],
    queryFn: fetchWaiterCalls,
  })

  const resolveCall = useMutation({
    mutationFn: (tableId: string) => resolveWaiterCall(tableId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['waiterCalls'] }),
  })

  const user = getStaffUser()
  const { socket, isConnected } = useRestaurantSocket(user?.restaurantId)

  useEffect(() => {
    if (!isConnected) return

    const handleUpdated = () => {
      // If a new order becomes ready, we might want to chime.
      void queryClient.invalidateQueries({ queryKey: ['board', 'waiter'] })
    }

    const handleCallWaiter = (payload: { tableLabel: string, tableId: string, time: string }) => {
      showToast(`Table ${payload.tableLabel} is calling for a waiter!`, 'info')
      playAlertBeep()
      void queryClient.invalidateQueries({ queryKey: ['waiterCalls'] })
    }

    const handleCallResolved = () => {
      void queryClient.invalidateQueries({ queryKey: ['waiterCalls'] })
    }

    socket.on('order_updated', handleUpdated)
    socket.on('call_waiter', handleCallWaiter)
    socket.on('call_waiter_resolved', handleCallResolved)

    return () => {
      socket.off('order_updated', handleUpdated)
      socket.off('call_waiter', handleCallWaiter)
      socket.off('call_waiter_resolved', handleCallResolved)
    }
  }, [socket, isConnected, queryClient, showToast])

  const advance = useMutation({
    mutationFn: ({ order, to }: { order: StaffOrder; to: OrderStatus }) =>
      transitionOrder(order.id, to, order.status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['board', 'waiter'] }),
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Failed to transition order', 'error')
    }
  })

  const orders = data?.orders ?? []
  
  const filteredOrders = orders.filter(o => 
    !o.assignedWaiterId || o.assignedWaiterId === user?.id
  )

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (a.status === OrderStatus.PENDING_VERIFICATION && b.status !== OrderStatus.PENDING_VERIFICATION) return -1
    if (b.status === OrderStatus.PENDING_VERIFICATION && a.status !== OrderStatus.PENDING_VERIFICATION) return 1
    if (a.status === OrderStatus.READY && b.status !== OrderStatus.READY) return -1
    if (b.status === OrderStatus.READY && a.status !== OrderStatus.READY) return 1
    return new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
  })

  return (
    <div className="bg-ground min-h-dvh transition-colors relative overflow-hidden">
      {/* Decorative Orbs for Glassmorphism */}
      <div className="absolute top-[0%] left-[-10%] w-[800px] h-[800px] bg-status-success/5 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[0%] right-[-10%] w-[600px] h-[600px] bg-accent/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

      <main className="px-6 py-10 md:p-12 max-w-[1920px] mx-auto animate-fade-in relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
           <div>
             <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none text-ink drop-shadow-sm">{t('waiterDashboard') ?? 'Waiter Dashboard'}</h1>
             <p className="text-xl font-medium text-ink-soft mt-3">{t('activeTickets') ?? 'Active Tickets'}: <strong className="text-ink font-bold">{orders.length}</strong></p>
           </div>
           
           <div className="flex items-center gap-4">
             <SoundToggle />
             <Link
                to="/waiter/pos"
                className="bg-accent hover:bg-accent-bright text-white rounded-2xl px-8 py-4 font-black shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all uppercase tracking-widest text-sm flex items-center gap-2"
             >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                {t('newOrder') ?? 'New Order'}
             </Link>
             <div className="flex gap-4">
                <div className="bg-surface-strong/80 backdrop-blur-md rounded-2xl px-6 py-3 border border-border/50 shadow-sm flex items-center gap-3">
                   <div className="w-3 h-3 rounded-full bg-status-success animate-pulse shadow-[0_0_10px_var(--color-status-success)]"></div>
                   <span className="font-bold text-ink text-sm tracking-wider uppercase">{(t('ready') ?? 'Ready').toUpperCase()}: {orders.filter(o => o.status === OrderStatus.READY).length}</span>
                </div>
             </div>
           </div>
        </div>

        {/* Active Waiter Calls */}
        {callsData?.calls && callsData.calls.length > 0 && (
          <div className="mb-12 animate-slide-up">
            <h2 className="text-3xl font-black text-ink mb-6 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-status-danger animate-pulse shadow-[0_0_10px_var(--color-status-danger)]"></span>
              Tables Calling
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {callsData.calls.map((call) => (
                <Card key={call._id} variant="glass" className="p-6 border-l-4 border-l-status-danger bg-status-danger-wash shadow-lg flex flex-col justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-status-danger tracking-tight mb-2">Table {call.label}</h3>
                    <p className="text-sm font-bold text-ink-soft uppercase tracking-widest">Needs assistance</p>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => resolveCall.mutate(call._id)}
                      disabled={resolveCall.isPending}
                      className="flex-1 bg-status-success text-white py-3 rounded-xl font-bold hover:bg-status-success/90 transition-colors shadow-sm disabled:opacity-50"
                    >
                      Attended
                    </button>
                    <button
                      onClick={() => resolveCall.mutate(call._id)}
                      disabled={resolveCall.isPending}
                      className="flex-1 bg-surface-strong text-ink border border-border py-3 rounded-xl font-bold hover:bg-surface-hover transition-colors shadow-sm disabled:opacity-50"
                    >
                      Declined
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {isPending ? (
          <div className="flex items-center gap-4 text-ink-soft py-10">
            <div className="w-8 h-8 rounded-full border-4 border-status-success border-t-transparent animate-spin"></div>
            <span className="text-2xl font-bold">Loading tickets…</span>
          </div>
        ) : null}
        
        {isError ? (
          <Card variant="glass" className="p-6 border-status-danger/40 bg-status-danger-wash text-status-danger flex items-center gap-4 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span className="text-xl font-bold">Lost the connection. Retrying every few seconds...</span>
          </Card>
        ) : null}

        {!isPending && orders.length === 0 ? (
          <div className="pt-32 flex flex-col items-center justify-center">
            <div className="mb-8 flex size-32 items-center justify-center rounded-3xl bg-surface/50 backdrop-blur-md border border-border/50 shadow-inner">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <h2 className="text-4xl font-bold text-ink-soft">{t('noActiveTables') ?? 'No active tables'}</h2>
            <p className="mt-4 text-xl font-medium text-ink-faint">{t('waitingForOrders') ?? 'Waiting for new orders...'}</p>
          </div>
        ) : null}

        <ul className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 stagger">
          {sortedOrders.map((order) => {
            const tone = toneFor(order.status)
            const [next] = allowedNextStatuses(order.status as OrderStatus, 'WAITER')
            
            const isReady = order.status === OrderStatus.READY
            const isPendingVerification = order.status === OrderStatus.PENDING_VERIFICATION
            const needsAction = isReady || isPendingVerification
            
            // For PENDING_VERIFICATION, next should be either CASH_PENDING or CONFIRMED
            const nextAction = isPendingVerification 
              ? allowedNextStatuses(order.status as OrderStatus, 'WAITER').find(s => s === OrderStatus.CASH_PENDING || s === OrderStatus.CONFIRMED)
              : next

            return (
              <li key={order.id} className="ticket-enter">
                <Card 
                  variant="glass" 
                  className={`flex flex-col h-full overflow-hidden transition-all duration-500 shadow-xl border-t-[6px] relative group hover:-translate-y-1 hover:shadow-2xl ${needsAction ? 'ring-2 ring-status-success/50 ring-offset-4 ring-offset-ground animate-pulse-slow' : 'opacity-70'}`}
                  style={{ borderTopColor: tone.color }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                  
                  <div className="p-5 sm:p-6 lg:p-8 flex-1 flex flex-col relative z-10">
                    <div className="flex items-start justify-between gap-4 border-b-2 border-border/50 pb-6 mb-6">
                      <div className="pr-10 sm:pr-0">
                        <span className="text-[10px] sm:text-xs font-bold text-ink-faint uppercase tracking-widest block mb-1 sm:mb-2">Ticket</span>
                        <span className="text-4xl sm:text-5xl font-black text-ink tracking-tighter drop-shadow-sm">{order.orderNumber}</span>
                      </div>
                      <div className="text-right">
                        <span
                          className="rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest border inline-block mb-2 sm:mb-3 shadow-sm"
                          style={{
                            background: `${tone.color}15`,
                            color: tone.color,
                            borderColor: `${tone.color}30`,
                          }}
                        >
                          {tone.label}
                        </span>
                        <p className={`mt-1 sm:mt-1.5 text-lg sm:text-xl font-black text-ink tracking-tight`}>
                          {order.tableLabel ? `Table ${order.tableLabel}` : 'Takeaway'}
                        </p>
                      </div>
                    </div>

                    <ul className="space-y-4 sm:space-y-6 flex-1">
                      {order.items.map((line, index) => (
                        <li key={index} className="leading-snug">
                          <div className="flex gap-3 sm:gap-5">
                             <span className="tnum text-2xl sm:text-3xl font-black text-ink/80 mt-1">{line.quantity}</span>
                             <div className="min-w-0">
                                <span className="text-xl sm:text-2xl font-bold text-ink block">{line.nameSnapshot[locale as keyof typeof line.nameSnapshot] ?? line.nameSnapshot.en}</span>
                             </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {nextAction && needsAction ? (
                      <button
                        type="button"
                        onClick={() => advance.mutate({ order, to: nextAction as OrderStatus })}
                        disabled={advance.isPending}
                        className="mt-6 sm:mt-8 w-full h-14 sm:h-16 md:h-20 text-base sm:text-xl font-black text-white shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all rounded-2xl border-none disabled:opacity-50 flex items-center justify-center gap-2 sm:gap-3"
                        style={{ background: tone.color }}
                      >
                        {NEXT_LABEL[nextAction] ?? nextAction}
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      </button>
                    ) : (
                      <div className="mt-8 rounded-2xl bg-surface-strong/50 border-2 border-border/50 px-6 py-6 text-center text-xl font-bold text-ink-soft shadow-inner">
                        <div className="flex items-center justify-center gap-3">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                          Cooking...
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
