/**
 * Refresh tokens.
 *
 * The raw token is never stored — only its SHA-256 hash. A database dump
 * therefore yields no usable sessions.
 *
 * `familyId` links every token descended from one login. Rotation issues a new
 * token in the same family and revokes the old one. If a token that has already
 * been revoked is presented, the only plausible explanation is that a copy was
 * stolen, so the entire family is destroyed and the user is logged out
 * everywhere. Losing a session is a small price for containing a theft.
 *
 * No tenant guard: refresh lookups are by token hash and happen before any
 * tenant is known, and platform admins have no tenant at all.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const refreshTokenSchema = new Schema(
  {
    /** sha256(rawToken), hex. Unique so a hash collision cannot be replayed. */
    tokenHash: { type: String, required: true, unique: true, index: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', default: null },

    /** Rotation lineage. All tokens from one login share this. */
    familyId: { type: String, required: true, index: true },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    /** Why it was revoked: 'rotated' | 'logout' | 'reuse-detected' | 'password-change'. */
    revokedReason: { type: String, default: null },

    userAgent: { type: String },
    /** Salted hash — the raw IP is never stored. */
    ipHash: { type: String },
  },
  { timestamps: true },
)

// MongoDB removes expired documents automatically, so the collection cannot
// grow without bound and an expired token cannot linger.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>
export type RefreshTokenDoc = HydratedDocument<RefreshToken>

export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema)
