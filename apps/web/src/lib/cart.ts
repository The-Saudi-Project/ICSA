/**
 * The cart.
 *
 * Lives in the browser only. An abandoned cart never touches the database —
 * `DRAFT` is a client-side state, which is why the server has no draft orders
 * to expire.
 *
 * It stores ids, quantities and modifier keys plus a *display* price copied
 * from the menu. That copy is for showing a running total while the customer
 * decides; it is never sent. The server prices the order from its own database
 * when it is placed, so a tampered cart changes what someone sees on their own
 * phone and nothing else.
 */

import { useSyncExternalStore } from 'react'
import type { MenuItem, MenuModifierOption, PlaceOrderLine } from './api.js'

export interface CartLine {
  /** Stable key: same item with different modifiers is a different line. */
  lineId: string
  menuItemId: string
  name: { en: string; ar?: string }
  quantity: number
  unitPriceHalalas: number
  modifiers: { groupKey: string; optionKey: string; name: { en: string; ar?: string }; priceDeltaHalalas: number }[]
  note?: string
}

const KEY = 'rw.cart'

let lines: CartLine[] = load()
const listeners = new Set<() => void>()

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

function commit(next: CartLine[]): void {
  lines = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable; the cart still works for this page view */
  }
  listeners.forEach((l) => {
    l()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Same item, same options, same note collapses into one line. */
function lineKey(menuItemId: string, options: MenuModifierOption[], note?: string): string {
  const keys = options
    .map((o) => o.key)
    .sort()
    .join('+')
  return `${menuItemId}|${keys}|${note ?? ''}`
}

export function addToCart(
  item: MenuItem,
  selected: { group: string; option: MenuModifierOption }[],
  quantity = 1,
  note?: string,
): void {
  const lineId = lineKey(
    item.id,
    selected.map((s) => s.option),
    note,
  )

  const existing = lines.find((l) => l.lineId === lineId)
  if (existing) {
    commit(
      lines.map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + quantity } : l)),
    )
    return
  }

  commit([
    ...lines,
    {
      lineId,
      menuItemId: item.id,
      name: { en: item.name.en, ar: item.name.ar },
      quantity,
      unitPriceHalalas: item.priceHalalas,
      modifiers: selected.map((s) => ({
        groupKey: s.group,
        optionKey: s.option.key,
        name: { en: s.option.name.en, ar: s.option.name.ar },
        priceDeltaHalalas: s.option.priceDeltaHalalas,
      })),
      ...(note ? { note } : {}),
    },
  ])
}

export function setQuantity(lineId: string, quantity: number): void {
  commit(
    quantity <= 0
      ? lines.filter((l) => l.lineId !== lineId)
      : lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
  )
}

export const clearCart = (): void => commit([])

export const useCart = (): CartLine[] =>
  useSyncExternalStore(subscribe, () => lines, () => [])

export const lineTotal = (line: CartLine): number =>
  (line.unitPriceHalalas + line.modifiers.reduce((sum, m) => sum + m.priceDeltaHalalas, 0)) *
  line.quantity

export const cartTotal = (all: CartLine[]): number =>
  all.reduce((sum, line) => sum + lineTotal(line), 0)

export const cartCount = (all: CartLine[]): number =>
  all.reduce((sum, line) => sum + line.quantity, 0)

/** The wire shape. Ids, quantities and option keys only. */
export const toOrderLines = (all: CartLine[]): PlaceOrderLine[] =>
  all.map((line) => ({
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    modifiers: line.modifiers.map((m) => ({ groupKey: m.groupKey, optionKey: m.optionKey })),
    ...(line.note ? { note: line.note } : {}),
  }))
