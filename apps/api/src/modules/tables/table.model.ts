/**
 * Table — a physical table with an NFC tag and a printed QR code.
 *
 * The token is the credential that lets a customer's phone prove which table it
 * is sitting at. It is stored twice, on purpose:
 *
 *  - `tokenHash`  SHA-256, the unique lookup key. A stolen database dump yields
 *                 no working URLs.
 *  - `tokenCipher` AES-256-GCM. Lets the owner reprint the QR code months later
 *                 without rotating the token and rewriting the physical tag.
 *
 * A plain hash cannot be reversed and plaintext would defeat the first point,
 * so both are kept. The encryption key lives in the environment, never in the
 * database — so a dump alone is not enough to recover any token.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { tenantGuardPlugin } from '../../db/plugins/tenantGuard.js'

export const TableStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus]

const tableSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },

    /** What staff call it: "12", "Terrace 3". Unique within the restaurant. */
    label: { type: String, required: true, trim: true, maxlength: 40 },
    zone: { type: String, trim: true, maxlength: 40 },
    seats: { type: Number, min: 1, max: 50 },

    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenCipher: { type: String, required: true },
    tokenRotatedAt: { type: Date, default: Date.now },
    /** Increments on every rotation. Useful for spotting a tag that was never rewritten. */
    tokenVersion: { type: Number, default: 1 },

    status: { type: String, enum: Object.values(TableStatus), default: TableStatus.ACTIVE },
  },
  { timestamps: true },
)

tableSchema.plugin(tenantGuardPlugin)

// Two tables in one restaurant cannot share a label; two restaurants can both
// have a table "12".
tableSchema.index({ restaurantId: 1, label: 1 }, { unique: true })
tableSchema.index({ restaurantId: 1, status: 1 })

export type Table = InferSchemaType<typeof tableSchema>
export type TableDoc = HydratedDocument<Table>

export const TableModel = model('Table', tableSchema)
