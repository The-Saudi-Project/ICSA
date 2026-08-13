/**
 * MenuItem.
 *
 * `priceHalalas` is an integer number of halalas (1 SAR = 100 halalas) and is
 * the *current* price. It is never read directly when building an order — an
 * order copies it into an immutable snapshot, so changing a price tomorrow
 * cannot alter yesterday's bill.
 *
 * Modifier groups are embedded rather than referenced: they are never queried
 * on their own, they are always loaded with their item, and a menu item with
 * its options is comfortably inside MongoDB's document size limit.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { tenantGuardPlugin } from '../../db/plugins/tenantGuard.js'

const localizedText = {
  en: { type: String, required: true, trim: true },
  ar: { type: String, trim: true },
}

const modifierOptionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: localizedText, required: true },
    /** Integer halalas. Zero or positive — see the schema note in @rw/shared. */
    priceDeltaHalalas: { type: Number, default: 0, min: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false },
)

const modifierGroupSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: localizedText, required: true },
    minSelect: { type: Number, default: 0, min: 0 },
    maxSelect: { type: Number, default: 1, min: 1 },
    required: { type: Boolean, default: false },
    options: { type: [modifierOptionSchema], default: [] },
  },
  { _id: false },
)

const menuItemSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'MenuCategory', required: true, index: true },

    name: { type: localizedText, required: true },
    description: {
      type: { en: { type: String, trim: true }, ar: { type: String, trim: true } },
      default: undefined,
    },

    /** Integer halalas. Never a float — see @rw/shared/money. */
    priceHalalas: { type: Number, required: true, min: 0 },
    /** Per-item override. Undefined means inherit the restaurant's rate. */
    vatRatePercent: { type: Number, min: 0, max: 100 },

    imageUrl: { type: String, trim: true },
    imageThumbUrl: { type: String, trim: true },

    /** Off when the kitchen runs out. A cashier may toggle this mid-service. */
    isAvailable: { type: Boolean, default: true },
    /** Off when the item is retired. Only owners and managers may change it. */
    isActive: { type: Boolean, default: true },

    prepTimeMinutes: { type: Number, min: 0 },

    // Restaurant-supplied. Displayed to customers as the restaurant's own claim,
    // never as our assertion.
    calories: { type: Number, min: 0 },
    ingredients: { type: [String], default: [] },
    allergens: { type: [String], default: [] },

    /**
     * Portions left today, or `null` for an item nobody counts.
     *
     * `null` and `0` mean opposite things and the difference is load-bearing:
     * `null` is "unlimited, never blocks an order", `0` is "sold out". Most of a
     * menu is untracked — nobody counts cups of tea — so `null` is the default
     * and an untracked item behaves exactly as it did before this field existed.
     *
     * **Never sent to a customer.** How many portions remain is the
     * restaurant's business; the customer surface is told only whether the dish
     * is sold out. See `getPublicMenu`.
     */
    stockRemaining: { type: Number, min: 0, default: null },

    sortOrder: { type: Number, default: 0 },
    modifierGroups: { type: [modifierGroupSchema], default: [] },
  },
  { timestamps: true },
)

menuItemSchema.plugin(tenantGuardPlugin)

// Staff browsing one category.
menuItemSchema.index({ restaurantId: 1, categoryId: 1, isActive: 1, sortOrder: 1 })

// The customer menu: the hottest query in the product, hit on every visit.
//
// `sortOrder` is part of the index on purpose. Without it the planner has to
// collect every matching row and sort in memory (verified: the plan was
// SORT → FETCH → IXSCAN), which is a blocking stage on the one request that has
// to feel instant on a phone. With it, the index returns rows already ordered.
//
// `isAvailable` was dropped from this index when sold-out items began staying
// on the menu (2026-08-12). The query now filters on `isActive` alone, and an
// index whose second key is skipped cannot serve the sort — which would have
// quietly reintroduced the exact blocking sort the key above was added to
// remove. Re-run `npm run indexes:check` after touching this.
menuItemSchema.index({ restaurantId: 1, isActive: 1, sortOrder: 1 })

export type MenuItem = InferSchemaType<typeof menuItemSchema>
export type MenuItemDoc = HydratedDocument<MenuItem>

export const MenuItemModel = model('MenuItem', menuItemSchema)
