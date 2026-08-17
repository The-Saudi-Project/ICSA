import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { fetchMyOrders } from '../lib/api.js'
import { Price } from '../components/Price.js'
import { Card } from '../components/ui/Card.js'
import { useI18n } from '../lib/i18n.js'

export default function MyOrders() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const { data, isPending, isError } = useQuery({
    queryKey: ['myOrders'],
    queryFn: fetchMyOrders,
  })

  return (
    <div className="min-h-dvh bg-ground transition-colors">
      <header className="sticky top-0 z-20 bg-ground/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center px-4 py-4">
          <button
            type="button"
            onClick={() => void navigate('/menu')}
            className="pressable flex items-center justify-center size-10 rounded-full bg-surface border border-border text-ink-soft hover:text-ink shadow-sm mr-4"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-h2 text-ink">{t('myOrders')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
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
                      <p className="text-body font-bold text-ink mt-1">
                        {order.items.length} item{order.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Price halalas={order.totals.grandTotalHalalas} className="text-h3 font-bold" />
                      <span className={`text-xs px-2 py-1 rounded-full font-bold mt-1 inline-block ${
                        order.status === 'COMPLETED' ? 'bg-status-success/10 text-status-success' : 'bg-status-info/10 text-status-info'
                      }`}>
                        {order.status}
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
