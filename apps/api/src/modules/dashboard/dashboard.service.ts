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
import { OrderStatus } from '@rw/shared'
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
    tenantRepo(UserModel).countDocuments(),
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

  // 7-day trend
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  
  const allWeekOrders = await tenantRepo(OrderModel).find({ placedAt: trusted({ $gte: sevenDaysAgo }) })
  
  const trendMap = new Map<string, { revenue: number; orders: number }>()
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    trendMap.set(key, { revenue: 0, orders: 0 })
  }

  for (const order of allWeekOrders) {
    const dateKey = order.placedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (trendMap.has(dateKey)) {
      const existing = trendMap.get(dateKey)!
      existing.orders++
      if (order.status === OrderStatus.COMPLETED) {
        existing.revenue += order.totals?.grandTotalHalalas ?? 0
      }
    }
  }

  // Convert map to array and reverse to chronological order
  const trend = Array.from(trendMap.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue / 100, // format to SAR for charting
    orders: data.orders
  })).reverse()

  return {
    todayRevenueHalalas,
    todayOrdersCount,
    activeOrders,
    staffCount,
    trend,
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
