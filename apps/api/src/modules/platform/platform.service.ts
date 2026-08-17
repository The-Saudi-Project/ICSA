/**
 * Platform administration — our own operations, not a restaurant's.
 *
 * Every function here uses the audited `unscoped()` accessor, because a
 * platform admin legitimately works across tenants. That is the only place in
 * the codebase where crossing tenants is correct, and every one of these
 * actions writes an audit event naming the admin who performed it.
 */

import { RestaurantStatus, Role, UserStatus, type CreateRestaurantInput } from '@rw/shared'
import { conflict, notFound } from '../../core/errors.js'
import { generateToken, hashPassword } from '../../core/crypto.js'
import { writeAudit } from '../../core/audit.js'
import { unscoped } from '../../core/tenant.js'
import { logger } from '../../core/logger.js'
import { AuditAction, AuditLogModel } from '../audit/auditLog.model.js'
import { revokeAllSessions } from '../auth/auth.service.js'
import { RestaurantModel, type RestaurantDoc } from '../restaurants/restaurant.model.js'
import { UserModel, type UserDoc } from '../users/user.model.js'
import { OrderModel } from '../orders/order.model.js'

export interface CreatedRestaurant {
  restaurant: RestaurantDoc
  owner: UserDoc
  /**
   * Shown to the platform admin exactly once, then never retrievable.
   * The owner must change it on first login (`mustChangePassword`).
   */
  temporaryPassword: string
}

/**
 * Creates a tenant and its first owner.
 *
 * These two writes must not half-succeed: a restaurant with no owner cannot be
 * logged into, and an owner with no restaurant fails validation. MongoDB
 * transactions would be the textbook answer, but they require a replica set,
 * which rules out the simplest local and test setups.
 *
 * Instead the restaurant is created first and deleted again if the owner fails.
 * The exposure window is milliseconds, the failure is logged loudly, and the
 * operation is safe to retry. If we ever need true atomicity across more than
 * two documents, that is the point to revisit transactions — not before.
 */
export async function createRestaurantWithOwner(
  input: CreateRestaurantInput,
): Promise<CreatedRestaurant> {
  const existingSlug = await unscoped(RestaurantModel).findOne({ slug: input.slug })
  if (existingSlug) throw conflict('That slug is already taken')

  const existingEmail = await unscoped(UserModel).findOne({ email: input.owner.email })
  if (existingEmail) throw conflict('That email already has an account')

  // A branch is still a full tenant of its own — it does not share data with its
  // chain or with a sibling. `parentId` records the commercial relationship for
  // the platform view and nothing more; no query ever widens scope through it.
  // Only a BRANCH may carry one, so a stray value on a SINGLE or CHAIN_MAIN can
  // never be read as a hierarchy later.
  if (input.type === 'BRANCH') {
    if (!input.parentId) throw conflict('A branch must specify a parent chain ID')
    const parent = await unscoped(RestaurantModel).findById(input.parentId)
    if (!parent) throw conflict('Parent chain not found')
    if (parent.type !== 'CHAIN_MAIN') throw conflict('Parent must be a CHAIN_MAIN restaurant')
  }

  const restaurant = await unscoped(RestaurantModel).create({
    name: input.name,
    slug: input.slug,
    type: input.type,
    parentId: input.type === 'BRANCH' ? input.parentId : null,
    status: RestaurantStatus.ACTIVE,
    vatNumber: input.vatNumber,
    crNumber: input.crNumber,
    city: input.city,
    phone: input.phone,
  })

  // 24 random bytes, not a memorable string. It is meant to be copied once and
  // replaced immediately, never typed from memory.
  const temporaryPassword = generateToken(18)

  let owner: UserDoc
  try {
    owner = await unscoped(UserModel).create({
      email: input.owner.email,
      passwordHash: await hashPassword(temporaryPassword),
      name: input.owner.name,
      phone: input.owner.phone,
      role: Role.OWNER,
      restaurantId: restaurant._id,
      mustChangePassword: true,
    })
  } catch (error) {
    // Compensating rollback — never leave an unreachable tenant behind.
    await RestaurantModel.deleteOne({ _id: restaurant._id }).setOptions({ unscoped: true })
    logger.error(
      { err: error, slug: input.slug },
      'owner creation failed; rolled back the restaurant',
    )
    throw error
  }

  await writeAudit({
    action: AuditAction.RESTAURANT_CREATED,
    targetType: 'Restaurant',
    targetId: restaurant._id.toString(),
    restaurantId: restaurant._id.toString(),
    metadata: { slug: restaurant.slug, ownerEmail: owner.email },
  })

  await writeAudit({
    action: AuditAction.STAFF_CREATED,
    targetType: 'User',
    targetId: owner._id.toString(),
    restaurantId: restaurant._id.toString(),
    metadata: { role: Role.OWNER, firstOwner: true },
  })

  return { restaurant, owner, temporaryPassword }
}

