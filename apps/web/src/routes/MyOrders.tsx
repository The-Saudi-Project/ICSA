import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { fetchMyOrders } from '../lib/api.js'
import { Price } from '../components/Price.js'
import { Card } from '../components/ui/Card.js'
import { useI18n } from '../lib/i18n.js'

export default function MyOrders() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['myOrders'],
    queryFn: fetchMyOrders,
    retry: false
  })

  // If unauthorized, show a prompt to login
  if (error && (error as any).status === 401) {
    return (
      <div className="min-h-dvh bg-ground flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-6 text-ink-soft">
           <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h2 className="text-h2 mb-2">Sign in to view orders</h2>
        <p className="text-body text-ink-soft mb-8">You need to be signed in to see your past orders and receipts.</p>
        <button 
          onClick={() => void navigate('/')}
          className="btn-primary"
        >
          Go to Home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-ground transition-colors">
      <header className="sticky top-0 z-20 bg-ground/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center px-4 py-4">
          <button
            type="button"
            onClick={() => void navigate('/menu')}
            className="pressable flex items-center justify-center size-10 rounded-full bg-surface border border-border text-ink-soft hover:text-ink shadow-sm mr-4"
            aria-label={t('goBack') ?? 'Go back'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-h2 text-ink">{t('myOrders')}</h1>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-2xl px-4 py-8">
        {isPending ? (
          <p className="text-ink-soft">Loading your orders...</p>
        ) : isError ? (
          <p className="text-status-danger">Failed to load orders. Please try again.</p>
        ) : data?.orders.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-h2 text-ink">No Orders Yet</h2>
            <p className="mt-2 text-ink-soft">You haven't placed any orders in this session.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.orders.map(order => (
              <Link key={order.publicId} to={`/order/${order.publicId}`} className="block">
                <Card variant="glass" className="p-4 hover:border-border-strong transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-small font-bold text-ink-faint">Order #{order.orderNumber}</p>
                      {/* Using any to bypass TS error because we added restaurantId populate in backend */}
                      {(order as any).restaurantId && (
                        <p className="text-xs font-bold text-ink-soft">{(order as any).restaurantId.name?.en || (order as any).restaurantId.name?.ar}</p>
                      )}
                      <p className="text-body font-bold text-ink mt-1">
                        {order.items.length} item{order.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Price halalas={order.totals.grandTotalHalalas} className="text-h3 font-bold" />
                      <span className={`text-xs px-2 py-1 rounded-full font-bold mt-1 inline-block ${
                        order.status === 'COMPLETED' ? 'bg-status-success/10 text-status-success' : 
                        order.status === 'CANCELLED' ? 'bg-status-danger/10 text-status-danger' : 
                        'bg-status-info/10 text-status-info'
                      }`}>
                        {order.paymentStatus === 'CASH_PENDING' ? 'Pay at Counter' : 
                         order.status === 'COMPLETED' ? 'Completed' :
                         order.status === 'CANCELLED' ? 'Cancelled' :
                         order.status === 'REJECTED' ? 'Declined' :
                         order.status === 'READY' ? 'Ready' :
                         order.status === 'PREPARING' ? 'Preparing' :
                         order.status === 'ACCEPTED' ? 'Accepted' :
                         order.status === 'CONFIRMED' ? 'Confirmed' :
                         order.status === 'PLACED' ? 'Received' :
                         order.status.charAt(0) + order.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
