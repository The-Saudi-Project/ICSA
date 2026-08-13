/**
 * The table session — the customer's entire identity.
 *
 * There is no account, no login and no cookie. The phone holds a short-lived
 * session token issued by the API in exchange for the token on the NFC tag, and
 * every request carries it. `restaurantId` and `tableId` live inside that token
 * server-side, which is why nothing here ever sends a table or a restaurant.
 *
 * Storage: `sessionStorage`, deliberately.
 *   - In-memory alone would lose the session on a page refresh, and a hungry
 *     person who pulls to refresh should not have to find the tag again.
 *   - `localStorage` would outlive the visit and survive the customer leaving.
 *   - `sessionStorage` lives exactly as long as the tab, which is the same
 *     lifetime as the meal.
 *
 * The raw table token is kept alongside it so an expired session (15 minutes)
 * can be re-exchanged silently during a visit that runs for hours. Both are
 * low-value: they authorise ordering at one table of one restaurant, nothing
 * more, and the server enforces every limit regardless.
 */

const SESSION_KEY = 'rw.session'
const TOKEN_KEY = 'rw.tableToken'
const ENTERED_KEY = 'rw.entered'

export interface TableSession {
  sessionToken: string
  restaurant: {
    publicId: string
    name: { en: string; ar?: string }
    settings: { currency: string; vatRatePercent: number; pricesIncludeVat: boolean }
  }
  table: { label: string }
}

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // Private mode, disabled storage, corrupted value. Fall back to no session
    // rather than breaking the page.
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable; the visit still works until the tab reloads */
  }
}

export const getSession = (): TableSession | null => read<TableSession>(SESSION_KEY)

export function setSession(session: TableSession): void {
  write(SESSION_KEY, session)
}

export const getTableToken = (): string | null => read<string>(TOKEN_KEY)

export function setTableToken(token: string): void {
  write(TOKEN_KEY, token)
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** The entry animation plays once per visit, not on every navigation back. */
export function hasPlayedEntry(): boolean {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1'
  } catch {
    return false
  }
}

export function markEntryPlayed(): void {
  try {
    sessionStorage.setItem(ENTERED_KEY, '1')
  } catch {
    /* animation simply replays */
  }
}