export interface RestaurantSummary {
  id: string
  publicId: string
  name: { en: string; ar?: string }
  slug: string
  type: string
  parentId?: string | null
  status: string
  subscription: { plan: string, status: string }
  features: string[]
  /** Optional schema fields come back as `string | null | undefined` from Mongoose. */
  city?: string | null
  staffCount: number
  createdAt: Date
}

export async function listRestaurants(options: {
  status?: string
  limit: number
  skip: number
}): Promise<RestaurantSummary[]> {
  const filter = options.status ? { status: options.status } : {}

  const restaurants = await unscoped(RestaurantModel).find(filter, {
    sort: { createdAt: -1 },
    limit: options.limit,
    skip: options.skip,
  })

  // One count per restaurant. Fine at platform scale (tens to low hundreds);
  // if this ever gets slow, replace it with a single $group aggregation.
  return Promise.all(
    restaurants.map(async (r) => ({
      id: r._id.toString(),
      publicId: r.publicId,
      name: r.name as { en: string; ar?: string },
      slug: r.slug,
      type: r.type,
      parentId: r.parentId ? r.parentId.toString() : null,
      status: r.status,
      subscription: r.subscription ?? { plan: 'FREE', status: 'ACTIVE' },
      features: r.features ?? [],
      city: r.city,
      staffCount: await unscoped(UserModel).countDocuments({ restaurantId: r._id }),
      createdAt: r.createdAt,
    })),
  )
}

export async function getRestaurant(id: string): Promise<RestaurantDoc> {
  const restaurant = await unscoped(RestaurantModel).findById(id)
  if (!restaurant) throw notFound('Restaurant not found')
  return restaurant
}

export async function setRestaurantStatus(
  id: string,
  status: string,
  reason?: string,
): Promise<RestaurantDoc> {
  const restaurant = await unscoped(RestaurantModel).findById(id)
  if (!restaurant) throw notFound('Restaurant not found')

  if (restaurant.status === status) return restaurant // idempotent, no audit noise

  const updated = await unscoped(RestaurantModel).findOneAndUpdate(
    { _id: restaurant._id },
    { $set: { status } },
  )

  await writeAudit({
    action:
      status === RestaurantStatus.SUSPENDED
        ? AuditAction.RESTAURANT_SUSPENDED
        : AuditAction.RESTAURANT_REACTIVATED,
    targetType: 'Restaurant',
    targetId: id,
    restaurantId: id,
    metadata: { from: restaurant.status, to: status, reason },
  })

  // Suspension takes effect on the next request for every member of staff,
  // because requireAuth re-checks the restaurant's status each time. Their
  // refresh tokens are left intact so reactivation restores service without
  // forcing everyone to log in again.
  return updated ?? restaurant
}

export interface AuditEntry {
  id: string
  at: Date
  action: string
  actorRole?: string | null
  actorType: string
  restaurantId: string | null
  targetType?: string | null
  targetId?: string | null
  metadata: unknown
  requestId?: string | null
}

