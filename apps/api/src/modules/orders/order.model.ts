/**
 * Order.
 *
 * Every field a customer could care about is a SNAPSHOT taken when the order
 * was placed: item names, unit prices, modifier prices, the VAT rate, and
 * whether prices included VAT. None of them are references.
 *
 * That is the whole point. When the owner raises a price tomorrow, yesterday's
 * bill is unchanged, because yesterday's bill does not look anything up — it
 * already contains its own copy.
 *
 * All money is integer halalas. See `@rw/shared/money`.
 */

import { OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '@rw/shared'
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { generatePublicId } from '../../core/crypto.js'
import { tenantGuardPlugin } from '../../db/plugins/tenantGuard.js'

const localizedSnapshot = {
  en: { type: String, required: true },
  ar: { type: String },
}

const orderModifierSchema = new Schema(
  {
    groupKey: { type: String, required: true },
    optionKey: { type: String, required: true },
    nameSnapshot: { type: localizedSnapshot, required: true },
    groupNameSnapshot: { type: localizedSnapshot },
    priceDeltaHalalas: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const orderItemSchema = new Schema(
  {
    /** Kept for reporting only. Never re-read to price this order. */
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },

    nameSnapshot: { type: localizedSnapshot, required: true },
    /** The item's own price at the moment of ordering, before modifiers. */
    unitPriceHalalas: { type: Number, required: true, min: 0 },
    vatRatePercentSnapshot: { type: Number, required: true, min: 0, max: 100 },

    quantity: { type: Number, required: true, min: 1 },
    modifiers: { type: [orderModifierSchema], default: [] },
    prepTimeMinutes: { type: Number },

    /** (unitPrice + modifier deltas) x quantity, excluding VAT. */
    lineSubtotalHalalas: { type: Number, required: true, min: 0 },
    lineVatHalalas: { type: Number, required: true, min: 0 },
    /** Always exactly lineSubtotal + lineVat. */
    lineTotalHalalas: { type: Number, required: true, min: 0 },

    note: { type: String, trim: true },
  },
  { _id: false },
)

const statusHistorySchema = new Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    byRole: { type: String },
    at: { type: Date, default: Date.now },
    reason: { type: String },
  },
  { _id: false },
)

const orderSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },

    /** What appears in the customer's URL. Opaque and non-sequential. */
    publicId: { type: String, required: true, unique: true, default: () => generatePublicId() },
    /** Short human-readable number, unique per restaurant per day. For shouting across a kitchen. */
    orderNumber: { type: String, required: true },
    /** Permanent sequential invoice number across the lifetime of the restaurant. */
    invoiceNumber: { type: String },

    type: { type: String, enum: Object.values(OrderType), default: OrderType.DINE_IN },

    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    tableSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession' },
    /** So a renamed or deleted table does not change a past order. */
    tableLabelSnapshot: { type: String },

    status: { type: String, enum: Object.values(OrderStatus), required: true, index: true },
    paymentMethod: { type: String, enum: Object.values(PaymentMethod), required: true },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.UNPAID,
    },

    items: { type: [orderItemSchema], required: true },

    totals: {
      subtotalHalalas: { type: Number, required: true, min: 0 },
      vatHalalas: { type: Number, required: true, min: 0 },
      serviceChargeHalalas: { type: Number, default: 0, min: 0 },
      grandTotalHalalas: { type: Number, required: true, min: 0 },
    },

    /** Snapshots of the tax rules applied, so a receipt can be reproduced exactly. */
    vatRateSnapshotPercent: { type: Number, required: true },
    pricesIncludeVatSnapshot: { type: Boolean, required: true },
    currencySnapshot: { type: String, required: true },

    customerNote: { type: String, trim: true },
    customerPhone: { type: String, trim: true },

    isRush: { type: Boolean, default: false },

    /** Unique per restaurant. Stops a retried request creating a second order. */
    idempotencyKey: { type: String },

    statusHistory: { type: [statusHistorySchema], default: [] },

    placedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date },
    readyAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
)

orderSchema.plugin(tenantGuardPlugin)

// Cashier and kitchen boards: one tenant, a set of statuses, newest first.
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 })
// Reports and history.
orderSchema.index({ restaurantId: 1, createdAt: -1 })
// "What has this table ordered during this visit?"
orderSchema.index({ restaurantId: 1, tableId: 1, createdAt: -1 })

// A customer's own order list and status polls.
//
// Compound rather than `{ tableSessionId: 1 }` alone: with only the single-field
// index the planner preferred `restaurantId + createdAt` because that one also
// served the sort, which means walking the restaurant's entire order history to
// find one session's two orders. This shape serves the filter and the sort
// together. Verified with scripts/check-indexes.mts.
orderSchema.index({ restaurantId: 1, tableSessionId: 1, createdAt: -1 })
// Only orders that actually carry a key are constrained.
//
// This was `sparse: true`, which does not mean what it looks like on a compound
// index: MongoDB skips a document only when *every* indexed field is absent.
// `restaurantId` is always present, so a key-less order was indexed with
// `idempotencyKey: null`, and a second key-less order in the same restaurant
// collided on a null. Harmless while every order came through the ordering
// route, which requires the header — but it made the index a trap for any
// future path that creates an order without one (a seed, a migration, a phone
// order typed in by a cashier).
//
// `partialFilterExpression` says the intended thing directly: index the
// document only when `idempotencyKey` is actually a string.
orderSchema.index(
  { restaurantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
)

export type Order = InferSchemaType<typeof orderSchema>
export type OrderDoc = HydratedDocument<Order>

export const OrderModel = model('Order', orderSchema)
