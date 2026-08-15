/**
 * Display formatting.
 *
 * Money arithmetic never happens here. `@rw/shared/money` owns it, in integer
 * halalas, and this file only turns an integer into characters.
 */

import { formatHalalas } from '@rw/shared/money'

/** "43.48". The currency is rendered separately so it can be styled down. */
export const money = (halalas: number): string => formatHalalas(halalas)

/** Minutes since a timestamp, for "4 min ago" on an order. */
export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
}

export function relativeTime(iso: string): string {
  const mins = minutesSince(iso)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

/**
 * An idempotency key for one order attempt.
 *
 * Generated once when the customer opens checkout and reused for every retry of
 * that same attempt, so a flaky connection replays instead of ordering twice.
 */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