export async function listPlatformAudit(options: {
  restaurantId?: string
  action?: string
  limit: number
  skip: number
}): Promise<AuditEntry[]> {
  const filter: Record<string, unknown> = {}
  if (options.restaurantId) filter.restaurantId = options.restaurantId
  if (options.action) filter.action = options.action

  const events = await AuditLogModel.find(filter)
    .setOptions({ unscoped: true })
    .sort({ at: -1 })
    .skip(options.skip)
    .limit(options.limit)
    .exec()

  return events.map((e) => ({
    id: e._id.toString(),
    at: e.at,
    action: e.action,
    actorRole: e.actorRole,
    actorType: e.actorType,
    restaurantId: e.restaurantId ? e.restaurantId.toString() : null,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata,
    requestId: e.requestId,
  }))
}

export async function resetOwnerPassword(restaurantId: string): Promise<{ ownerEmail: string; temporaryPassword: string }> {
  const restaurant = await unscoped(RestaurantModel).findById(restaurantId)
  if (!restaurant) throw notFound('Restaurant not found')

  const owner = await unscoped(UserModel).findOne({ restaurantId, role: Role.OWNER })
  if (!owner) throw notFound('No owner found for this restaurant')

  const temporaryPassword = generateToken(18)
  const passwordHash = await hashPassword(temporaryPassword)

  await unscoped(UserModel).findOneAndUpdate(
    { _id: owner._id },
    { $set: { passwordHash, mustChangePassword: true } }
  )

  await writeAudit({
    action: AuditAction.PASSWORD_CHANGED,
    targetType: 'User',
    targetId: owner._id.toString(),
    restaurantId: restaurantId,
    metadata: { reason: 'platform-admin-reset' }
  })

  return { ownerEmail: owner.email, temporaryPassword }
}

export async function updateRestaurant(id: string, payload: { name?: { en: string; ar?: string }; slug?: string; city?: string; vatNumber?: string; crNumber?: string }): Promise<RestaurantDoc> {
  const restaurant = await unscoped(RestaurantModel).findById(id)
  if (!restaurant) throw notFound('Restaurant not found')

  const updated = await unscoped(RestaurantModel).findOneAndUpdate(
    { _id: restaurant._id },
    { $set: payload },
    { new: true }
  )

  await writeAudit({
    action: AuditAction.RESTAURANT_UPDATED,
    targetType: 'Restaurant',
    targetId: id,
    restaurantId: id,
    metadata: { payload },
  })

  return updated!
}

export async function listRestaurantStaff(restaurantId: string): Promise<UserDoc[]> {
  const users = await unscoped(UserModel).find({ restaurantId }, { sort: { createdAt: 1 } })
  return users
}

export async function addRestaurantStaff(restaurantId: string, payload: { name: string; email: string; role: Role }): Promise<{ user: UserDoc; temporaryPassword: string }> {
  const restaurant = await unscoped(RestaurantModel).findById(restaurantId)
  if (!restaurant) throw notFound('Restaurant not found')

  const existingEmail = await unscoped(UserModel).findOne({ email: payload.email })
  if (existingEmail) throw conflict('That email already has an account')

  const temporaryPassword = generateToken(18)
  
  const user = await unscoped(UserModel).create({
    email: payload.email,
    passwordHash: await hashPassword(temporaryPassword),
    name: payload.name,
    role: payload.role,
    restaurantId: restaurant._id,
    mustChangePassword: true,
  })

  await writeAudit({
    action: AuditAction.STAFF_CREATED,
    targetType: 'User',
    targetId: user._id.toString(),
    restaurantId: restaurant._id.toString(),
    metadata: { role: user.role, email: user.email },
  })

  return { user, temporaryPassword }
}

