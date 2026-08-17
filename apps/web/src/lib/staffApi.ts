/**
 * API client for staff surfaces.
 *
 * Deliberately separate from `lib/api.ts`. Customer and staff credentials are
 * different kinds of secret with different blast radii, and keeping the two
 * clients apart means a customer route physically cannot send a staff token,
 * or the reverse.
 *
 * The access token lives in a module variable, never in storage. It is
 * short-lived and a stolen one is worth more than a table session, so it should
 * not survive in anything an XSS bug could read. The long-lived refresh token
 * is an httpOnly cookie the browser holds and JavaScript cannot see.
 */

import type { OrderStatus } from '@rw/shared'

const BASE = '/api/v1'

export interface StaffUser {
  id: string
  email: string
  name: string
  role: string
  restaurantId: string | null
  mustChangePassword: boolean
}

let accessToken: string | null = null
let currentUser: StaffUser | null = null
const listeners = new Set<() => void>()

function announce(): void {
  listeners.forEach((l) => {
    l()
  })
}

export function subscribeToAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getStaffUser = (): StaffUser | null => currentUser

export class StaffApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'StaffApiError'
  }
}

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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // The refresh cookie must ride along on auth calls.
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })

  const body = (await parse(res)) as { error?: { message?: string } } | null

  if (!res.ok) {
    throw new StaffApiError(res.status, body?.error?.message ?? 'Something went wrong.')
  }
  return body as T
}

interface AuthResponse {
  user: StaffUser
  accessToken: string
  expiresInSeconds: number
}

function adopt(auth: AuthResponse): StaffUser {
  accessToken = auth.accessToken
  currentUser = auth.user
  announce()
  return auth.user
}

export async function login(email: string, password: string): Promise<StaffUser> {
  return adopt(
    await raw<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  )
}

/**
 * Restores a session from the refresh cookie.
 *
 * Runs once on boot. A cashier who reloads the till screen mid-service must not
 * have to type a password again.
 */
export async function restoreSession(): Promise<StaffUser | null> {
  try {
    return adopt(await raw<AuthResponse>('/auth/refresh', { method: 'POST' }))
  } catch {
    accessToken = null
    currentUser = null
    announce()
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    await raw('/auth/logout', { method: 'POST' })
  } finally {
    accessToken = null
    currentUser = null
    announce()
  }
}

/** One silent refresh-and-retry when the 15 minute access token expires. */
export async function staffApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await raw<T>(path, init)
  } catch (error) {
    if (!(error instanceof StaffApiError) || error.status !== 401) throw error
    if (!(await restoreSession())) throw error
    return raw<T>(path, init)
  }
}

async function rawBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })
  if (!res.ok) {
    throw new StaffApiError(res.status, 'Could not load that image.')
  }
  return res.blob()
}

/**
 * Fetches a binary response — currently only the table QR code.
 *
 * This exists because **`<img src>` cannot authenticate.** The browser issues a
 * plain GET with no `Authorization` header, and the staff access token lives in
 * a module variable rather than a cookie precisely so that XSS cannot read it,
 * so there is nothing for the browser to send on its own. Pointing an `<img>`
 * straight at `/app/tables/:id/qr` therefore always yields a 401 and a broken
 * image.
 *
 * The alternative — putting the token in the query string — is not available to
 * us: that writes a live credential into browser history, referrer headers and
 * any proxy log between here and the server.
 *
 * So the bytes are fetched like every other staff request and handed to the
 * `<img>` as an object URL. **The caller must revoke that URL**, or every QR
 * view leaks a blob for the life of the tab.
 */
export const fetchStaffImage = (path: string): Promise<Blob> => rawBlob(path)

/* ── orders ───────────────────────────────────────────────────────────────── */

export interface StaffOrderLine {
  nameSnapshot: { en: string; ar?: string }
  quantity: number
  modifiers: { nameSnapshot: { en: string } }[]
  lineTotalHalalas: number
  prepTimeMinutes?: number
  note?: string
}

export interface StaffOrder {
  id: string
  publicId: string
  orderNumber: string
  invoiceNumber?: string
  status: string
  paymentMethod: string
  paymentStatus: string
  tableLabel?: string | null
  items: StaffOrderLine[]
  totals: { grandTotalHalalas: number; vatHalalas: number; subtotalHalalas: number }
  customerNote?: string | null
  isRush: boolean
  placedAt: string
}

export const fetchBoard = (board: 'kitchen' | 'cashier' | 'waiter') =>
  staffApi<{ orders: StaffOrder[]; count: number }>(`/app/orders?board=${board}`)

