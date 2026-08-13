import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Price } from '../components/Price.js'
import { fetchMenu, type MenuModifierGroup, type MenuModifierOption } from '../lib/api.js'
import { addToCart } from '../lib/cart.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'

type Selection = Record<string, string[]>

export default function ItemDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [selection, setSelection] = useState<Selection>({})
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data, isPending } = useQuery({
    queryKey: ['menu'],
    queryFn: fetchMenu,
    staleTime: 30_000,
  })

  const item = useMemo(
    () => data?.categories.flatMap((c) => c.items).find((i) => i.id === id),
    [data, id],
  )

  const chosen = useMemo(() => {
    if (!item) return []
    return item.modifierGroups.flatMap((group) =>
      (selection[group.key] ?? []).flatMap((optionKey) => {
        const option = group.options.find((o) => o.key === optionKey)
        return option ? [{ group: group.key, option }] : []
      }),
    )
  }, [item, selection])

  if (isPending) return <div className="min-h-dvh bg-ground" />

  if (!item) {
    return (
      <main className="bg-ground flex min-h-dvh items-center justify-center px-4">
        <div className="bg-surface border border-border shadow-md rounded-2xl max-w-sm px-8 py-10 text-center animate-fade-in">
          <h1 className="text-h2">Item unavailable</h1>
          <p className="mt-3 text-body text-ink-soft">It may have sold out or been removed.</p>
          <Button
            variant="primary"
            onClick={() => void navigate('/menu', { replace: true })}
            className="mt-6 w-full"
          >
            Back to menu
          </Button>
        </div>
      </main>
    )
  }

  const unitTotal =
    item.priceHalalas + chosen.reduce((sum, c) => sum + c.option.priceDeltaHalalas, 0)

  const unsatisfied = item.modifierGroups.filter(
    (g) => g.required && (selection[g.key]?.length ?? 0) < Math.max(1, g.minSelect),
  )

  function toggle(group: MenuModifierGroup, option: MenuModifierOption) {
    setSelection((current) => {
      const picked = current[group.key] ?? []
      const already = picked.includes(option.key)

      if (already) return { ...current, [group.key]: picked.filter((k) => k !== option.key) }
      if (group.maxSelect === 1) return { ...current, [group.key]: [option.key] }
      const next = [...picked, option.key]
      return {
        ...current,
        [group.key]: next.length > group.maxSelect ? next.slice(next.length - group.maxSelect) : next,
      }
    })
  }

  function add() {
    addToCart(item!, chosen, quantity, note.trim() || undefined)
    void navigate('/menu', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-ground-sunken md:bg-ground md:p-6 transition-colors flex justify-center">
      <div className={`w-full max-w-2xl md:rounded-[32px] md:overflow-hidden md:border md:border-border md:shadow-2xl bg-ground relative pb-32 transition-transform duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        
        {/* Header/Close Button */}
        <div className="absolute top-4 left-4 z-20">
          <button
            type="button"
            onClick={() => void navigate(-1)}
            className="pressable flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 shadow-sm"
            aria-label="Back to menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Hero Image */}
        <div className="w-full aspect-[4/3] md:aspect-[16/9] bg-surface-strong relative overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name.en}
              className="w-full h-full object-cover"
            />
          ) : (
             <div className="w-full h-full flex items-center justify-center text-ink-faint">
                <svg className="w-16 h-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
             </div>
          )}
          {/* Gradient Overlay for blending */}
          <div className="absolute inset-0 bg-gradient-to-t from-ground to-transparent opacity-80 h-full w-full pointer-events-none" />
        </div>

        {/* Content Section (Sliding up naturally) */}
        <div className="px-5 -mt-16 relative z-10 bg-ground rounded-t-3xl pt-8 pb-10">
          <h1 className="text-h1 text-ink">{item.name.en}</h1>

          {item.description?.en ? (
            <p className="mt-2 max-w-prose text-body text-ink-soft leading-relaxed">{item.description.en}</p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Price halalas={item.priceHalalas} className="text-h2 text-ink font-bold" />
          </div>

          {/* Prep time, calories, allergens */}
          {item.allergens.length > 0 || item.calories != null || item.prepTimeMinutes != null ? (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {item.prepTimeMinutes != null ? (
                  <span className="tnum rounded-lg bg-surface border border-border px-3 py-1.5 text-small font-medium text-ink-soft shadow-sm">
                    About {item.prepTimeMinutes} min
                  </span>
                ) : null}
                {item.calories != null ? (
                  <span className="tnum rounded-lg bg-surface border border-border px-3 py-1.5 text-small font-medium text-ink-soft shadow-sm">
                    {item.calories} kcal
                  </span>
                ) : null}
                {item.allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-lg bg-status-warning-wash border border-status-warning/20 px-3 py-1.5 text-small font-semibold text-status-warning shadow-sm"
                  >
                    {a}
                  </span>
                ))}
              </div>

              {/*
                Required, not decorative. We do not verify any of this — it is
                entered by the restaurant, and someone with an allergy deserves
                to know whose statement they are relying on. The API says the
                same thing at the field: "the UI must label it as the
                restaurant's own claim".
              */}
              <p className="mt-3 text-caption text-ink-faint leading-relaxed">
                Preparation time, calories and allergen information are provided by the restaurant.
                If you have an allergy, please speak to a member of staff.
              </p>
            </div>
          ) : null}

          <div className="h-px bg-border mt-8 mb-2"></div>

          {/* Modifier groups */}
          {item.modifierGroups.map((group) => (
            <fieldset key={group.key} className="mt-8 stagger">
              <legend className="flex w-full items-baseline justify-between gap-3 mb-4">
                <span className="text-h3 font-bold text-ink">
                  {group.name.en}
                </span>
                <span className="text-small font-semibold px-2 py-1 rounded-md bg-surface border border-border text-ink-soft shadow-sm">
                  {group.required ? 'Required' : group.maxSelect > 1 ? `Up to ${group.maxSelect}` : 'Optional'}
                </span>
              </legend>

              <ul className="mt-3 space-y-3">
                {group.options.map((option) => {
                  const picked = (selection[group.key] ?? []).includes(option.key)
                  return (
                    <li key={option.key}>
                      <button
                        type="button"
                        onClick={() => toggle(group, option)}
                        aria-pressed={picked}
                        className={[
                          'pressable flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-4 text-start transition-all duration-200 border shadow-sm',
                          picked
                            ? 'bg-accent-wash border-accent ring-1 ring-accent'
                            : 'bg-surface hover:bg-surface-hover border-border',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-4">
                          <span
                            className={[
                              'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
                              picked
                                ? 'border-accent bg-accent'
                                : 'border-border-strong',
                            ].join(' ')}
                          >
                            {picked ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : null}
                          </span>
                          <span className="text-body font-medium">{option.name.en}</span>
                        </span>
                        {option.priceDeltaHalalas > 0 ? (
                          <span className="tnum shrink-0 text-small font-bold text-gold">
                            +<Price halalas={option.priceDeltaHalalas} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          ))}

          {/* Note */}
          <div className="mt-10">
             <Input 
                label="Special Instructions" 
                placeholder="No onions, extra sauce..." 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
             />
          </div>
        </div>
      </div>

      {/* Floating Bottom Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl px-4 pb-4">
          <div className="bg-ground/95 backdrop-blur-xl border border-border shadow-lg rounded-2xl p-4 flex items-center gap-4 pointer-events-auto animate-slide-up">
            {/* Quantity stepper */}
            <div className="flex items-center rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity === 1}
                aria-label="One fewer"
                className="pressable flex items-center justify-center h-12 w-12 text-h2 disabled:text-border-strong disabled:bg-surface-hover transition-colors"
              >
                −
              </button>
              <span className="tnum w-10 text-center text-body font-bold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                aria-label="One more"
                className="pressable flex items-center justify-center h-12 w-12 text-h2 transition-colors hover:bg-surface-hover"
              >
                +
              </button>
            </div>

            {/* Add button */}
            <Button
              variant="primary"
              onClick={add}
              // Sold out is not a validation error the customer can fix, so the
              // button says what is true rather than asking for a choice. The
              // server refuses these orders anyway; this stops the customer
              // building one it will refuse.
              disabled={item.isSoldOut || unsatisfied.length > 0}
              className="flex-1 h-12 flex justify-between px-6"
            >
              <span>
                {item.isSoldOut
                  ? 'Sold out'
                  : unsatisfied.length > 0
                    ? `Select ${unsatisfied[0]!.name.en}`
                    : 'Add to Order'}
              </span>
              {!item.isSoldOut && unsatisfied.length === 0 ? (
                <Price halalas={unitTotal * quantity} className="font-bold" />
              ) : null}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
