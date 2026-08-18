import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { SwipeableItem } from '../components/SwipeableItem.js'
import { Price } from '../components/Price.js'
import { ApiError, placeOrder } from '../lib/api.js'
import { cartTotal, clearCart, lineTotal, setQuantity, toOrderLines, useCart, type CartLine } from '../lib/cart.js'
import { useLongPress } from '../hooks/useLongPress.js'
import { newIdempotencyKey } from '../lib/format.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'
import { Card } from '../components/ui/Card.js'
import { useI18n } from '../lib/i18n.js'

export default function Cart() {
  const cart = useCart()
  const navigate = useNavigate()
  const [note, setNote] = useState('')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const { t } = useI18n()

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
          <div className="mb-8 relative w-48 h-48 drop-shadow-2xl">
            <img src="/images/empty_cart.png" alt="Empty Cart" className="w-full h-full object-contain animate-float" />
          </div>
          <h1 className="text-h1">{t('cartEmpty')}</h1>
          <p className="mt-3 text-body text-ink-soft max-w-[30ch]">
            {t('cartEmptyDesc')}
          </p>
          <Link
            to="/menu"
            className="mt-8"
          >
            <Button variant="primary">{t('exploreMenu')}</Button>
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
             <h1 className="text-h1 text-ink font-bold">{t('reviewOrder')}</h1>
             <p className="text-body text-ink-soft mt-1">{t('reviewOrderDesc')}</p>
          </div>

          <div className="space-y-4 flex-1">
            <ul className="space-y-4 stagger">
              {cart.map((line) => (
                <li key={line.lineId}>
                  <CartItem line={line} />
                </li>
              ))}
            </ul>

            {/* Kitchen note */}
            <div className="mt-8">
              <Input
                label={t('noteForKitchen')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('noteForKitchen')}
              />
            </div>
          </div>
        </main>

        <div className="fixed md:absolute bottom-0 inset-x-0 bg-ground/80 backdrop-blur-xl border-t border-border p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] z-20">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-body font-medium text-ink-soft">{t('total')}</span>
            <Price halalas={cartTotal(cart)} className="text-h2 font-black text-ink" />
          </div>

          <div className="flex gap-3">
             <button
               type="button"
               onClick={() => void navigate('/menu')}
               className="flex-1 py-4 font-bold text-ink-soft bg-surface border border-border rounded-xl hover:bg-surface-hover hover:text-ink transition-colors shadow-sm"
             >
               {t('addMore')}
             </button>
             <button
               type="button"
               disabled={placing}
               onClick={() => void submit()}
               className="flex-[2] py-4 font-bold text-white bg-accent hover:bg-accent-wash rounded-xl shadow-lg transition-colors disabled:opacity-50 relative overflow-hidden"
             >
               <span className="relative z-10 flex items-center justify-center gap-2">
                  {placing ? 'Placing Order...' : t('placeOrder')}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
               </span>
             </button>
          </div>

          {error ? (
            <p className="mt-4 text-center text-small font-semibold text-status-danger bg-status-danger-wash py-2 rounded-lg border border-status-danger/20 animate-shake">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CartItem({ line }: { line: CartLine }) {
  const { locale } = useI18n()
  
  const minusPress = useLongPress(() => setQuantity(line.lineId, Math.max(0, line.quantity - 1)))
  const plusPress = useLongPress(() => setQuantity(line.lineId, line.quantity + 1))

  return (
    <SwipeableItem onSwipeComplete={() => setQuantity(line.lineId, 0)}>
      <Card variant="glass" className="p-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-h3 font-bold text-ink">{line.name?.[locale] ?? line.name?.en ?? 'Item'}</h3>
            {line.modifiers.length > 0 ? (
              <p className="mt-1.5 text-small text-ink-soft leading-snug">
                {line.modifiers.map((m) => m.name?.[locale] ?? m.name?.en).join(', ')}
              </p>
            ) : null}
            {line.note ? (
              <p className="mt-1.5 text-small text-ink-faint italic">&ldquo;{line.note}&rdquo;</p>
            ) : null}
          </div>
          <Price halalas={lineTotal(line)} className="font-bold text-ink" />
        </div>

        <div className="flex items-center justify-between mt-2 pt-4 border-t border-border">
          <div className="flex items-center rounded-xl bg-surface-hover border border-border overflow-hidden select-none">
            <button
              type="button"
              onClick={() => setQuantity(line.lineId, line.quantity - 1)}
              {...minusPress}
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
              {...plusPress}
              aria-label="One more"
              className="pressable flex items-center justify-center h-10 w-10 text-body text-ink-soft hover:bg-surface hover:text-ink transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </Card>
    </SwipeableItem>
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
