/**
 * The contract the admin item editor writes against.
 *
 * `MenuItemEditor.tsx` builds these payloads by hand and mirrors the modifier
 * rules in `modifierGroupProblem()` so a person is told what is wrong while they
 * are looking at the form rather than by a 422 afterwards. A mirror that drifts
 * from the original is worse than no mirror, so the shapes the editor produces
 * and the rules it enforces are both pinned here, against the real schema.
 */

import { describe, expect, it } from 'vitest'
import { createMenuItemSchema, modifierGroupSchema } from './menu.js'

const CATEGORY_ID = '65d1a1234567890123456789'

/** Exactly what the editor sends when only the required fields are filled in. */
const minimalItem = {
  categoryId: CATEGORY_ID,
  name: { en: 'Kerala Porotta' },
  priceHalalas: 400,
  modifierGroups: [],
}

/** Everything the editor can produce, using a real dish from the demo menu. */
const fullItem = {
  categoryId: CATEGORY_ID,
  name: { en: 'Malabar Chicken Biriyani', ar: 'برياني الدجاج المالباري' },
  description: {
    en: 'Fragrant jeerakasala rice layered with spiced chicken.',
    ar: 'أرز معطر مع الدجاج المتبل',
  },
  priceHalalas: 2800,
  prepTimeMinutes: 15,
  calories: 720,
  sortOrder: 0,
  allergens: ['Nuts', 'Dairy'],
  ingredients: ['Basmati rice', 'Chicken', 'Ghee'],
  modifierGroups: [
    {
      key: 'portion',
      name: { en: 'Portion', ar: 'الحجم' },
      minSelect: 1,
      maxSelect: 1,
      required: true,
      options: [
        { key: 'regular', name: { en: 'Regular', ar: 'عادي' }, priceDeltaHalalas: 0 },
        { key: 'large', name: { en: 'Large', ar: 'كبير' }, priceDeltaHalalas: 800 },
      ],
    },
    {
      key: 'accompaniments',
      name: { en: 'Accompaniments' },
      minSelect: 0,
      maxSelect: 3,
      required: false,
      options: [
        { key: 'raita', name: { en: 'Extra Raita' }, priceDeltaHalalas: 200 },
        { key: 'pappadam', name: { en: 'Pappadam' }, priceDeltaHalalas: 300 },
        { key: 'pickle', name: { en: 'Kerala Pickle' }, priceDeltaHalalas: 200 },
      ],
    },
  ],
}

describe('the payloads the admin item editor builds', () => {
  it('accepts an item with only the required fields', () => {
    expect(createMenuItemSchema.safeParse(minimalItem).success).toBe(true)
  })

  it('accepts a fully populated bilingual item with choices', () => {
    const result = createMenuItemSchema.safeParse(fullItem)
    expect(result.success).toBe(true)
  })

  /**
   * Why the editor drops an Arabic-only description instead of sending it:
   * `description.en` is required whenever `description` is present, so there is
   * no way to express "Arabic only" and a 422 would be the user's only clue.
   */
  it('rejects a description that has Arabic but no English', () => {
    const result = createMenuItemSchema.safeParse({
      ...minimalItem,
      description: { ar: 'وصف عربي فقط' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts an Arabic name alongside English, but needs the English one', () => {
    expect(
      createMenuItemSchema.safeParse({ ...minimalItem, name: { en: 'Appam', ar: 'آبام' } }).success,
    ).toBe(true)
    expect(createMenuItemSchema.safeParse({ ...minimalItem, name: { ar: 'آبام' } }).success).toBe(
      false,
    )
  })
})

describe('the modifier rules the editor mirrors in modifierGroupProblem()', () => {
  const base = {
    key: 'portion',
    name: { en: 'Portion' },
    minSelect: 1,
    maxSelect: 1,
    required: true,
    options: [
      { key: 'regular', name: { en: 'Regular' }, priceDeltaHalalas: 0 },
      { key: 'large', name: { en: 'Large' }, priceDeltaHalalas: 800 },
    ],
  }

  it('accepts a well-formed required group', () => {
    expect(modifierGroupSchema.safeParse(base).success).toBe(true)
  })

  it('refuses a required group that asks for zero choices', () => {
    expect(modifierGroupSchema.safeParse({ ...base, minSelect: 0 }).success).toBe(false)
  })

  it('refuses maxSelect below minSelect', () => {
    expect(
      modifierGroupSchema.safeParse({ ...base, minSelect: 2, maxSelect: 1 }).success,
    ).toBe(false)
  })

  it('refuses maxSelect greater than the number of options', () => {
    expect(modifierGroupSchema.safeParse({ ...base, maxSelect: 5 }).success).toBe(false)
  })

  it('refuses duplicate option keys', () => {
    const options = [base.options[0]!, { ...base.options[1]!, key: 'regular' }]
    expect(modifierGroupSchema.safeParse({ ...base, options }).success).toBe(false)
  })

  it('refuses a group with no options', () => {
    expect(modifierGroupSchema.safeParse({ ...base, options: [] }).success).toBe(false)
  })

  /** The editor's "extra cost is zero or more" note is this rule, stated to the user. */
  it('refuses a negative price delta, because a cheaper size is a separate item', () => {
    const options = [base.options[0]!, { ...base.options[1]!, priceDeltaHalalas: -300 }]
    expect(modifierGroupSchema.safeParse({ ...base, options }).success).toBe(false)
  })

  /** Why `toKey()` slugifies and falls back positionally for Arabic-only names. */
  it('refuses keys that are not lowercase slugs', () => {
    for (const key of ['Portion', 'my key', 'الحجم', '-leading', '']) {
      expect(modifierGroupSchema.safeParse({ ...base, key }).success, key || '(empty)').toBe(false)
    }
    expect(modifierGroupSchema.safeParse({ ...base, key: 'grp_1' }).success).toBe(true)
    expect(modifierGroupSchema.safeParse({ ...base, key: 'spice-level' }).success).toBe(true)
  })
})
