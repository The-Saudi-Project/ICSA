import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Price } from '../components/Price.js'
import { ApiError, placeOrder } from '../lib/api.js'
import { cartTotal, clearCart, lineTotal, setQuantity, toOrderLines, useCart } from '../lib/cart.js'
import { newIdempotencyKey } from '../lib/format.js'
import { getSession } from '../lib/session.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'
import { Card } from '../components/ui/Card.js'

export default function Cart() {
  const cart = useCart()
  const navigate = useNavigate()
  const session = getSession()
  const [note, setNote] = useState('')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)

  const includesVat = session?.restaurant.settings.pricesIncludeVat ?? true
  const vatRate = session?.restaurant.settings.vatRatePercent ?? 15

  async function submit() {
    if (placing || cart.length === 0) return
    setPlacing(true)
    setError(null)

    try {
      const { order } = await placeOrder(
        toOrderLines(cart),
        idempotencyKey,
        note.trim() || undefined,
      )
      clearCart()
      void navigate(`/order/${order.publicId}`, { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'The order did not go through. Check the connection and try again.'
      setError(message)
      if (err instanceof ApiError && err.status === 400) setIdempotencyKey(newIdempotencyKey())
      setPlacing(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-dvh bg-ground transition-colors">
        <Header />
        <main className="mx-auto max-w-2xl px-4 pt-24 text-center flex flex-col items-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-surface shadow-sm border border-border text-ink-faint">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
          <h1 className="text-h1">Your cart is empty</h1>
          <p className="mt-3 text-body text-ink-soft max-w-[30ch]">
            Looks like you haven't added anything to your order yet.
          </p>
          <Link
            to="/menu"
            className="mt-8"
          >
            <Button variant="primary">Explore Menu</Button>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-ground-sunken transition-colors md:p-6 md:flex md:justify-center">
      <div className="w-full max-w-2xl bg-ground md:rounded-[32px] md:border md:border-border md:shadow-2xl relative min-h-[100dvh] md:min-h-0 flex flex-col">
        <Header />

        <main className="flex-1 px-4 md:px-8 pb-40 animate-fade-in flex flex-col">
          <div className="py-6 border-b border-border mb-6">
             <h1 className="text-h1 text-ink font-bold">Review Order</h1>
             <p className="text-body text-ink-soft mt-1">Check your items before placing the order.</p>
          </div>

          <div className="space-y-4 flex-1">
            <ul className="space-y-4 stagger">
              {cart.map((line) => (
                <li key={line.lineId}>
                  <Card variant="glass" className="p-4 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-h3 font-bold text-ink">{line.name}</h3>
                        {line.modifiers.length > 0 ? (
                          <p className="mt-1.5 text-small text-ink-soft leading-snug">
                            {line.modifiers.map((m) => m.name).join(', ')}
                          </p>
                        ) : null}
                        {line.note ? (
                          <p className="mt-1.5 text-small text-ink-faint italic">&ldquo;{line.note}&rdquo;</p>
                        ) : null}
                      </div>
                      <Price halalas={lineTotal(line)} className="font-bold text-ink" />
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-4 border-t border-border">
                      <div className="flex items-center rounded-xl bg-surface-hover border border-border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                          aria-label={line.quantity === 1 ? `Remove ${line.name}` : 'One fewer'}
                          className="pressable flex items-center justify-center h-10 w-10 text-body text-ink-soft hover:bg-surface hover:text-ink transition-colors"
                        >
                          {line.quantity === 1 ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          ) : '−'}
                        </button>
                        <span className="tnum w-8 text-center text-body font-bold">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                          aria-label="One more"
                          className="pressable flex items-center justify-center h-10 w-10 text-body text-ink-soft hover:bg-surface hover:text-ink transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            {/* Kitchen note */}
            <div className="mt-8">
              <Input
                label="Note for the kitchen"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Allergies, how you would like it..."
              />
            </div>

            {/* Total section */}
            <Card variant="glass" className="mt-8 p-6 bg-surface-hover">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-body font-semibold text-ink-soft">Total</span>
                  <p className="mt-1 text-caption text-ink-faint">
                    {includesVat
                      ? `Includes ${vatRate}% VAT. Confirmed by restaurant.`
                      : `${vatRate}% VAT added at the till.`}
                  </p>
                </div>
                <Price halalas={cartTotal(cart)} className="text-h1 font-bold text-ink" />
              </div>
            </Card>

            {/* Cash payment info */}
            <div className="mt-6 flex items-start gap-4 rounded-2xl bg-gold-wash p-5 border border-gold/20">
              <div className="p-2 bg-gold/10 rounded-xl text-gold shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <div>
                <p className="text-body font-bold text-gold-dim">Pay with cash at counter</p>
                <p className="mt-1 text-small text-gold-dim/80">
                  The kitchen starts once a cashier confirms your payment.
                </p>
              </div>
            </div>

            {error ? (
              <div role="alert" className="mt-6 rounded-2xl bg-status-danger-wash p-4 border border-status-danger/20 flex items-start gap-3">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <p className="text-small text-status-danger font-medium">{error}</p>
              </div>
            ) : null}
          </div>
        </main>

        {/* Place order button */}
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-ground/95 backdrop-blur-xl rounded-b-[32px] overflow-hidden">
          <div className="mx-auto p-4 md:px-8 md:py-6">
            <Button
              variant="primary"
              onClick={() => void submit()}
              isLoading={placing}
              className="w-full h-14 px-6 text-lead shadow-lg"
            >
              <div className="w-full flex items-center justify-between">
                <span>
                  {placing ? 'Placing your order…' : 'Place Order'}
                </span>
                {!placing && <Price halalas={cartTotal(cart)} className="font-bold" />}
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Header() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 bg-ground/80 backdrop-blur-xl border-b border-border md:rounded-t-[32px]">
      <div className="flex items-center px-4 md:px-8 py-4">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="pressable flex items-center justify-center size-10 rounded-full bg-surface border border-border text-ink-soft hover:text-ink shadow-sm"
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
    </header>
  )
}
