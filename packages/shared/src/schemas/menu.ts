import { z } from 'zod'
import { localizedTextSchema } from './common.js'

/**
 * Prices cross the API as INTEGER HALALAS, never as decimal SAR.
 *
 * A float on the wire is a rounding bug waiting to happen: JSON has no decimal
 * type, so `12.10` arrives as 12.099999999999999. The admin UI converts what a
 * human types with `sarToHalalas` from `@rw/shared/money` and sends the integer.
 *
 * The ceiling is 10,000,000 halalas (100,000 SAR) — high enough for any real
 * menu item, low enough that a typo cannot create an absurd order total.
 */
export const halalaPriceSchema = z
  .number()
  .int('price must be a whole number of halalas (1 SAR = 100 halalas)')
  .min(0)
  .max(10_000_000)

const optionalLocalizedText = z.object({
  en: z.string().trim().max(600),
  ar: z.string().trim().max(600).optional(),
})

export const createCategorySchema = z.object({
  name: localizedTextSchema,
  description: optionalLocalizedText.optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
})
export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'no fields to update')
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

/**
 * A modifier option's price delta is zero or positive.
 *
 * Deliberate Phase 1 limitation: discounts ("small size, -5 SAR") are modelled
 * as separate items or variants rather than negative deltas. Negative deltas
 * open the door to a combination of modifiers producing a negative line total,
 * which every downstream money assertion would then have to defend against.
 */
export const modifierOptionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'use lowercase letters, numbers, hyphen or underscore'),
  name: localizedTextSchema,
  priceDeltaHalalas: halalaPriceSchema.default(0),
  isAvailable: z.boolean().default(true),
})

export const modifierGroupSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'use lowercase letters, numbers, hyphen or underscore'),
    name: localizedTextSchema,
    minSelect: z.number().int().min(0).max(20).default(0),
    maxSelect: z.number().int().min(1).max(20).default(1),
    required: z.boolean().default(false),
    options: z.array(modifierOptionSchema).min(1).max(30),
  })
  .refine((g) => g.maxSelect >= g.minSelect, 'maxSelect must be at least minSelect')
  .refine((g) => g.maxSelect <= g.options.length, 'maxSelect cannot exceed the number of options')
  .refine(
    (g) => new Set(g.options.map((o) => o.key)).size === g.options.length,
    'option keys must be unique within a group',
  )
  .refine((g) => !g.required || g.minSelect >= 1, 'a required group must have minSelect of at least 1')

/**
 * Nutritional and allergen information is entered by the restaurant and is
 * displayed to customers as the restaurant's own claim. We make no independent
 * assertion about its accuracy, and the customer UI labels it accordingly.
 */
export const createMenuItemSchema = z.object({
  categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id'),
  name: localizedTextSchema,
  description: optionalLocalizedText.optional(),
  priceHalalas: halalaPriceSchema,
  /** Overrides the restaurant's rate for this item. Omit to inherit. */
  vatRatePercent: z.number().min(0).max(100).optional(),
  imageUrl: z.string().max(500).optional(),
  isAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  prepTimeMinutes: z.number().int().min(0).max(240).optional(),
  calories: z.number().int().min(0).max(20_000).optional(),
  ingredients: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  /**
   * Portions left, or `null` for an item nobody counts.
   *
   * Nullable rather than merely optional: staff need a way to *stop* tracking an
   * item, and `undefined` in a PATCH means "leave alone". `null` is the explicit
   * "no longer counted".
   */
  stockRemaining: z.number().int().min(0).max(100_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  modifierGroups: z.array(modifierGroupSchema).max(10).default([]),
})
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>

export const updateMenuItemSchema = createMenuItemSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'no fields to update')
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>

/** The one field a cashier may change, for an item that runs out mid-service. */
export const setAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
})
