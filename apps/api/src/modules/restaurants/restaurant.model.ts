/**
 * Restaurant — the tenant itself.
 *
 * Deliberately NOT given the tenant guard plugin: this collection *is* the
 * tenant list, so a `restaurantId` filter would be meaningless. Access to it is
 * controlled by route-level RBAC instead — restaurant staff can only ever read
 * their own record, because the id comes from their token.
 */

import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { CURRENCY, DEFAULT_VAT_RATE_PERCENT, OrderType, RestaurantStatus } from '@rw/shared'
import { generatePublicId } from '../../core/crypto.js'

const localizedText = { en: { type: String, required: true, trim: true }, ar: { type: String, trim: true } }

const settingsSchema = new Schema(
  {
    currency: { type: String, default: CURRENCY, enum: [CURRENCY] },
    vatRatePercent: { type: Number, default: DEFAULT_VAT_RATE_PERCENT, min: 0, max: 100 },
    /** KSA retail convention: menu prices already include VAT. */
    pricesIncludeVat: { type: Boolean, default: true },
    defaultLocale: { type: String, enum: ['en', 'ar'], default: 'en' },
    serviceChargePercent: { type: Number, default: 0, min: 0, max: 100 },
    /**
     * false (default) = cash must be confirmed by a cashier before the kitchen
     * starts. The restaurant may opt into cooking first.
     */
    kitchenStartsBeforePayment: { type: Boolean, default: false },
    tableSessionTtlMinutes: { type: Number, default: 180, min: 5, max: 1440 },
    orderTypes: {
      type: [String],
      enum: Object.values(OrderType),
      default: [OrderType.DINE_IN],
    },
  },
  { _id: false },
)

const restaurantSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, default: () => generatePublicId() },
    name: { type: localizedText, required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/,
    },
    type: {
      type: String,
      enum: ['SINGLE', 'CHAIN_MAIN', 'BRANCH'],
      default: 'SINGLE',
      index: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: false,
    },
    status: {
      type: String,
      enum: Object.values(RestaurantStatus),
      default: RestaurantStatus.ACTIVE,
      index: true,
    },
    vatNumber: { type: String, trim: true },
    crNumber: { type: String, trim: true },
    addressLine: { type: String, trim: true },
    city: { type: String, trim: true },
    phone: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true },
)

export type Restaurant = InferSchemaType<typeof restaurantSchema>
export type RestaurantDoc = HydratedDocument<Restaurant>

export const RestaurantModel = model('Restaurant', restaurantSchema)
