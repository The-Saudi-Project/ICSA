import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { OrderStatus as Status } from '@rw/shared/orderState'
import { Link, useParams } from 'react-router'
import { StateBand } from '../components/Openwork.js'
import { Price } from '../components/Price.js'
import { ApiError, cancelOrder, fetchOrder } from '../lib/api.js'
import { relativeTime } from '../lib/format.js'
import { Card } from '../components/ui/Card.js'
import { Button } from '../components/ui/Button.js'

const SETTLED = new Set<string>([
  Status.COMPLETED,
  Status.CANCELLED,
  Status.REJECTED,
  Status.EXPIRED,
])

function headline(status: string): { title: string; detail: string; icon: string } {
  switch (status) {
    case Status.PLACED:
      return { title: 'Order Received', detail: 'We have received your order.', icon: '🧾' }
    case Status.CASH_PENDING:
      return { title: 'Pay at the Counter', detail: 'Show your order number. The kitchen starts once payment is confirmed.', icon: '💵' }
    case Status.CONFIRMED:
      return { title: 'Payment Confirmed', detail: 'Your order is in the queue.', icon: '✅' }
    case Status.KITCHEN_ACCEPTED:
      return { title: 'Kitchen Accepted', detail: 'Your food will be prepared soon.', icon: '👨‍🍳' }
    case Status.PREPARING:
      return { title: 'Being Prepared', detail: 'The chefs are cooking your food.', icon: '🔥' }
    case Status.READY:
      return { title: 'Order is Ready!', detail: 'Please collect your order.', icon: '🎉' }
    case Status.COMPLETED:
      return { title: 'Enjoy Your Meal', detail: 'This order is complete.', icon: '✨' }
    case Status.CANCELLED:
      return { title: 'Order Cancelled', detail: 'Nothing has been charged.', icon: '❌' }
    case Status.REJECTED:
      return { title: 'Order Declined', detail: 'The restaurant could not take this order.', icon: '⚠️' }
    case Status.EXPIRED:
      return { title: 'Order Expired', detail: 'It was not confirmed in time.', icon: '⏰' }
    default:
      return { title: 'Order Placed', detail: '', icon: '🧾' }
  }
}

export default function OrderStatus() {
  const { publicId = '' } = useParams()
  const queryClient = useQueryClient()

  const { data, isPending, isError } = useQuery({
    queryKey: ['order', publicId],
    queryFn: () => fetchOrder(publicId),
    refetchInterval: (query) =>
      query.state.data && SETTLED.has(query.state.data.order.status) ? false : 5000,
    refetchOnWindowFocus: true,
  })

  const cancel = useMutation({
    mutationFn: () => cancelOrder(publicId),
    onSuccess: (result) => {
      queryClient.setQueryData(['order', publicId], result)
    },
  })

  if (isPending) return <div className="min-h-dvh bg-ground" />

  if (isError || !data) {
    return (
      <main className="bg-ground flex min-h-dvh items-center justify-center px-4">
        <Card variant="glass" className="max-w-sm px-8 py-10 text-center animate-fade-in shadow-lg border-border">
          <h1 className="text-h2">Order not found</h1>
          <p className="mt-3 text-body text-ink-soft">
            It may belong to a different table.
          </p>
          <Link to="/menu">
             <Button variant="primary" className="mt-6 w-full">Back to Menu</Button>
          </Link>
        </Card>
      </main>
    )
  }

  const { order } = data
  const { title, detail, icon } = headline(order.status)
  const cancellable = order.status === Status.PLACED || order.status === Status.CASH_PENDING
  
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
        <main className="flex-1 px-4 md:px-8 py-8 md:py-12 animate-fade-in">
          
          {/* Top meta */}
          <div className="flex items-center justify-between mb-8">
             <div>
               <p className="text-small font-semibold uppercase tracking-wider text-ink-faint">
                 Order No.
               </p>
               <p className="text-h2 font-bold text-ink mt-1">#{order.orderNumber}</p>
             </div>
             {order.tableLabel ? (
                <div className="flex flex-col items-end">
                   <p className="text-small font-semibold uppercase tracking-wider text-ink-faint">Table</p>
                   <p className="text-h2 font-bold text-ink mt-1">{order.tableLabel}</p>
                </div>
             ) : null}
          </div>

          {/* Status Display */}
          <Card variant="glass" className={`text-center py-10 px-6 border ${borderClass} ${bgWashClass} transition-colors duration-500`}>
             <div className="text-6xl mb-4 animate-slide-up inline-block" style={{ animationDuration: '600ms' }}>
                {icon}
             </div>
             <h1 className={`text-h1 mb-2 ${statusColorClass}`}>{title}</h1>
             <p className="text-body text-ink-soft max-w-md mx-auto">{detail}</p>
          </Card>

          {/* Progress Timeline */}
          <div className="mt-10 px-2">
            <StateBand status={order.status} />
            <p className="mt-8 text-center text-small font-medium text-ink-faint">
              Placed {relativeTime(order.placedAt)}
            </p>
          </div>

          <div className="h-px bg-border my-10"></div>

          {/* Order items */}
          <section>
            <h2 className="text-h3 font-bold text-ink mb-6">Order Details</h2>

            <ul className="space-y-4">
              {order.items.map((line, index) => (
                <li
                  key={`${line.nameSnapshot.en}-${index}`}
                  className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">
                      <span className="tnum font-bold text-accent mr-2">{line.quantity}&times;</span>
                      {line.nameSnapshot.en}
                    </p>
                    {line.modifiers.length > 0 ? (
                      <p className="mt-1 text-small text-ink-soft">
                        {line.modifiers.map((m) => m.nameSnapshot.en).join(', ')}
                      </p>
                    ) : null}
                    {line.note ? (
                      <p className="mt-1 text-small text-ink-faint italic">&ldquo;{line.note}&rdquo;</p>
                    ) : null}
                  </div>
                  <Price halalas={line.lineTotalHalalas} className="font-semibold text-ink" />
                </li>
              ))}
            </ul>

            {/* Totals */}
            <Card variant="subtle" className="mt-6 p-5">
              <dl className="space-y-3">
                <div className="flex justify-between text-small text-ink-soft">
                  <dt>Subtotal</dt>
                  <dd><Price halalas={order.totals.subtotalHalalas} /></dd>
                </div>
                <div className="flex justify-between text-small text-ink-soft">
                  <dt>VAT</dt>
                  <dd><Price halalas={order.totals.vatHalalas} /></dd>
                </div>
                {order.totals.serviceChargeHalalas > 0 ? (
                  <div className="flex justify-between text-small text-ink-soft">
                    <dt>Service</dt>
                    <dd><Price halalas={order.totals.serviceChargeHalalas} /></dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-2">
                  <dt className="text-body font-semibold text-ink">Total</dt>
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
                  {cancel.isPending ? 'Cancelling…' : 'Cancel Order'}
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
                Order Something Else
              </Button>
            </Link>
          </div>

        </main>
      </div>
    </div>
  )
}
