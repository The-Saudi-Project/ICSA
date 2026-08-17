/**
 * The owner/platform split for restaurant settings.
 *
 * This schema *is* the security boundary for the settings API: the route trusts
 * it to have stripped anything a restaurant may not set. Testing it here rather
 * than only through HTTP has a practical benefit too — it needs no database, so
 * it runs in every environment, including ones where the API's Mongo-backed
 * suites cannot start.
 */

import { describe, expect, it } from 'vitest'
import {
  MAX_SERVICE_CHARGE_PERCENT,
  MAX_TABLE_SESSION_TTL_MINUTES,
} from '../enums.js'
import {
  updateRestaurantFinanceSchema,
  updateRestaurantSettingsSchema,
} from './restaurant.js'

describe('updateRestaurantSettingsSchema — what an owner may change', () => {
  it('accepts the settings a restaurant genuinely chooses', () => {
    const parsed = updateRestaurantSettingsSchema.parse({
      name: { en: 'Malabar Spice', ar: 'مالابار سبايس' },
      city: 'Riyadh',
      serviceChargePercent: 10,
      kitchenStartsBeforePayment: true,
      tableSessionTtlMinutes: 240,
    })
    expect(parsed.serviceChargePercent).toBe(10)
    expect(parsed.kitchenStartsBeforePayment).toBe(true)
  })

  it('refuses an empty patch rather than writing an empty audit event', () => {
    expect(updateRestaurantSettingsSchema.safeParse({}).success).toBe(false)
  })

  /**
   * The heart of it. These four are money or law, and the product owner's
   * decision on 2026-08-15 was that a restaurant does not set them. Zod strips
   * unknown keys by default, so the assertion is that the value never survives
   * into the parsed output and therefore can never reach `$set`.
   */
  it.each([
    ['vatRatePercent', 5],
    ['pricesIncludeVat', false],
    ['currency', 'USD'],
    ['orderTypes', ['TAKEAWAY']],
  ])('strips %s, which only the platform may set', (key, value) => {
    const parsed = updateRestaurantSettingsSchema.parse({
      city: 'Jeddah',
      [key]: value,
    }) as Record<string, unknown>

    expect(parsed[key]).toBeUndefined()
    expect(parsed.city).toBe('Jeddah')
  })

  it('strips identity and commercial state too', () => {
    const parsed = updateRestaurantSettingsSchema.parse({
      city: 'Dammam',
      slug: 'stolen-slug',
      status: 'SUSPENDED',
      type: 'CHAIN_MAIN',
      parentId: '65d1a1234567890123456789',
    }) as Record<string, unknown>

    expect(parsed.slug).toBeUndefined()
    expect(parsed.status).toBeUndefined()
    expect(parsed.type).toBeUndefined()
    expect(parsed.parentId).toBeUndefined()
  })

  describe('service charge', () => {
    it(`accepts 0 through ${MAX_SERVICE_CHARGE_PERCENT}`, () => {
      for (const percent of [0, 1, MAX_SERVICE_CHARGE_PERCENT]) {
        expect(
          updateRestaurantSettingsSchema.safeParse({ serviceChargePercent: percent }).success,
          `${percent}%`,
        ).toBe(true)
      }
    })

    /**
     * The column allows 100. A mistyped `100` would double every bill, so the
     * API is stricter than the storage — the reason this cap exists at all.
     */
    it.each([MAX_SERVICE_CHARGE_PERCENT + 1, 50, 100, -1])('rejects %i%%', (percent) => {
      expect(
        updateRestaurantSettingsSchema.safeParse({ serviceChargePercent: percent }).success,
      ).toBe(false)
    })

    it('rejects a fraction, so the number on a bill is the number typed', () => {
      expect(
        updateRestaurantSettingsSchema.safeParse({ serviceChargePercent: 2.5 }).success,
      ).toBe(false)
    })

    it('rejects a numeric string — no coercion on a money field', () => {
      expect(
        updateRestaurantSettingsSchema.safeParse({ serviceChargePercent: '10' }).success,
      ).toBe(false)
    })
  })

  describe('table session length', () => {
    it('accepts the practical range', () => {
      for (const minutes of [5, 180, MAX_TABLE_SESSION_TTL_MINUTES]) {
        expect(
          updateRestaurantSettingsSchema.safeParse({ tableSessionTtlMinutes: minutes }).success,
          `${minutes}m`,
        ).toBe(true)
      }
    })

    /** A session is how long a photographed QR keeps working. A day is not a visit. */
    it.each([MAX_TABLE_SESSION_TTL_MINUTES + 1, 1440, 4, 0])('rejects %i minutes', (minutes) => {
      expect(
        updateRestaurantSettingsSchema.safeParse({ tableSessionTtlMinutes: minutes }).success,
      ).toBe(false)
    })
  })

  describe('legal identifiers', () => {
    it('accepts a well-formed Saudi VAT and CR number', () => {
      expect(
        updateRestaurantSettingsSchema.safeParse({
          vatNumber: '3'.repeat(15),
          crNumber: '1'.repeat(10),
        }).success,
      ).toBe(true)
    })

    it('allows an empty string to clear one', () => {
      expect(updateRestaurantSettingsSchema.safeParse({ vatNumber: '' }).success).toBe(true)
    })

    it.each(['12345', '3'.repeat(16), 'abcdefghijklmno'])(
      'rejects a malformed VAT number %j',
      (vatNumber) => {
        expect(updateRestaurantSettingsSchema.safeParse({ vatNumber }).success).toBe(false)
      },
    )
  })

  /**
   * The NoSQL-injection property every schema in this codebase carries: a field
   * typed as a string or a number rejects an operator-shaped object outright, so
   * it can never reach a query or an update.
   */
  it('rejects operator-shaped objects on every field', () => {
    for (const payload of [
      { city: { $ne: null } },
      { serviceChargePercent: { $gt: 0 } },
      { kitchenStartsBeforePayment: { $ne: false } },
      { logoUrl: { $regex: '.*' } },
    ]) {
      expect(updateRestaurantSettingsSchema.safeParse(payload).success, JSON.stringify(payload)).toBe(
        false,
      )
    }
  })
})

describe('updateRestaurantFinanceSchema — what only the platform may change', () => {
  it('accepts the money settings', () => {
    const parsed = updateRestaurantFinanceSchema.parse({
      vatRatePercent: 0,
      pricesIncludeVat: false,
    })
    expect(parsed.vatRatePercent).toBe(0)
    expect(parsed.pricesIncludeVat).toBe(false)
  })

  it('refuses an empty patch', () => {
    expect(updateRestaurantFinanceSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a rate outside 0–100', () => {
    expect(updateRestaurantFinanceSchema.safeParse({ vatRatePercent: 101 }).success).toBe(false)
    expect(updateRestaurantFinanceSchema.safeParse({ vatRatePercent: -1 }).success).toBe(false)
  })

  /** The two schemas must not become interchangeable by accident. */
  it('does not accept the owner-editable settings', () => {
    const parsed = updateRestaurantFinanceSchema.parse({
      vatRatePercent: 15,
      serviceChargePercent: 99,
      kitchenStartsBeforePayment: true,
    }) as Record<string, unknown>

    expect(parsed.serviceChargePercent).toBeUndefined()
    expect(parsed.kitchenStartsBeforePayment).toBeUndefined()
  })
})
