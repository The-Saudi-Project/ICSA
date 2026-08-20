import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { OrderStatus as Status } from '@rw/shared'
import { Link, useParams } from 'react-router'
import { StateBand } from '../components/Openwork.js'
import { Price } from '../components/Price.js'
import { ApiError, cancelOrder, fetchOrder, submitReview, fetchRestaurantStatus } from '../lib/api.js'
import { relativeTime } from '../lib/format.js'
import { Card } from '../components/ui/Card.js'
import { Button } from '../components/ui/Button.js'
import { useI18n } from '../lib/i18n.js'
import { useOrderSocket } from '../lib/socket.js'
import { playSuccessChime, unlockAudio } from '../lib/audio.js'
import type { Translations } from '../locales/en.js'
import { useToast } from '../components/ToastContext.js'

function ReviewModal({ itemId, orderPublicId, onClose }: { itemId: string; orderPublicId: string; onClose: () => void }) {
  const { showToast } = useToast()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [customerName, setCustomerName] = useState('')
  
  const submit = useMutation({
    mutationFn: () => submitReview({ menuItemId: itemId, orderPublicId, rating, comment, customerName }),
    onSuccess: () => {
      showToast('Thanks for your review!', 'success')
      onClose()
    },
    onError: (e: Error) => {
      showToast(e.message || 'Error submitting review', 'error')
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
      <Card variant="glass" className="w-full max-w-sm p-6 bg-ground animate-fade-in shadow-2xl">
        <h3 className="text-h3 font-bold mb-4">Leave a Review</h3>
        
        <div className="space-y-4">
          <div>
             <label className="block text-sm font-bold mb-1">Your Name</label>
             <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full border-2 border-border p-2 rounded-xl" required />
          </div>
          <div>
             <label className="block text-sm font-bold mb-1">Rating</label>
             <div className="flex gap-2">
                {[1,2,3,4,5].map(r => (
                  <button key={r} onClick={() => setRating(r)} className={`text-2xl ${rating >= r ? 'text-accent' : 'text-border'}`}>★</button>
                ))}
             </div>
          </div>
          <div>
             <label className="block text-sm font-bold mb-1">Comment (Optional)</label>
             <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full border-2 border-border p-2 rounded-xl h-24"></textarea>
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button variant="primary" onClick={() => submit.mutate()} disabled={submit.isPending || !customerName} className="flex-1">
              Submit
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

const SETTLED = new Set<string>([
  Status.COMPLETED,
  Status.CANCELLED,
  Status.REJECTED,
  Status.EXPIRED,
])

function headline(order: any, t: (key: keyof Translations) => string): { title: string; detail: string; icon: string } {
  if (order.paymentStatus === 'CASH_PENDING' && !SETTLED.has(order.status)) {
    return { title: t('stateCashTitle'), detail: t('stateCashDetail'), icon: '💵' }
  }
  
  switch (order.status) {
    case Status.PLACED:
      return { title: t('statePlacedTitle'), detail: t('statePlacedDetail'), icon: '🧾' }
    case Status.CASH_PENDING:
      return { title: t('stateCashTitle'), detail: t('stateCashDetail'), icon: '💵' }
    case Status.CONFIRMED:
      return { title: t('stateConfirmedTitle'), detail: t('stateConfirmedDetail'), icon: '✅' }
    case Status.KITCHEN_ACCEPTED:
      return { title: t('stateAcceptedTitle'), detail: t('stateAcceptedDetail'), icon: '👨‍🍳' }
    case Status.PREPARING:
      return { title: t('statePreparingTitle'), detail: t('statePreparingDetail'), icon: '🔥' }
    case Status.READY:
      return { title: t('stateReadyTitle'), detail: t('stateReadyDetail'), icon: '🎉' }
    case Status.COMPLETED:
      return { title: t('stateCompletedTitle'), detail: t('stateCompletedDetail'), icon: '✨' }
    case Status.CANCELLED:
      return { title: t('stateCancelledTitle'), detail: t('stateCancelledDetail'), icon: '❌' }
    case Status.REJECTED:
      return { title: t('stateRejectedTitle'), detail: t('stateRejectedDetail'), icon: '⚠️' }
    case Status.EXPIRED:
      return { title: t('stateExpiredTitle'), detail: t('stateExpiredDetail'), icon: '⏰' }
    default:
      return { title: 'Order Placed', detail: '', icon: '🧾' }
  }
}

export default function OrderStatus() {
  const { publicId = '' } = useParams()
  const queryClient = useQueryClient()
  const { t, locale } = useI18n()

  const { data, isPending, isError } = useQuery({
    queryKey: ['order', publicId],
    queryFn: () => fetchOrder(publicId),
    refetchInterval: (query) =>
      query.state.data && SETTLED.has(query.state.data.order.status) ? false : 5000,
    refetchOnWindowFocus: true,
  })

  const { data: statusData } = useQuery({
    queryKey: ['restaurantStatus'],
    queryFn: fetchRestaurantStatus,
    refetchInterval: 30_000,
  })

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  
  const [reviewItemId, setReviewItemId] = useState<string | null>(null)

  const requestNotifPermission = async () => {
    await unlockAudio()
    if (typeof Notification !== 'undefined') {
      const perm = await Notification.requestPermission()
      setNotifPermission(perm)
    }
  }

  const { socket, isConnected } = useOrderSocket(publicId)

  useEffect(() => {
    if (!isConnected) return

    const handleUpdate = () => {
      void queryClient.invalidateQueries({ queryKey: ['order', publicId] })
    }

    socket.on('order_updated', handleUpdate)

    return () => {
      socket.off('order_updated', handleUpdate)
    }
  }, [socket, isConnected, queryClient, publicId])

  const cancel = useMutation({
    mutationFn: () => cancelOrder(publicId),
    onSuccess: (result) => {
      queryClient.setQueryData(['order', publicId], result)
    },
  })

  const orderData = data?.order
  const { title, detail, icon } = orderData ? headline(orderData, t) : { title: '', detail: '', icon: '' }
  const cancellable = orderData ? (orderData.status === Status.PLACED || orderData.status === Status.CASH_PENDING) : false
  
  const prevStatusRef = useRef(orderData?.status)
  useEffect(() => {
    if (orderData && prevStatusRef.current !== orderData.status) {
      if (orderData.status === Status.READY) {
        playSuccessChime()
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body: detail })
        }
      }
      prevStatusRef.current = orderData.status
    }
  }, [orderData?.status, title, detail])

  if (isPending) {
    return (
      <div className="min-h-dvh bg-ground transition-colors md:p-6 md:flex md:justify-center">
        <div className="w-full max-w-2xl bg-ground md:rounded-[32px] md:border md:border-border md:shadow-2xl relative min-h-[100dvh] md:min-h-0 flex flex-col p-4 md:p-8">
          {/* Top meta skeleton */}
          <div className="flex items-center justify-between mb-8">
             <div>
               <div className="h-4 w-16 bg-surface-hover rounded-full animate-pulse mb-2"></div>
               <div className="h-8 w-24 bg-surface-hover rounded-xl animate-pulse"></div>
             </div>
             <div className="flex flex-col items-end">
               <div className="h-4 w-12 bg-surface-hover rounded-full animate-pulse mb-2"></div>
               <div className="h-8 w-16 bg-surface-hover rounded-xl animate-pulse"></div>
             </div>
          </div>

          {/* Status Display Skeleton */}
          <div className="text-center py-10 px-6 border border-border bg-surface rounded-3xl animate-pulse mb-8">
             <div className="h-16 w-16 bg-surface-hover rounded-full mx-auto mb-4"></div>
             <div className="h-8 w-48 bg-surface-hover rounded-xl mx-auto mb-3"></div>
             <div className="h-4 w-64 bg-surface-hover rounded-full mx-auto"></div>
          </div>

          {/* Progress Bar Skeleton */}
          <div className="flex gap-1 mb-8">
             {[1, 2, 3, 4, 5].map((i) => (
               <div key={i} className="h-2 flex-1 rounded-full bg-surface-hover animate-pulse"></div>
             ))}
          </div>

          {/* Order Details Skeleton */}
          <div className="mb-6 h-6 w-32 bg-surface-hover rounded-full animate-pulse"></div>
          <div className="space-y-4">
             {[1, 2, 3].map((i) => (
               <div key={i} className="p-4 rounded-2xl bg-surface border border-border flex justify-between animate-pulse">
                  <div>
                    <div className="h-5 w-32 bg-surface-hover rounded-full mb-2"></div>
                    <div className="h-4 w-24 bg-surface-hover rounded-full"></div>
                  </div>
                  <div className="h-5 w-16 bg-surface-hover rounded-full"></div>
               </div>
             ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !data || !orderData) {
    return (
      <main className="bg-ground flex min-h-dvh items-center justify-center px-4">
        <Card variant="glass" className="max-w-sm px-8 py-10 text-center animate-fade-in shadow-lg border-border">
          <h1 className="text-h2">{t('orderNotFound')}</h1>
          <p className="mt-3 text-body text-ink-soft">
            {t('differentTable')}
          </p>
          <Link to="/menu">
             <Button variant="primary" className="mt-6 w-full">{t('backToMenu')}</Button>
          </Link>
        </Card>
      </main>
    )
  }

  const order = orderData
  
  // Choose a semantic accent color based on status
  let statusColorClass = 'text-accent'
  let bgWashClass = 'bg-accent-wash'
  let borderClass = 'border-accent/20'
  
  if (order.status === Status.READY || order.status === Status.COMPLETED) {
    statusColorClass = 'text-status-success'
    bgWashClass = 'bg-status-success-wash'
    borderClass = 'border-status-success/20'
  } else if (order.status === Status.PREPARING || order.status === Status.KITCHEN_ACCEPTED) {
    statusColorClass = 'text-status-warning'
    bgWashClass = 'bg-status-warning-wash'
    borderClass = 'border-status-warning/20'
  } else if (order.status === Status.CANCELLED || order.status === Status.REJECTED || order.status === Status.EXPIRED) {
    statusColorClass = 'text-status-danger'
    bgWashClass = 'bg-status-danger-wash'
    borderClass = 'border-status-danger/20'
  }

  return (
    <div className="min-h-dvh bg-ground transition-colors md:p-6 md:flex md:justify-center">
      <div className="w-full max-w-2xl bg-ground md:rounded-[32px] md:border md:border-border md:shadow-2xl relative min-h-[100dvh] md:min-h-0 flex flex-col">
        <main id="main" className="flex-1 px-4 md:px-8 py-8 md:py-12 animate-fade-in">
          
          {/* Top meta */}
          <div className="flex items-center justify-between mb-8">
             <div>
               <p className="text-small font-semibold uppercase tracking-wider text-ink-faint">
                 {t('orderNo')}
               </p>
               <p className="text-h2 font-bold text-ink mt-1">#{order.orderNumber}</p>
             </div>
             {order.tableLabel ? (
                <div className="flex flex-col items-end">
                   <p className="text-small font-semibold uppercase tracking-wider text-ink-faint">{t('table')}</p>
                   <p className="text-h2 font-bold text-ink mt-1">{order.tableLabel}</p>
                </div>
             ) : null}
          </div>
          
          {statusData?.estimatedWaitMinutes && !SETTLED.has(order.status) ? (
            <div className="mb-6 flex justify-center">
              <span className="text-small font-bold px-3 py-1.5 rounded-full bg-status-warning/10 text-status-warning border border-status-warning/20">
                Estimated Wait Time: ~{statusData.estimatedWaitMinutes} mins
              </span>
            </div>
          ) : null}

          {/* Status Display */}
          <Card aria-live="polite" variant="glass" className={`text-center py-10 px-6 border ${borderClass} ${bgWashClass} transition-colors duration-500`}>
             <div className="text-6xl mb-4 animate-slide-up inline-block" style={{ animationDuration: '600ms' }}>
                {icon}
             </div>
             <h1 className={`text-h1 mb-2 ${statusColorClass}`}>{title}</h1>
             <p className="text-body text-ink-soft max-w-md mx-auto">{detail}</p>
             
             {notifPermission === 'default' && (
               <div className="mt-6 pt-6 border-t border-border/50">
                 <button onClick={requestNotifPermission} className="text-small font-bold text-accent bg-accent/10 px-4 py-2 rounded-full hover:bg-accent/20 transition-colors">
                   Turn on Notifications
                 </button>
               </div>
             )}
          </Card>

          {/* Progress Timeline */}
          <div className="mt-10 px-2">
            <StateBand status={order.paymentStatus === 'CASH_PENDING' && !SETTLED.has(order.status) ? 'CASH_PENDING' : order.status} />
            <p className="mt-8 text-center text-small font-medium text-ink-faint">
              {t('placed')} {relativeTime(order.placedAt)}
            </p>
          </div>

          <div className="h-px bg-border my-10"></div>

          {/* Order items */}
          <section>
            <h2 className="text-h3 font-bold text-ink mb-6">{t('orderDetails')}</h2>

            <ul className="space-y-4">
              {order.items.map((line, index) => (
                <li
                  key={`${line.nameSnapshot.en}-${index}`}
                  className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">
                      <span className="tnum font-bold text-accent me-2">{line.quantity}&times;</span>
                      {line.nameSnapshot[locale] ?? line.nameSnapshot.en}
                    </p>
                    {line.modifiers.length > 0 ? (
                      <p className="mt-1 text-small text-ink-soft">
                        {line.modifiers.map((m) => m.nameSnapshot[locale] ?? m.nameSnapshot.en).join(', ')}
                      </p>
                    ) : null}
                    {line.note ? (
                      <p className="mt-1 text-small text-ink-faint italic">&ldquo;{line.note}&rdquo;</p>
                    ) : null}
                    
                    {order.status === Status.COMPLETED ? (
                      <button 
                        onClick={() => setReviewItemId(line.menuItemId)}
                        className="text-accent text-sm font-bold mt-2 hover:underline"
                      >
                         Leave a Review
                      </button>
                    ) : null}
                  </div>
                  <Price halalas={line.lineTotalHalalas} className="font-semibold text-ink" />
                </li>
              ))}
            </ul>
            
            {reviewItemId && (
              <ReviewModal itemId={reviewItemId} orderPublicId={order.publicId} onClose={() => setReviewItemId(null)} />
            )}

            {/* Totals */}
            <Card variant="subtle" className="mt-6 p-5">
              <dl className="space-y-3">
                <div className="flex justify-between text-small text-ink-soft">
                  <dt>{t('subtotal')}</dt>
                  <dd><Price halalas={order.totals.subtotalHalalas} /></dd>
                </div>
                <div className="flex justify-between text-small text-ink-soft">
                  <dt>{t('vat')}</dt>
                  <dd><Price halalas={order.totals.vatHalalas} /></dd>
                </div>
                {order.totals.serviceChargeHalalas > 0 ? (
                  <div className="flex justify-between text-small text-ink-soft">
                    <dt>{t('service')}</dt>
                    <dd><Price halalas={order.totals.serviceChargeHalalas} /></dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-2">
                  <dt className="text-body font-semibold text-ink">{t('total')}</dt>
                  <dd className="text-h2 font-bold text-ink"><Price halalas={order.totals.grandTotalHalalas} /></dd>
                </div>
              </dl>
            </Card>
          </section>

          {/* Actions */}
          <div className="mt-10 space-y-4">
            {cancellable ? (
              <div>
                <Button
                  variant="secondary"
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                  className="w-full h-12"
                >
                  {cancel.isPending ? t('cancelling') : t('cancelOrder')}
                </Button>
                {cancel.isError ? (
                  <p role="alert" className="mt-3 text-small text-status-danger text-center">
                    {cancel.error instanceof ApiError
                      ? cancel.error.message
                      : 'Could not cancel. Please speak to a member of staff.'}
                  </p>
                ) : null}
              </div>
            ) : null}

            <Link to="/menu" className="block w-full">
              <Button variant="primary" className="w-full h-14 text-lead shadow-lg">
                {t('orderSomethingElse')}
              </Button>
            </Link>
          </div>

        </main>
      </div>
    </div>
  )
}