export const fetchOrderHistory = (filter: {
  status?: string
  from?: Date
  to?: Date
  limit?: number
  skip?: number
} = {}) => {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.from) params.set('from', filter.from.toISOString())
  if (filter.to) params.set('to', filter.to.toISOString())
  if (filter.limit) params.set('limit', String(filter.limit))
  if (filter.skip) params.set('skip', String(filter.skip))

  const qs = params.toString()
  return staffApi<{ orders: StaffOrder[]; count: number }>(`/app/orders${qs ? `?${qs}` : ''}`)
}

export const transitionOrder = (id: string, to: OrderStatus, expectedCurrentStatus?: string) =>
  staffApi<{ order: StaffOrder }>(`/app/orders/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to, ...(expectedCurrentStatus ? { expectedCurrentStatus } : {}) }),
  })

export const staffCreateOrder = (body: any, idempotencyKey: string) =>
  staffApi<{ order: StaffOrder }>('/app/orders/staff-create', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  })

export const confirmCash = (id: string) =>
  staffApi<{ order: StaffOrder }>(`/app/orders/${id}/confirm-cash`, { method: 'POST' })

export const updateWaitTime = (estimatedWaitMinutes: number) =>
  staffApi<{ estimatedWaitMinutes: number }>('/app/restaurants/wait-time', {
    method: 'PATCH',
    body: JSON.stringify({ estimatedWaitMinutes }),
  })

export const toggleRushOrder = (id: string, isRush: boolean) =>
  staffApi<{ order: StaffOrder }>(`/app/orders/${id}/rush`, {
    method: 'PATCH',
    body: JSON.stringify({ isRush }),
  })

export const refundOrder = (id: string) =>
  staffApi<{ order: StaffOrder }>(`/app/orders/${id}/refund`, {
    method: 'POST',
  })

export const getSettings = () =>
  staffApi<{ settings: any }>('/app/restaurants/settings')

export const updateSettings = (settings: any) =>
  staffApi<{ settings: any }>('/app/restaurants/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings)
  })

export const downloadBackup = () => {
  window.location.href = '/api/app/dashboard/backup'
}

export interface RestaurantStats {
  todayRevenueHalalas: number
  todayOrdersCount: number
  activeOrders: number
  staffCount: number
  trend: { date: string; revenue: number; orders: number }[]
}

export const fetchRestaurantStats = () =>
  staffApi<RestaurantStats>('/app/dashboard/stats')

/* ── menu ─────────────────────────────────────────────────────────────────── */

/** Arabic is optional in Phase 1, but every user-visible string stores both. */
export interface LocalizedText {
  en: string
  ar?: string
}

export interface AdminCategory {
  id: string
  name: LocalizedText
  description?: { en?: string; ar?: string }
  sortOrder: number
  isActive: boolean
  itemCount?: number
}

/**
 * A choice offered on an item — "Puttu Type", "Portion".
 *
 * `key` is the stable identifier a customer's cart and an order snapshot refer
 * to, so the editor generates it once and never rewrites it on a rename.
 * The server enforces the shape rules; `modifierGroupProblem()` below mirrors
 * them so the form can say what is wrong before a 422 comes back.
 */
export interface AdminModifierOption {
  key: string
  name: LocalizedText
  /** Zero or positive. Discounts are modelled as separate items, not negative deltas. */
  priceDeltaHalalas: number
  isAvailable?: boolean
}

export interface AdminModifierGroup {
  key: string
  name: LocalizedText
  minSelect: number
  maxSelect: number
  required: boolean
  options: AdminModifierOption[]
}

export interface AdminMenuItem {
  id: string
  categoryId: string
  name: LocalizedText
  description?: { en?: string; ar?: string }
  /** Always integer halalas on the wire. The form converts, never the server. */
  priceHalalas: number
  vatRatePercent?: number
  imageUrl?: string
  isAvailable: boolean
  isActive: boolean
  prepTimeMinutes?: number
  calories?: number
  ingredients?: string[]
  allergens?: string[]
  /** Portions left. `null` means this dish is not counted. Staff-only. */
  stockRemaining?: number | null
  sortOrder: number
  modifierGroups: AdminModifierGroup[]
}

/** Everything `createMenuItemSchema` accepts. Optional fields are omitted, never sent empty. */
export interface MenuItemInput {
  categoryId: string
  name: LocalizedText
  description?: LocalizedText
  priceHalalas: number
  /** Must be a URL this tenant uploaded. An empty string clears it. */
  imageUrl?: string
  vatRatePercent?: number
  isAvailable?: boolean
  isActive?: boolean
  prepTimeMinutes?: number
  calories?: number
  ingredients?: string[]
  allergens?: string[]
  /** `null` explicitly stops counting; omitting the field leaves it untouched. */
  stockRemaining?: number | null
  sortOrder?: number
  modifierGroups?: AdminModifierGroup[]
}

export const fetchCategories = () =>
  staffApi<{ categories: AdminCategory[] }>('/app/menu/categories')

export const createCategory = (name: LocalizedText) =>
  staffApi<{ category: AdminCategory }>('/app/menu/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

export const updateCategory = (
  id: string,
  body: { name?: LocalizedText; sortOrder?: number; isActive?: boolean },
) =>
  staffApi<{ category: AdminCategory }>(`/app/menu/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

/** Refused by the server while the category still holds items. */
export const deleteCategory = (id: string) =>
  staffApi<void>(`/app/menu/categories/${id}`, { method: 'DELETE' })

export const fetchMenuItems = () => staffApi<{ items: AdminMenuItem[] }>('/app/menu/items')

export const createMenuItem = (body: MenuItemInput) =>
  staffApi<{ item: AdminMenuItem }>('/app/menu/items', {
    method: 'POST',
    body: JSON.stringify(body),
  })

/** PATCH is a partial, but `modifierGroups` replaces the whole array when sent. */
export const updateMenuItem = (id: string, body: Partial<MenuItemInput>) =>
  staffApi<{ item: AdminMenuItem }>(`/app/menu/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const setItemAvailability = (id: string, isAvailable: boolean) =>
  staffApi<{ item: AdminMenuItem }>(`/app/menu/items/${id}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
  })

