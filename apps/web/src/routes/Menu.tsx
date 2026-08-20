import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Price } from '../components/Price.js'
import { fetchMenu, fetchRestaurantStatus, type MenuCategory, type MenuItem } from '../lib/api.js'
import { addToCart, cartCount, cartTotal, useCart } from '../lib/cart.js'
import { getSession } from '../lib/session.js'
import { Skeleton } from '../components/ui/Skeleton.js'
import { Button } from '../components/ui/Button.js'
import { useState, useRef, useEffect } from 'react'
import { useI18n } from '../lib/i18n.js'
import { usePullToRefresh } from '../hooks/usePullToRefresh.js'
import { CallWaiterFab } from '../components/CallWaiterFab.js'

export default function Menu() {
  const session = getSession()
  const cart = useCart()
  const { t, locale, setLocale } = useI18n()

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['menu'],
    queryFn: fetchMenu,
    staleTime: 30_000,
  })

  const { refreshing, pullProgress } = usePullToRefresh(async () => {
    await refetch()
  })

  const { data: statusData } = useQuery({
    queryKey: ['restaurantStatus'],
    queryFn: fetchRestaurantStatus,
    refetchInterval: 30_000,
  })

  const [search, setSearch] = useState('')
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!headerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.borderBoxSize[0]?.blockSize ?? 0
      if (height) document.documentElement.style.setProperty('--app-header-h', `${height}px`)
    })
    observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [])

  const count = cartCount(cart)

  return (
    <div className="min-h-dvh bg-ground transition-colors duration-300 relative overflow-hidden">
      
      {/* Pull to refresh indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center z-30 pointer-events-none transition-opacity duration-200"
        style={{ 
          transform: `translateY(${Math.max(-40, pullProgress * 40 - 40)}px)`,
          opacity: pullProgress > 0 ? 1 : 0
        }}
      >
        <div className="mt-4 bg-surface shadow-md border border-border rounded-full p-2 text-accent flex items-center justify-center">
          <svg 
            className={`w-6 h-6 ${refreshing ? 'animate-spin text-status-success' : ''}`} 
            style={{ transform: `rotate(${pullProgress * 360}deg)` }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      </div>

      {/* Premium Header */}
      <header ref={headerRef} className="sticky top-0 z-20 bg-ground/80 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="mx-auto max-w-2xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-h2 text-ink">
                {session?.restaurant.name[locale] ?? session?.restaurant.name.en ?? t('menu')}
              </h1>
              {session?.table.label ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-status-success animate-pulse"></span>
                  <span className="text-small text-ink-soft font-semibold">
                    {t('table')} {session.table.label}
                  </span>
                  {statusData?.estimatedWaitMinutes ? (
                    <>
                      <span className="text-ink-faint mx-1">•</span>
                      <span className="text-small text-ink-soft font-semibold flex items-center gap-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        Wait: ~{statusData.estimatedWaitMinutes}m
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Link to="/my-orders" className="text-small font-bold text-ink-soft hover:text-ink transition-colors px-3 py-1.5 rounded-lg bg-surface-strong">
                {t('myOrders') ?? 'My Orders'}
              </Link>
              <button 
                onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
                className="text-small font-bold text-ink-soft hover:text-ink transition-colors px-3 py-1.5 rounded-lg bg-surface-strong"
              >
                {locale === 'ar' ? 'English' : 'عربي'}
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="mt-4 relative">
            <input 
              type="text" 
              placeholder={t('searchMenu')} 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-hover border border-border rounded-xl py-2.5 px-10 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash transition-all"
            />
            <svg className="absolute start-3 top-3 h-5 w-5 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Category Quick Jump */}
          {!isPending && data?.categories && data.categories.length > 0 && (
            <div className="mt-4 -mx-4 px-4 overflow-x-auto hide-scrollbar flex gap-2 pb-1">
              {data.categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    document.getElementById(`category-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="whitespace-nowrap px-4 py-1.5 rounded-full bg-surface-hover border border-border text-small font-semibold text-ink-soft hover:text-ink hover:bg-surface-strong transition-colors"
                >
                  {cat.name[locale] ?? cat.name.en}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-2xl px-4 pb-32">
        {isPending ? <MenuSkeleton /> : null}

        {isError ? (
          <div className="pt-20 text-center animate-fade-in">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-status-danger-wash text-status-danger">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-h2">{t('menuUnavailable')}</h2>
            <p className="mt-2 text-body text-ink-soft">
              {t('checkConnection')}
            </p>
            <Button variant="primary" onClick={() => void refetch()} className="mt-6">
              {t('tryAgain')}
            </Button>
          </div>
        ) : null}

        {data?.categories.length === 0 ? (
          <div className="pt-24 text-center animate-fade-in">
            <h2 className="text-h2">{t('noItemsFound')}</h2>
            <p className="mt-2 text-body text-ink-soft">
              {t('updatingMenu')}
            </p>
          </div>
        ) : null}

        <div className="stagger mt-6 space-y-10">
          {(() => {
            const visibleCategories = data?.categories.map((category) => {
              const filteredItems = category.items.filter(item => {
                const name = item.name[locale] ?? item.name.en;
                const desc = item.description?.[locale] ?? item.description?.en;
                return name.toLowerCase().includes(search.toLowerCase()) || 
                       (desc && desc.toLowerCase().includes(search.toLowerCase()));
              })
              return { ...category, items: filteredItems }
            }).filter(category => category.items.length > 0) ?? []

            if (visibleCategories.length === 0 && search && !isPending) {
              return (
                <div className="pt-12 text-center animate-fade-in">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface-strong text-ink-soft">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  </div>
                  <h2 className="text-h2">No results for "{search}"</h2>
                  <p className="mt-2 text-body text-ink-soft">
                    Try checking your spelling or using less specific terms.
                  </p>
                  <Button variant="secondary" onClick={() => setSearch('')} className="mt-6">
                    Clear search
                  </Button>
                </div>
              )
            }

            return visibleCategories.map(category => (
              <Category key={category.id} category={category} />
            ))
          })()}
        </div>

        {/* Need Help Footer */}
        <div className="mt-20 pt-10 border-t border-border flex flex-col items-center justify-center text-center pb-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-surface shadow-sm border border-border mb-4 text-ink-soft">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </div>
          <h3 className="text-h3 font-bold text-ink">Need Assistance?</h3>
          <p className="mt-2 text-body text-ink-soft">Speak to a member of our staff if you need help ordering or have any questions.</p>
        </div>
      </main>

      {/* Floating Cart Button */}
      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-2xl px-4 pb-6">
            <Link
              to="/cart"
              className="btn-gradient pointer-events-auto pressable flex items-center justify-between p-4 shadow-lg animate-slide-up"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/20 text-small font-bold">
                  {count}
                </span>
                <span className="text-body font-semibold">{t('viewOrder')}</span>
              </div>
              <Price halalas={cartTotal(cart)} className="font-semibold text-h3" />
            </Link>
          </div>
        </div>
      ) : null}
      
      <CallWaiterFab />
    </div>
  )
}

function Category({ category }: { category: MenuCategory }) {
  const { locale } = useI18n()
  return (
    <section id={`category-${category.id}`} style={{ scrollMarginTop: 'calc(var(--app-header-h, 160px) + 16px)' }}>
      <div 
        className="sticky z-10 bg-ground/95 backdrop-blur-md py-3 -mx-4 px-4 border-b border-border shadow-sm"
        style={{ top: 'calc(var(--app-header-h, 150px) - 1px)' }}
      >
        <h2 className="text-h3 font-bold text-ink">
          {category.name[locale] ?? category.name.en}
        </h2>
      </div>

      <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2">
        {category.items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function Item({ item }: { item: MenuItem }) {
  const { t, locale } = useI18n()
  /**
   * Only a *required* group forces a trip to the detail screen. The server
   * rejects an order line that skips one (`pricing.ts`), so quick-adding such an
   * item would fail at checkout, long after the mistake was made. Optional
   * extras are safe to skip, so those items still get a one-tap Add.
   */
  const needsChoices = item.modifierGroups.some((group) => group.required)
  const [added, setAdded] = useState(false)

  function quickAdd() {
    addToCart(item, [])
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50) // Short vibration for haptic feedback
    }
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1400)
  }

  return (
    <article
      className={[
        'bg-surface border border-border rounded-2xl p-3 flex flex-col gap-3 shadow-sm transition-colors',
        item.isSoldOut ? 'opacity-60' : 'hover:border-border-strong',
      ].join(' ')}
    >
      <Link
        to={`/item/${item.id}`}
        className="group flex items-start gap-4 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="text-body font-bold text-ink group-hover:text-accent transition-colors">
              {item.name[locale] ?? item.name.en}
            </h3>
            {item.isSoldOut ? (
              <span className="mt-0.5 shrink-0 rounded-md bg-surface-strong px-2 py-0.5 text-caption font-bold uppercase tracking-wide text-ink-soft ring-1 ring-border">
                {t('soldOut')}
              </span>
            ) : null}
          </div>

          {(item.description?.[locale] ?? item.description?.en) ? (
            <p className="mt-1 line-clamp-2 text-small text-ink-soft leading-snug">
              {item.description?.[locale] ?? item.description?.en}
            </p>
          ) : null}

          <ItemFacts item={item} />
        </div>

        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="size-24 shrink-0 rounded-xl bg-surface-strong object-cover ring-1 ring-border shadow-sm"
          />
        ) : (
          <div className="size-24 shrink-0 rounded-xl bg-surface-strong ring-1 ring-border flex items-center justify-center text-ink-faint">
            <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <Price halalas={item.priceHalalas} className="font-bold text-ink" />

        <div className="flex items-center gap-2">
          <Link
            to={`/item/${item.id}`}
            className="pressable rounded-lg px-3 py-1.5 text-small font-semibold text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors"
          >
            View
          </Link>

          {item.isSoldOut ? (
            // Deliberately not a disabled Add: there is nothing to retry, and a
            // greyed button invites tapping. The dish stays readable so the
            // customer knows it exists and can ask staff.
            <span className="rounded-lg px-3 py-1.5 text-small font-semibold text-ink-faint">
              {t('unavailable')}
            </span>
          ) : needsChoices ? (
            <Link
              to={`/item/${item.id}`}
              className="btn-gradient pressable px-3 py-1.5 text-small"
              aria-label={`Choose options for ${item.name.en}`}
            >
              {t('choose')}
            </Link>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={quickAdd}
              aria-label={`Add ${item.name.en} to the order`}
            >
              {added ? t('added') : t('add')}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * Prep time, calories and allergens.
 *
 * Allergens read "Contains: …" rather than sitting as bare chips — a lone word
 * like "Coconut" beside a price is ambiguous, and this is the one piece of menu
 * data where being misread has a physical consequence. The wording that it is
 * the restaurant's own statement lives on the item screen, where the full list
 * is shown and the decision is actually made.
 */
function ItemFacts({ item }: { item: MenuItem }) {
  const { t } = useI18n()
  const hasFacts =
    item.prepTimeMinutes != null || item.calories != null || item.allergens.length > 0
  if (!hasFacts) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-ink-faint">
      {item.prepTimeMinutes != null ? <span className="tnum">{item.prepTimeMinutes} min</span> : null}
      {item.calories != null ? <span className="tnum">{item.calories} kcal</span> : null}

      {item.allergens.length > 0 ? (
        <span className="text-status-warning font-medium">
          {t('contains')} {item.allergens.join(', ')}
        </span>
      ) : null}
    </div>
  )
}

function MenuSkeleton() {
  return (
    <div className="pt-8 space-y-10" aria-hidden="true">
      {[1, 2].map((section) => (
        <div key={section}>
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-surface p-3 flex gap-4">
                <div className="flex-1 flex flex-col">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3 mb-3" />
                  <Skeleton className="h-5 w-20 mt-auto" />
                </div>
                <Skeleton className="size-24 rounded-xl shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
