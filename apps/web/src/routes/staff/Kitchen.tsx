import { OrderStatus, allowedNextStatuses } from '@rw/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { minutesSince } from '../../lib/format.js'
import { fetchBoard, transitionOrder, type StaffOrder } from '../../lib/staffApi.js'
import { Card } from '../../components/ui/Card.js'

function useMinuteTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])
}

const NEXT_LABEL: Partial<Record<string, string>> = {
  [OrderStatus.KITCHEN_ACCEPTED]: 'Accept Ticket',
  [OrderStatus.PREPARING]: 'Start Cooking',
  [OrderStatus.READY]: 'Mark Ready',
}

function toneFor(status: string) {
  if (status === OrderStatus.READY) return { color: 'var(--color-status-success)', label: 'Ready' }
  if (status === OrderStatus.CONFIRMED) return { color: 'var(--color-status-info)', label: 'New' }
  return { color: 'var(--color-status-warning)', label: status === OrderStatus.PREPARING ? 'Cooking' : 'Accepted' }
}

export default function Kitchen() {
  useMinuteTick()
  const queryClient = useQueryClient()

  const { data, isPending, isError } = useQuery({
    queryKey: ['board', 'kitchen'],
    queryFn: () => fetchBoard('kitchen'),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  const advance = useMutation({
    mutationFn: ({ order, to }: { order: StaffOrder; to: OrderStatus }) =>
      transitionOrder(order.id, to, order.status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['board', 'kitchen'] }),
  })

  const orders = data?.orders ?? []

  return (
    <div className="surface-kiln min-h-dvh transition-colors relative overflow-hidden">
      {/* Decorative Orbs for Glassmorphism */}
      <div className="absolute top-[0%] left-[-10%] w-[800px] h-[800px] bg-status-info/5 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[0%] right-[-10%] w-[600px] h-[600px] bg-status-warning/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

      <main className="px-6 py-10 md:p-12 max-w-[1920px] mx-auto animate-fade-in relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
           <div>
             <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none text-ink drop-shadow-sm">Kitchen</h1>
             <p className="text-xl font-medium text-ink-soft mt-3">Active Tickets: <strong className="text-ink font-bold">{orders.length}</strong></p>
           </div>
           
           <div className="flex gap-4">
              <div className="bg-surface-strong/80 backdrop-blur-md rounded-2xl px-6 py-3 border border-border/50 shadow-sm flex items-center gap-3">
                 <div className="w-3 h-3 rounded-full bg-status-info animate-pulse shadow-[0_0_10px_var(--color-status-info)]"></div>
                 <span className="font-bold text-ink text-sm tracking-wider uppercase">New: {orders.filter(o => o.status === OrderStatus.CONFIRMED).length}</span>
              </div>
              <div className="bg-surface-strong/80 backdrop-blur-md rounded-2xl px-6 py-3 border border-border/50 shadow-sm flex items-center gap-3">
                 <div className="w-3 h-3 rounded-full bg-status-warning shadow-[0_0_10px_var(--color-status-warning)]"></div>
                 <span className="font-bold text-ink text-sm tracking-wider uppercase">Cooking: {orders.filter(o => o.status === OrderStatus.PREPARING).length}</span>
              </div>
           </div>
        </div>

        {isPending ? (
          <div className="flex items-center gap-4 text-ink-soft py-10">
            <div className="w-8 h-8 rounded-full border-4 border-status-info border-t-transparent animate-spin"></div>
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
            <h2 className="text-4xl font-bold text-ink-soft">Board is clear</h2>
            <p className="mt-4 text-xl font-medium text-ink-faint">Waiting for new tickets...</p>
          </div>
        ) : null}

        <ul className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 stagger">
          {orders.map((order) => {
            const tone = toneFor(order.status)
            const [next] = allowedNextStatuses(order.status as OrderStatus, 'KITCHEN')
            const waiting = minutesSince(order.placedAt)
            
            const isLate = waiting >= 15
            const waitingColor = isLate ? 'text-status-danger' : 'text-ink-soft'
            const isNew = order.status === OrderStatus.CONFIRMED

            return (
              <li key={order.id} className="ticket-enter">
                <Card 
                  variant="glass" 
                  className={`flex flex-col h-full overflow-hidden transition-all duration-500 shadow-xl border-t-[6px] relative group hover:-translate-y-1 hover:shadow-2xl ${isNew ? 'ring-2 ring-status-info/50 ring-offset-4 ring-offset-ground animate-pulse-slow' : ''}`}
                  style={{ borderTopColor: tone.color }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                  
                  <div className="p-8 flex-1 flex flex-col relative z-10">
                    <div className="flex items-start justify-between gap-4 border-b-2 border-border/50 pb-6 mb-6">
                      <div>
                        <span className="text-xs font-bold text-ink-faint uppercase tracking-widest block mb-2">Ticket</span>
                        <span className="text-5xl font-black text-ink tracking-tighter drop-shadow-sm">{order.orderNumber}</span>
                      </div>
                      <div className="text-right">
                        <span
                          className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest border inline-block mb-3 shadow-sm"
                          style={{
                            background: `${tone.color}15`,
                            color: tone.color,
                            borderColor: `${tone.color}30`,
                          }}
                        >
                          {tone.label}
                        </span>
                        <p className={`tnum text-3xl font-black ${waitingColor} tracking-tight`}>{waiting}m</p>
                        <p className="mt-1.5 text-sm font-bold text-ink-soft">
                          {order.tableLabel ? `Table ${order.tableLabel}` : 'Takeaway'}
                        </p>
                      </div>
                    </div>

                    <ul className="space-y-6 flex-1">
                      {order.items.map((line, index) => (
                        <li key={index} className="leading-snug">
                          <div className="flex gap-5">
                             <span className="tnum text-3xl font-black text-ink/80 mt-1">{line.quantity}</span>
                             <div className="min-w-0">
                                <span className="text-2xl font-bold text-ink block">{line.nameSnapshot.en}</span>
                                {line.modifiers.length > 0 ? (
                                  <span className="mt-2 block text-lg font-medium text-ink-soft">
                                    {line.modifiers.map((m) => m.nameSnapshot.en).join(' • ')}
                                  </span>
                                ) : null}
                                {line.note ? (
                                  <span className="mt-3 block text-lg text-status-warning font-bold italic bg-status-warning-wash/50 px-3 py-2 rounded-lg border border-status-warning/20">
                                    "{line.note}"
                                  </span>
                                ) : null}
                             </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {order.customerNote ? (
                      <div className="mt-8 rounded-2xl bg-status-warning/10 px-6 py-5 border-2 border-status-warning/30 shadow-inner">
                         <span className="text-xs font-bold text-status-warning uppercase tracking-widest block mb-2 flex items-center gap-2">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                           Customer Note
                         </span>
                         <p className="text-xl font-bold text-status-warning leading-snug">
                           {order.customerNote}
                         </p>
                      </div>
                    ) : null}

                    {next ? (
                      <button
                        type="button"
                        onClick={() => advance.mutate({ order, to: next })}
                        disabled={advance.isPending}
                        className="mt-8 w-full h-20 text-2xl font-black text-white shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all rounded-2xl border-none disabled:opacity-50 flex items-center justify-center gap-3"
                        style={{ background: tone.color }}
                      >
                        {NEXT_LABEL[next] ?? next}
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </button>
                    ) : (
                      <div className="mt-8 rounded-2xl bg-surface-strong/50 border-2 border-border/50 px-6 py-6 text-center text-xl font-bold text-ink-soft shadow-inner">
                        <div className="flex items-center justify-center gap-3">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-success"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          Waiting for collection
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
