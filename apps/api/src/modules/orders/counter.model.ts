/**
 * Per-restaurant, per-day order numbering.
 *
 * The number a kitchen shouts across a pass has to be short and has to restart
 * each day, so it cannot come from the document id.
 *
 * Allocation is a single atomic `$inc` with upsert. Two orders placed in the
 * same millisecond get different numbers because MongoDB serialises the update
 * on the document — a read-then-write would not.
 *
 * The counter itself is NOT tenant-guarded: its `_id` already contains the
 * restaurant id, so there is no filter to forget.
 */

import { Schema, model } from 'mongoose'

const counterSchema = new Schema(
  {
    /** `<restaurantId>:<YYYYMMDD>` */
    _id: { type: String },
    seq: { type: Number, default: 0 },
    /** Yesterday's counters are of no use. TTL keeps the collection tiny. */
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
)

counterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const CounterModel = model('Counter', counterSchema)

/**
 * Local calendar day for the restaurant.
 *
 * Saudi Arabia is UTC+3 with no daylight saving, so a fixed offset is correct
 * and does not need a timezone database. A restaurant serving past midnight
 * gets a fresh sequence at local midnight, which is what staff expect.
 */
const KSA_UTC_OFFSET_HOURS = 3

export function businessDayKey(now: Date = new Date()): string {
  const local = new Date(now.getTime() + KSA_UTC_OFFSET_HOURS * 60 * 60 * 1000)
  return local.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * The instant the current business day began, as a real UTC `Date`.
 *
 * Anything reporting on "today" must use this rather than `setHours(0,0,0,0)`.
 * The server runs in UTC in production, so local midnight is 03:00 in Riyadh —
 * a restaurant serving past midnight would see the small hours counted against
 * the wrong day, and the totals would not agree with the order numbers, which
 * already restart on the KSA day.
 */
export function startOfBusinessDay(now: Date = new Date()): Date {
  const offsetMs = KSA_UTC_OFFSET_HOURS * 60 * 60 * 1000
  const local = new Date(now.getTime() + offsetMs)
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - offsetMs)
}

/** Returns a zero-padded sequence: 001, 002, ... */
export async function nextOrderNumber(restaurantId: string, now: Date = new Date()): Promise<string> {
  const key = `${restaurantId}:${businessDayKey(now)}`

  const counter = await CounterModel.findByIdAndUpdate(
    key,
    {
      $inc: { seq: 1 },
      // Three days, so a late-night order and any reporting that follows it
      // still find their counter.
      $setOnInsert: { expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
    },
    { new: true, upsert: true },
  )

  return String(counter.seq).padStart(3, '0')
}

/** Returns a permanent sequential invoice number for a restaurant: INV-00001 */
export async function nextInvoiceNumber(restaurantId: string): Promise<string> {
  const key = `invoice:${restaurantId}`

  const counter = await CounterModel.findByIdAndUpdate(
    key,
    {
      $inc: { seq: 1 },
      // Set to never expire (essentially year 2099) since these are lifetime sequences
      $setOnInsert: { expiresAt: new Date('2099-12-31T00:00:00.000Z') },
    },
    { new: true, upsert: true },
  )

  return `INV-${String(counter.seq).padStart(5, '0')}`
}