/* ── image upload ─────────────────────────────────────────────────────────── */

export interface UploadCredentials {
  /** The provider's endpoint. Not our API. */
  uploadUrl: string
  /** Signed fields that must be sent verbatim — changing one invalidates the signature. */
  fields: Record<string, string>
  expiresInSeconds: number
  maxBytes: number
  allowedMimeTypes: string[]
}

/**
 * Asks our API to sign a direct browser upload, scoped to this tenant's folder.
 *
 * Returns 503 with instructions when no image provider is configured, which is
 * the default. The server's message names the exact environment variables, so it
 * is shown to the user rather than replaced with something vaguer.
 */
export const requestUploadCredentials = (kind: 'menu-item' | 'menu-category' | 'restaurant-logo') =>
  staffApi<UploadCredentials>('/app/menu/images/upload-credentials', {
    method: 'POST',
    body: JSON.stringify({ kind }),
  })

/**
 * Sends the file straight to the image provider and returns the hosted URL.
 *
 * **Deliberately a bare `fetch`, not `staffApi`.** This request leaves our
 * origin, and `staffApi` attaches the staff bearer token and `credentials:
 * 'include'`. Sending either to a third party would hand our session to
 * Cloudinary. The signed fields are the only authorisation this call needs.
 *
 * The file never touches our server: the signature is scoped to the tenant's
 * folder and carries the resize transformation, so neither the destination nor
 * the processing is under the browser's control.
 */
export async function uploadImageToProvider(
  credentials: UploadCredentials,
  file: File,
): Promise<string> {
  const form = new FormData()
  for (const [key, value] of Object.entries(credentials.fields)) form.append(key, value)
  form.append('file', file)

  const res = await fetch(credentials.uploadUrl, { method: 'POST', body: form })

  if (!res.ok) {
    // The host explains itself far better than we can — "cloud_name mismatch"
    // names a misconfiguration that "please try again" would send someone
    // hunting through their own code for. Shown as text, so a hostile message
    // is inert; capped so it cannot flood the form.
    const detail = await res
      .json()
      .then((body: { error?: { message?: string } }) => body.error?.message?.slice(0, 200))
      .catch(() => undefined)

    throw new Error(
      detail
        ? `The image host rejected the upload (${res.status}): ${detail}`
        : `The image host rejected the upload (${res.status}). Please try again.`,
    )
  }

  const body = (await res.json()) as { secure_url?: string }
  if (!body.secure_url) {
    throw new Error('The image host did not return a URL.')
  }
  return body.secure_url
}

/* ── tables ───────────────────────────────────────────────────────────────── */

export interface AdminTable {
  id: string
  label: string
  zone?: string | null
  status: string
  tokenVersion: number
  /** Null when the stored token cannot be decrypted with the current key. */
  url: string | null
}

export const fetchTables = () => staffApi<{ tables: AdminTable[] }>('/app/tables')

export const createTable = (label: string, zone?: string) =>
  staffApi<{ table: AdminTable }>('/app/tables', {
    method: 'POST',
    body: JSON.stringify({ label, ...(zone ? { zone } : {}) }),
  })

export const rotateTableToken = (id: string) =>
  staffApi<{ table: AdminTable; warning: string }>(`/app/tables/${id}/rotate-token`, {
    method: 'POST',
  })

