import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Price } from '../components/Price.js'
import { fetchMenu, type MenuCategory, type MenuItem } from '../lib/api.js'
import { addToCart, cartCount, cartTotal, useCart } from '../lib/cart.js'
import { getSession } from '../lib/session.js'
import { Skeleton } from '../components/ui/Skeleton.js'
import { Button } from '../components/ui/Button.js'
import { useId, useLayoutEffect, useRef, useState } from 'react'

/**
 * Publishes the real height of the sticky header as `--app-header-h`.
 *
 * The category headings stick *below* the page header, so they need to know how
 * tall it is. That was a hard-coded `top-[108px]`, which is only ever right on
 * one device: the header includes `env(safe-area-inset-top)`, so on a notched
 * phone the category bar overlapped the search field, and with larger text
 * settings it floated below it leaving a strip of scrolling content visible.
 * Measuring is the convention this repo already states for sticky offsets.
 */
function useHeaderHeightVar<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const publish = () => {
      document.documentElement.style.setProperty(
        '--app-header-h',
        `${Math.round(element.getBoundingClientRect().height)}px`,
      )
    }

    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return ref
}

export default function Menu() {
  const session = getSession()
  const cart = useCart()

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['menu'],
    queryFn: fetchMenu,
    staleTime: 30_000,
  })

  const [search, setSearch] = useState('')
  const searchId = useId()
  const headerRef = useHeaderHeightVar<HTMLElement>()

  const count = cartCount(cart)

  const query = search.trim().toLowerCase()

  const matches = (item: MenuItem) =>
    item.name.en.toLowerCase().includes(query) ||
    (item.description?.en?.toLowerCase().includes(query) ?? false)

  const visibleCategories = (data?.categories ?? [])
    .map((category) => ({ ...category, items: category.items.filter(matches) }))
    .filter((category) => category.items.length > 0)

  // A search that matches nothing used to render an empty page: every category
  // returned null and the only heading on screen was the restaurant's name.
  const noResults = query.length > 0 && visibleCategories.length === 0

  // Announced rather than only shown, so the result of typing reaches someone
  // who cannot see the list shrink.
  const resultCount = visibleCategories.reduce((sum, c) => sum + c.items.length, 0)

  return (
    <div className="min-h-dvh bg-ground transition-colors duration-300">
      {/* Premium Header */}
      <header
        ref={headerRef}
        className="sticky top-0 z-20 bg-ground/80 backdrop-blur-xl border-b border-border shadow-sm"
      >
        <div className="mx-auto max-w-2xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-h2 text-ink">
                {session?.restaurant.name.en ?? 'Menu'}
              </h1>
              {session?.table.label ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-status-success animate-pulse"></span>
                  <span className="text-small text-ink-soft font-semibold">
                    Table {session.table.label}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="mt-4 relative">
            {/*
              A placeholder is not a label: it disappears as soon as anything is
              typed, and assistive technology may not read it at all. The label
              is visually hidden so the design is unchanged and the field still
              has a name.
            */}
            <label htmlFor={searchId} className="sr-only">
              Search the menu
            </label>
            <input
              id={searchId}
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Search the menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-hover border border-border rounded-xl py-2.5 ps-10 pe-4 text-body text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-wash transition-all"
            />
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-3 h-5 w-5 text-ink-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32">
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
            <h2 className="text-h2">Menu Unavailable</h2>
            <p className="mt-2 text-body text-ink-soft">
              Please check your connection and try again.
            </p>
            <Button variant="primary" onClick={() => void refetch()} className="mt-6">
              Try again
            </Button>
          </div>
        ) : null}

        {data && data.categories.length === 0 ? (
          <div className="pt-24 text-center animate-fade-in">
            <h2 className="text-h2">Nothing on the menu yet</h2>
            <p className="mt-2 text-body text-ink-soft">
              The restaurant is updating their menu. Check back soon.
            </p>
          </div>
        ) : null}

        {noResults ? (
          <div className="pt-24 text-center animate-fade-in">
            <h2 className="text-h2">No dishes match “{search.trim()}”</h2>
            <p className="mt-2 text-body text-ink-soft">
              Try a shorter word, or clear the search to see the whole menu.
            </p>
            <Button variant="secondary" onClick={() => setSearch('')} className="mt-6">
              Clear search
            </Button>
          </div>
        ) : null}

        {/* Politely, so it does not interrupt while the customer is still typing. */}
        <p aria-live="polite" className="sr-only">
          {query ? `${resultCount} ${resultCount === 1 ? 'dish' : 'dishes'} match ${search.trim()}` : ''}
        </p>

        <div className="stagger mt-6 space-y-10">
          {visibleCategories.map((category) => (
            <Category key={category.id} category={category} />
          ))}
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
                <span className="text-body font-semibold">View Order</span>
              </div>
              <Price halalas={cartTotal(cart)} className="font-semibold text-h3" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Category({ category }: { category: MenuCategory }) {
  return (
    <section>
      {/* Offset measured into --app-header-h, never a constant — see useHeaderHeightVar. */}
      <div className="sticky top-[var(--app-header-h,7rem)] z-10 bg-ground/95 backdrop-blur-md py-3 -mx-4 px-4 border-b border-border shadow-sm">
        <h2 className="text-h3 font-bold text-ink">
          {category.name.en}
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
              {item.name.en}
            </h3>
            {item.isSoldOut ? (
              <span className="mt-0.5 shrink-0 rounded-md bg-surface-strong px-2 py-0.5 text-caption font-bold uppercase tracking-wide text-ink-soft ring-1 ring-border">
                Sold out
              </span>
            ) : null}
          </div>

          {item.description?.en ? (
            <p className="mt-1 line-clamp-2 text-small text-ink-soft leading-snug">
              {item.description.en}
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
              Unavailable
            </span>
          ) : needsChoices ? (
            <Link
              to={`/item/${item.id}`}
              className="btn-gradient pressable px-3 py-1.5 text-small"
              aria-label={`Choose options for ${item.name.en}`}
            >
              Choose
            </Link>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={quickAdd}
              aria-label={`Add ${item.name.en} to the order`}
            >
              {added ? 'Added' : 'Add'}
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
  const hasFacts =
    item.prepTimeMinutes != null || item.calories != null || item.allergens.length > 0
  if (!hasFacts) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-ink-faint">
      {item.prepTimeMinutes != null ? <span className="tnum">{item.prepTimeMinutes} min</span> : null}
      {item.calories != null ? <span className="tnum">{item.calories} kcal</span> : null}

      {item.allergens.length > 0 ? (
        <span className="text-status-warning font-medium">
          Contains: {item.allergens.join(', ')}
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
