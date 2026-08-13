/**
 * TableSession — one customer's visit to one table.
 *
 * Created when a table token is exchanged, and referenced by the short-lived
 * session token the phone then carries. The session is the thing that answers
 * "which table is this request coming from", so a client never has to send a
 * table id and therefore never has the chance to send the wrong one.
 *
 * No tenant guard: the session is looked up by id from a verified token before
 * the tenant context exists. Its `restaurantId` is what establishes that
 * context, so guarding it would be circular. Every lookup goes through
 * `requireTableSession`, which then checks the tenant itself.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { generatePublicId } from '../../core/crypto.js'

export const TableSessionStatus = {
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED',
} as const
export type TableSessionStatus = (typeof TableSessionStatus)[keyof typeof TableSessionStatus]

const tableSessionSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },

    publicId: { type: String, required: true, unique: true, default: () => generatePublicId() },

    status: {
      type: String,
      enum: Object.values(TableSessionStatus),
      default: TableSessionStatus.ACTIVE,
    },

    startedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    /** Hard expiry. Sliding within the restaurant's configured window. */
    expiresAt: { type: Date, required: true },

    /** Salted hash only — raw IPs are never stored. */
    ipHash: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
)

// Expired sessions are removed automatically, so the collection cannot grow
// without bound in a busy restaurant.
tableSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
tableSessionSchema.index({ restaurantId: 1, tableId: 1, status: 1 })

export type TableSession = InferSchemaType<typeof tableSessionSchema>
export type TableSessionDoc = HydratedDocument<TableSession>

export const TableSessionModel = model('TableSession', tableSessionSchema)
