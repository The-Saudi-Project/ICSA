/**
 * API client for the customer surface.
 *
 * One rule shapes all of it: the client sends what it wants, never what things
 * cost. No request from this file carries a price, a total, a table id or a
 * restaurant id. The server reads the tenant and the table from the session
 * token and prices everything from its own database.
 */

import { getSession, getTableToken, setSession, type TableSession } from './session.js'

const BASE = '/api/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Every table-session failure returns an identical 404 by design, so the client
 * cannot tell an expired session from a rotated tag. This is the one string we
 * match on to decide whether re-exchanging the tag is worth trying.
 */
const SESSION_GONE = 'Table not found'

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession()

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.sessionToken}` } : {}),
      ...init.headers,
    },
  })

  const body = (await parse(res)) as { error?: { message?: string; code?: string } } | null

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.message ?? 'Something went wrong. Please try again.',
      body?.error?.code,
    )
  }

  return body as T
}

/**
 * Exchanges the token from the NFC tag or QR code for a session.
 * This is the only place the tag token is ever sent.
 */
export async function openTableSession(tableToken: string): Promise<TableSession> {
  const session = await raw<TableSession>('/public/table-sessions', {
    method: 'POST',
    body: JSON.stringify({ tableToken }),
  })
  setSession(session)
  return session
}

/**
 * A session token lasts 15 minutes; a meal lasts hours. This slides the window
 * quietly in the background, and falls back to re-exchanging the tag token if
 * the session has gone entirely.
 */
async function renewSession(): Promise<boolean> {
  try {
    const renewed = await raw<TableSession>('/public/table-sessions/refresh', { method: 'POST' })
    setSession(renewed)
    return true
  } catch {
    const tableToken = getTableToken()
    if (!tableToken) return false
    try {
      await openTableSession(tableToken)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Request with one silent retry when the session has expired mid-visit.
 *
 * Retrying is safe for reads. For writes, `POST /public/orders` carries an
 * idempotency key, so a retry that follows a renewed session replays rather
 * than duplicating.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await raw<T>(path, init)
  } catch (error) {
    const isSessionGone = error instanceof ApiError && error.status === 404 && error.message === SESSION_GONE

    if (!isSessionGone) throw error
    if (!(await renewSession())) throw error

    return raw<T>(path, init)
  }
}

/* ── menu ─────────────────────────────────────────────────────────────────── */

export interface MenuModifierOption {
  key: string
  name: { en: string; ar?: string }
  priceDeltaHalalas: number
}

export interface MenuModifierGroup {
  key: string
  name: { en: string; ar?: string }
  minSelect: number
  maxSelect: number
  required: boolean
  options: MenuModifierOption[]
}

export interface MenuItem {
  id: string
  name: { en: string; ar?: string }
  description?: { en?: string; ar?: string }
  priceHalalas: number
  imageUrl?: string | null
  prepTimeMinutes?: number | null
  calories?: number | null
  allergens: string[]
  averageRating?: number | null
  reviewCount?: number
  /**
   * Whether this can be ordered. A boolean on purpose — the customer surface is
   * never told how many portions remain.
   */
  isSoldOut: boolean
  modifierGroups: MenuModifierGroup[]
}

export interface MenuCategory {
  id: string
  name: { en: string; ar?: string }
  description?: { en?: string; ar?: string }
  items: MenuItem[]
}

export const fetchMenu = () => api<{ categories: MenuCategory[]; version: string }>('/public/menu')

/* ── orders ───────────────────────────────────────────────────────────────── */

export interface OrderLineModifier {
  groupKey: string
  optionKey: string
  nameSnapshot: { en: string; ar?: string }
  priceDeltaHalalas: number
}

export interface OrderLine {
  menuItemId: string
  nameSnapshot: { en: string; ar?: string }
  unitPriceHalalas: number
  quantity: number
  modifiers: OrderLineModifier[]
  lineTotalHalalas: number
  note?: string
}

export interface CustomerOrder {
  publicId: string
  orderNumber: string
  invoiceNumber?: string
  status: string
  paymentMethod: string
  paymentStatus: string
  tableLabel?: string | null
  items: OrderLine[]
  totals: {
    subtotalHalalas: number
    vatHalalas: number
    serviceChargeHalalas: number
    grandTotalHalalas: number
  }
  currency: string
  customerNote?: string | null
  placedAt: string
}

export interface PlaceOrderLine {
  menuItemId: string
  quantity: number
  modifiers: { groupKey: string; optionKey: string }[]
  note?: string
}

/**
 * The order request in full: items, quantities and modifier keys.
 *
 * No table. No restaurant. No prices. No totals. There is nothing here for a
 * tampered client to change, because the fields do not exist on the server's
 * schema either.
 */
export function placeOrder(
  items: PlaceOrderLine[],
  idempotencyKey: string,
  customerNote?: string,
): Promise<{ order: CustomerOrder; replayed: boolean }> {
  return api('/public/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      items,
      paymentMethod: 'CASH',
      ...(customerNote ? { customerNote } : {}),
    }),
  })
}

export const fetchOrder = (publicId: string) =>
  api<{ order: CustomerOrder }>(`/public/orders/${publicId}`)

export const fetchMyOrders = () => api<{ orders: CustomerOrder[] }>('/public/orders')

export const cancelOrder = (publicId: string) =>
  api<{ order: CustomerOrder }>(`/public/orders/${publicId}/cancel`, { method: 'POST' })

export const submitReview = (body: {
  menuItemId: string
  orderPublicId: string
  rating: number
  comment?: string
  customerName: string
}) => api<{ review: any }>('/public/reviews', { method: 'POST', body: JSON.stringify(body) })

export const getReviews = (menuItemId: string) =>
  api<{ reviews: any[] }>(`/public/menu/${menuItemId}/reviews`)

export const fetchRestaurantStatus = () =>
  api<{ estimatedWaitMinutes: number }>('/public/restaurant/status')

