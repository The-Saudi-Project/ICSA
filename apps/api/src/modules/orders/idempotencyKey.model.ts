/**
 * Idempotency records.
 *
 * A phone on a weak connection retries. Without this, one tap on "Place order"
 * plus one automatic retry is two plates of food, one of which nobody pays for.
 *
 * The unique index does the work: the second request loses the race at the
 * database, then reads back the first request's stored response and returns it.
 * That is race-proof in a way "check then insert" is not.
 *
 * Not tenant-guarded — the `restaurantId` is part of the unique index, and the
 * insert happens before any repository is involved.
 */

import { Schema, model } from 'mongoose'

const idempotencyKeySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    /** Which operation. Keys are scoped so an order key cannot satisfy a payment. */
    scope: { type: String, required: true },
    key: { type: String, required: true },

    /**
     * Hash of the request body. A client reusing a key with *different* content
     * is a bug on their side, and returning the first response would hide it.
     */
    requestHash: { type: String, required: true },

    status: { type: String, enum: ['IN_PROGRESS', 'DONE'], default: 'IN_PROGRESS' },
    /** The response to replay. Written once the operation succeeds. */
    responseSnapshot: { type: Schema.Types.Mixed },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

idempotencyKeySchema.index({ restaurantId: 1, scope: 1, key: 1 }, { unique: true })
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const IdempotencyKeyModel = model('IdempotencyKey', idempotencyKeySchema)

/** 24 hours. Long enough for any retry, short enough to keep the collection small. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