export const updateTable = (id: string, body: { label?: string; zone?: string; status?: string }) =>
  staffApi<{ table: AdminTable }>(`/app/tables/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const deleteTable = (id: string) =>
  staffApi<void>(`/app/tables/${id}`, { method: 'DELETE' })

/* ── staff ────────────────────────────────────────────────────────────────── */

export interface AdminStaffMember {
  id: string
  email: string
  name: string
  role: string
  status: string
  mustChangePassword: boolean
}

export const fetchStaff = () => staffApi<{ staff: AdminStaffMember[] }>('/app/staff')

export const createStaffMember = (body: { email: string; name: string; role: string }) =>
  staffApi<{ user: AdminStaffMember; temporaryPassword: string }>('/app/staff', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updateStaffMember = (id: string, body: Record<string, unknown>) =>
  staffApi<{ user: AdminStaffMember }>(`/app/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const resetStaffPassword = (id: string) =>
  staffApi<{ user: AdminStaffMember; temporaryPassword: string }>(
    `/app/staff/${id}/reset-password`,
    { method: 'POST' },
  )

/* ── platform ─────────────────────────────────────────────────────────────── */

export interface PlatformRestaurant {
  id: string
  name: { en: string; ar?: string }
  slug: string
  type: string
  parentId?: string | null
  status: string
  subscription?: { plan: string; status: string }
  features?: string[]
  city?: string | null
  staffCount: number
  createdAt: string
}

export interface AuditEntry {
  id: string
  at: string
  action: string
  actorRole?: string | null
  actorType: string
  restaurantId: string | null
  metadata: unknown
}

export const fetchRestaurants = () =>
  staffApi<{ restaurants: PlatformRestaurant[] }>('/platform/restaurants')

export const createRestaurant = (body: {
  name: { en: string }
  slug: string
  type: string
  parentId?: string
  owner: { email: string; name: string }
}) =>
  staffApi<{ restaurant: PlatformRestaurant; owner: { email: string }; temporaryPassword: string }>(
    '/platform/restaurants',
    { method: 'POST', body: JSON.stringify(body) },
  )

export const setRestaurantStatus = (id: string, status: string, reason?: string) =>
  staffApi<{ restaurant: PlatformRestaurant }>(`/platform/restaurants/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  })

export const resetRestaurantOwnerPassword = (id: string) =>
  staffApi<{ ownerEmail: string; temporaryPassword: string }>(`/platform/restaurants/${id}/reset-password`, {
    method: 'POST',
  })

export const fetchAudit = () => staffApi<{ events: AuditEntry[] }>('/platform/audit?limit=60')

export interface PlatformStats {
  totalRestaurants: number
  totalUsers: number
  totalOrders: number
  totalRevenue: number
}

export const fetchHealth = () =>
  staffApi<{ status: string; uptimeSeconds: number }>('/health', { method: 'GET' })

export const fetchReady = () =>
  staffApi<{ status: string; checks: { database: string } }>('/readyz', { method: 'GET' })

export const fetchPlatformStats = () =>
  staffApi<PlatformStats>('/platform/analytics')

export const getPlatformRestaurant = (id: string) =>
  staffApi<{ restaurant: PlatformRestaurant }>(`/platform/restaurants/${id}`)

export const updatePlatformRestaurant = (id: string, body: { name?: { en: string; ar?: string }; slug?: string; city?: string; vatNumber?: string; crNumber?: string }) =>
  staffApi<{ restaurant: PlatformRestaurant }>(`/platform/restaurants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const fetchPlatformRestaurantStaff = (id: string) =>
  staffApi<{ staff: AdminStaffMember[] }>(`/platform/restaurants/${id}/staff`)

export const createPlatformRestaurantStaff = (id: string, body: { email: string; name: string; role: string }) =>
  staffApi<{ user: AdminStaffMember; temporaryPassword: string }>(`/platform/restaurants/${id}/staff`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updatePlatformRestaurantStaff = (id: string, staffId: string, body: Record<string, unknown>) =>
  staffApi<{ user: AdminStaffMember }>(`/platform/restaurants/${id}/staff/${staffId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

/**
 * Removes someone from a restaurant's team by **disabling** them. The account
 * and its history survive, which is what keeps the audit log meaningful; the
 * sessions do not. Reverse it with `updatePlatformRestaurantStaff(…, { status:
 * 'ACTIVE' })`.
 */
export const disablePlatformRestaurantStaff = (id: string, staffId: string) =>
  staffApi<{ user: AdminStaffMember }>(`/platform/restaurants/${id}/staff/${staffId}`, {
    method: 'DELETE',
  })

export const updatePlatformSubscription = (id: string, body: { plan: string; status: string }) =>
  staffApi<{ subscription: any }>(`/platform/restaurants/${id}/subscription`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const updatePlatformFeatures = (id: string, features: string[]) =>
  staffApi<{ features: string[] }>(`/platform/restaurants/${id}/features`, {
    method: 'PATCH',
    body: JSON.stringify({ features }),
  })
