/**
 * User — every human who logs in: platform admins and restaurant staff alike.
 *
 * The tenant guard plugin is deliberately NOT applied here, and the reason is
 * worth stating so nobody "fixes" it later:
 *
 *  - A platform admin legitimately has no `restaurantId`, so a guard that
 *    demands one would make platform accounts impossible to create.
 *  - Login must find an account by email before any tenant is known. Email is
 *    globally unique, so this lookup is inherently cross-tenant.
 *
 * Tenant isolation for this collection is therefore enforced by `tenantRepo(UserModel)`
 * in every staff-management route, and proven by the cross-tenant tests. The only
 * places that query users without a tenant filter are login and token refresh.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { Role, UserStatus } from '@rw/shared'

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /** Argon2id. `select: false` so it is never returned by an ordinary query. */
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },

    role: { type: String, enum: Object.values(Role), required: true },

    /** Null only for PLATFORM_ADMIN. Enforced by the validator below. */
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', default: null },

    status: { type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE },

    /**
     * Bumped to revoke every outstanding access token for this user instantly.
     * Compared against the `tv` claim on every authenticated request.
     */
    tokenVersion: { type: Number, default: 0 },

    /**
     * Set when an account is created with a system-generated temporary
     * password. The client is expected to force a change before doing anything
     * else; the flag is surfaced on login and on /auth/me.
     */
    mustChangePassword: { type: Boolean, default: false },

    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true },
)

// Staff must belong to a restaurant; a platform admin must not. Enforced in the
// database layer as well as in the service, because a mis-shaped user is a
// tenant-isolation hole rather than a mere data-quality problem.
userSchema.pre('validate', function (next) {
  const isPlatformAdmin = this.role === Role.PLATFORM_ADMIN
  if (isPlatformAdmin && this.restaurantId) {
    next(new Error('A platform admin must not belong to a restaurant'))
    return
  }
  if (!isPlatformAdmin && !this.restaurantId) {
    next(new Error(`Role ${String(this.role)} requires a restaurantId`))
    return
  }
  next()
})

userSchema.index({ restaurantId: 1, role: 1 })
userSchema.index({ restaurantId: 1, status: 1 })

export type User = InferSchemaType<typeof userSchema>
export type UserDoc = HydratedDocument<User>

export const UserModel = model('User', userSchema)

/** The shape safe to return over the API. Never includes `passwordHash`. */
export interface PublicUser {
  id: string
  email: string
  name: string
  role: string
  restaurantId: string | null
  status: string
  mustChangePassword: boolean
}

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    restaurantId: user.restaurantId ? user.restaurantId.toString() : null,
    status: user.status,
    mustChangePassword: user.mustChangePassword ?? false,
  }
}