export async function updateRestaurantStaff(
  restaurantId: string,
  staffId: string,
  payload: { name?: string; role?: Role; status?: UserStatus },
): Promise<UserDoc> {
  const user = await unscoped(UserModel).findOne({ _id: staffId, restaurantId })
  if (!user) throw notFound('Staff member not found')

  const updated = await unscoped(UserModel).findOneAndUpdate(
    { _id: user._id },
    { $set: payload },
    { new: true },
  )
  if (!updated) throw notFound('Staff member not found')

  // Only when the role actually moved. Auditing a name edit as a role change
  // makes the log noisier and, worse, less believable.
  if (payload.role && payload.role !== user.role) {
    await writeAudit({
      action: AuditAction.STAFF_ROLE_CHANGED,
      targetType: 'User',
      targetId: staffId,
      restaurantId,
      metadata: { from: user.role, to: payload.role, email: user.email },
    })
  }

  // `middleware/auth.ts` reads the role from the database rather than from the
  // token claim, so a role change bites on the next request without revocation.
  // A disable must not wait for anything, so it revokes.
  if (payload.status === UserStatus.DISABLED && user.status !== UserStatus.DISABLED) {
    await revokeAllSessions(staffId, 'staff-disabled-by-platform')
    await writeAudit({
      action: AuditAction.STAFF_DISABLED,
      targetType: 'User',
      targetId: staffId,
      restaurantId,
      metadata: { email: user.email, role: user.role },
    })
  }

  if (payload.status === UserStatus.ACTIVE && user.status !== UserStatus.ACTIVE) {
    await writeAudit({
      action: AuditAction.STAFF_REACTIVATED,
      targetType: 'User',
      targetId: staffId,
      restaurantId,
      metadata: { email: user.email, role: user.role },
    })
  }

  return updated
}

/**
 * Removes someone from a restaurant's team — by disabling them, not by deleting
 * the row.
 *
 * A hard delete was the original implementation and it was wrong twice over.
 * The audit log is append-only precisely so that "who did this" survives, and
 * every entry stores an `actorUserId`; deleting the account turns every action
 * that person ever took into a dangling id. It also left their refresh tokens
 * live in the database, so the row vanished while the sessions did not.
 *
 * Disabling is what the rest of the product does (`staff.service.ts`), and it
 * is the stronger action of the two: the account stops working immediately,
 * every session ends, and the history still resolves to a real person.
 */
export async function deactivateRestaurantStaff(
  restaurantId: string,
  staffId: string,
): Promise<UserDoc> {
  return updateRestaurantStaff(restaurantId, staffId, { status: UserStatus.DISABLED })
}

export async function getPlatformAnalytics() {
  const [totalRestaurants, totalUsers, totalOrders, revenueStats] = await Promise.all([
    unscoped(RestaurantModel).countDocuments(),
    unscoped(UserModel).countDocuments(),
    unscoped(OrderModel).countDocuments(),
    unscoped(OrderModel).aggregate<{ totalHalalas: number }>([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, totalHalalas: { $sum: '$totals.grandTotalHalalas' } } }
    ])
  ])

  const totalRevenue = revenueStats.length > 0 && revenueStats[0] ? revenueStats[0].totalHalalas / 100 : 0

  return {
    totalRestaurants,
    totalUsers,
    totalOrders,
    totalRevenue
  }
}

export async function updateSubscription(id: string, payload: { plan: string; status: string }): Promise<RestaurantDoc> {
  const restaurant = await unscoped(RestaurantModel).findById(id)
  if (!restaurant) throw notFound('Restaurant not found')

  const updated = await unscoped(RestaurantModel).findOneAndUpdate(
    { _id: restaurant._id },
    { $set: { 'subscription.plan': payload.plan, 'subscription.status': payload.status } },
    { new: true }
  )

  await writeAudit({
    action: AuditAction.RESTAURANT_UPDATED,
    targetType: 'Restaurant',
    targetId: id,
    metadata: { subscription: payload },
  })

  return updated!
}

export async function updateFeatures(id: string, features: string[]): Promise<RestaurantDoc> {
  const restaurant = await unscoped(RestaurantModel).findById(id)
  if (!restaurant) throw notFound('Restaurant not found')

  const updated = await unscoped(RestaurantModel).findOneAndUpdate(
    { _id: restaurant._id },
    { $set: { features } },
    { new: true }
  )

  await writeAudit({
    action: AuditAction.RESTAURANT_UPDATED,
    targetType: 'Restaurant',
    targetId: id,
    metadata: { features },
  })

  return updated!
}

