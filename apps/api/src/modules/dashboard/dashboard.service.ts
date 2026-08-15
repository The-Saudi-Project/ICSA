/**
 * Dashboard counters.
 *
 * Two audiences, two accessors, and the difference matters:
 *
 *  - `getRestaurantStats` runs through `tenantRepo`, so an owner sees their own
 *    restaurant and nothing else. A branch of a chain is an ordinary tenant
 *    here — it has its own `restaurantId`, so its numbers never merge with the
 *    chain's or a sibling branch's.
 *  - `getPlatformStats` runs through the audited `unscoped()` accessor, because
 *    counting every tenant is the whole point of a platform view.
 */

import { trusted } from 'mongoose'
import { unscoped, tenantRepo } from '../../core/tenant.js'
import { OrderModel } from '../orders/order.model.js'
import { OrderStatus, UserStatus } from '@rw/shared'
import { startOfBusinessDay } from '../orders/counter.model.js'
import { UserModel } from '../users/user.model.js'
import { RestaurantModel } from '../restaurants/restaurant.model.js'

/**
 * `trusted()` is mandatory: `sanitizeFilter` is on globally, so a bare
 * `{ $gte: date }` is rewritten to `{ $eq: { $gte: date } }` and silently
 * matches nothing. That is the protection working as designed — see the note in
 * `orders/pricing.ts` — so the operator is marked as ours rather than the
 * setting being turned off.
 */
const placedToday = () => ({ placedAt: trusted({ $gte: startOfBusinessDay() }) })

export async function getRestaurantStats() {
  const [orders, staffCount] = await Promise.all([
    tenantRepo(OrderModel).find(placedToday()),
    // Active only. Counting every row included people who had been disabled —
    // and disabling is how this product removes someone from a team, so the
    // number climbed with every departure and never fell. An owner reading
    // "12 staff" after letting four go is being told something untrue.
    tenantRepo(UserModel).countDocuments({ status: UserStatus.ACTIVE }),
  ])

  let todayRevenueHalalas = 0
  let activeOrders = 0
  const todayOrdersCount = orders.length

  for (const order of orders) {
    if (order.status === OrderStatus.COMPLETED) {
      todayRevenueHalalas += order.totals?.grandTotalHalalas ?? 0
    }
    if (
      order.status === OrderStatus.PLACED ||
      order.status === OrderStatus.PREPARING ||
      order.status === OrderStatus.READY
    ) {
      activeOrders++
    }
  }

  return {
    todayRevenueHalalas,
    todayOrdersCount,
    activeOrders,
    staffCount,
  }
}

export async function getPlatformStats() {
  const [restaurantsCount, todayOrdersCount, staffCount] = await Promise.all([
    unscoped(RestaurantModel).countDocuments(),
    unscoped(OrderModel).countDocuments(placedToday()),
    unscoped(UserModel).countDocuments(),
  ])

  return {
    totalRestaurants: restaurantsCount,
    totalUsers: staffCount,
    todayPlatformOrders: todayOrdersCount,
  }
}
