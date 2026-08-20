/**
 * Audit log — append only.
 *
 * An audit trail that can be edited is not an audit trail. Update and delete
 * hooks throw, so even a mistaken call in future code cannot rewrite history.
 * There is no API route that mutates this collection, and none may be added.
 *
 * `restaurantId` is optional because platform-level events (creating or
 * suspending a restaurant) belong to no tenant. Tenant-scoped reads go through
 * `tenantRepo(AuditLogModel)`.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const AuditAction = {
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_LOCKED: 'USER_LOCKED',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  TABLE_CREATED: 'TABLE_CREATED',
  TABLE_UPDATED: 'TABLE_UPDATED',
  TABLE_DELETED: 'TABLE_DELETED',
  TABLE_TOKEN_ROTATED: 'TABLE_TOKEN_ROTATED',
  TABLE_SESSION_STARTED: 'TABLE_SESSION_STARTED',
  TABLE_TOKEN_REJECTED: 'TABLE_TOKEN_REJECTED',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  /** Money changing hands. Recorded separately from a generic status change. */
  CASH_CONFIRMED: 'CASH_CONFIRMED',
  /** Money going back. A payment reversal, recorded separately from a status change. */
  ORDER_REFUNDED: 'ORDER_REFUNDED',
  MENU_CATEGORY_CREATED: 'MENU_CATEGORY_CREATED',
  MENU_CATEGORY_UPDATED: 'MENU_CATEGORY_UPDATED',
  MENU_CATEGORY_DELETED: 'MENU_CATEGORY_DELETED',
  MENU_ITEM_CREATED: 'MENU_ITEM_CREATED',
  MENU_ITEM_UPDATED: 'MENU_ITEM_UPDATED',
  MENU_ITEM_DELETED: 'MENU_ITEM_DELETED',
  /** Money-relevant, so it is recorded separately with before/after values. */
  MENU_PRICE_CHANGED: 'MENU_PRICE_CHANGED',
  MENU_ITEM_AVAILABILITY_CHANGED: 'MENU_ITEM_AVAILABILITY_CHANGED',
  IMAGE_UPLOAD_REQUESTED: 'IMAGE_UPLOAD_REQUESTED',
  STAFF_CREATED: 'STAFF_CREATED',
  STAFF_ROLE_CHANGED: 'STAFF_ROLE_CHANGED',
  STAFF_DISABLED: 'STAFF_DISABLED',
  STAFF_REACTIVATED: 'STAFF_REACTIVATED',
  STAFF_PASSWORD_RESET: 'STAFF_PASSWORD_RESET',
  RESTAURANT_CREATED: 'RESTAURANT_CREATED',
  RESTAURANT_UPDATED: 'RESTAURANT_UPDATED',
  RESTAURANT_SUSPENDED: 'RESTAURANT_SUSPENDED',
  RESTAURANT_REACTIVATED: 'RESTAURANT_REACTIVATED',
  /**
   * Restaurant settings changed. Money-relevant (VAT, service charge, VAT-
   * inclusive pricing) and payment-posture-relevant (kitchen-before-payment),
   * so it is recorded separately with before/after values.
   */
  RESTAURANT_SETTINGS_CHANGED: 'RESTAURANT_SETTINGS_CHANGED',
  /**
   * Retired 2026-08-11. Nothing writes it any more — removing a staff member is
   * a disable, so the audit trail keeps pointing at a real account. Kept in the
   * map because the log is append-only and historic rows may still carry it.
   */
  STAFF_DELETED: 'STAFF_DELETED',
} as const
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

const auditLogSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },

    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    actorType: { type: String, enum: ['USER', 'CUSTOMER', 'SYSTEM'], required: true },

    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String },

    /** Sanitised. Never OTPs, tokens, passwords, or card data. */
    metadata: { type: Schema.Types.Mixed, default: {} },

    requestId: { type: String },
    ipHash: { type: String },

    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, minimize: false },
)

auditLogSchema.index({ restaurantId: 1, at: -1 })
auditLogSchema.index({ action: 1, at: -1 })

const IMMUTABLE_HOOKS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
] as const

for (const hook of IMMUTABLE_HOOKS) {
  auditLogSchema.pre(hook, function () {
    throw new Error(`AuditLog is append-only: ${hook}() is not permitted`)
  })
}

export type AuditLog = InferSchemaType<typeof auditLogSchema>
export type AuditLogDoc = HydratedDocument<AuditLog>

export const AuditLogModel = model('AuditLog', auditLogSchema)
