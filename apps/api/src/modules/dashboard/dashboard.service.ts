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
import { MenuCategoryModel } from '../menu/menuCategory.model.js'
import { MenuItemModel } from '../menu/menuItem.model.js'

/**
 * `trusted()` is mandatory: `sanitizeFilter` is on globally, so a bare
 * `{ $gte: date }` is rewritten to `{ $eq: { $gte: date } }` and silently
 * matches nothing. That is the protection working as designed — see the note in
 * `orders/pricing.ts` — so the operator is marked as ours rather than the
 * setting being turned off.
 */
const placedToday = () => ({ placedAt: trusted({ $gte: startOfBusinessDay() }) })

export async function getRestaurantStats(period: string = 'today') {
  try {
    // Real-time stats (independent of selected period)
    const [activeOrdersDocs, staffCount] = await Promise.all([
      tenantRepo(OrderModel).find({ status: trusted({ $in: [OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY] }) }),
      tenantRepo(UserModel).countDocuments(),
    ])
  const activeOrders = activeOrdersDocs.length;

  let startDate = new Date();
  let endDate = new Date();
  
  if (period === 'today') {
    startDate = startOfBusinessDay();
  } else if (period === 'last_7_days') {
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (period.startsWith('month_')) {
    const datePart = period.split('_')[1] || '';
    const [yearStr, monthStr] = datePart.split('-');
    startDate = new Date(parseInt(yearStr || '0'), parseInt(monthStr || '1') - 1, 1);
    endDate = new Date(parseInt(yearStr || '0'), parseInt(monthStr || '1'), 0, 23, 59, 59, 999);
  } else if (period.startsWith('year_')) {
    const yearStr = period.split('_')[1] || '';
    const year = parseInt(yearStr || '0');
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31, 23, 59, 59, 999);
  }

  let dateCondition: Record<string, Date> = { $gte: startDate };
  if (period.startsWith('month_') || period.startsWith('year_')) {
    dateCondition = { $gte: startDate, $lte: endDate };
  }
  const periodOrders = await tenantRepo(OrderModel).find({ placedAt: trusted(dateCondition) });

  let periodRevenueHalalas = 0;
  const periodOrdersCount = periodOrders.length;

  for (const order of periodOrders) {
    if (order.status === OrderStatus.COMPLETED) {
      periodRevenueHalalas += order.totals?.grandTotalHalalas ?? 0;
    }
  }

  const trendMap = new Map<string, { revenue: number; orders: number }>();
  
  if (period === 'today' || period === 'last_7_days') {
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendMap.set(key, { revenue: 0, orders: 0 });
    }
    
    for (const order of periodOrders) {
      const dateKey = order.placedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (trendMap.has(dateKey)) {
        const existing = trendMap.get(dateKey)!;
        existing.orders++;
        if (order.status === OrderStatus.COMPLETED) {
          existing.revenue += order.totals?.grandTotalHalalas ?? 0;
        }
      }
    }
  } else if (period.startsWith('month_')) {
    const daysInMonth = endDate.getDate();
    const datePart = period.split('_')[1] || '';
    const [yearStr, monthStr] = datePart.split('-');
    
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(parseInt(yearStr || '0'), parseInt(monthStr || '1') - 1, i);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendMap.set(key, { revenue: 0, orders: 0 });
    }
    
    for (const order of periodOrders) {
      const dateKey = order.placedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (trendMap.has(dateKey)) {
        const existing = trendMap.get(dateKey)!;
        existing.orders++;
        if (order.status === OrderStatus.COMPLETED) {
          existing.revenue += order.totals?.grandTotalHalalas ?? 0;
        }
      }
    }
  } else if (period.startsWith('year_')) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(startDate.getFullYear(), i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short' });
      trendMap.set(key, { revenue: 0, orders: 0 });
    }
    
    for (const order of periodOrders) {
      const dateKey = order.placedAt.toLocaleDateString('en-US', { month: 'short' });
      if (trendMap.has(dateKey)) {
        const existing = trendMap.get(dateKey)!;
        existing.orders++;
        if (order.status === OrderStatus.COMPLETED) {
          existing.revenue += order.totals?.grandTotalHalalas ?? 0;
        }
      }
    }
  }

  const trend = Array.from(trendMap.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue / 100,
    orders: data.orders
  }));
  
  if (period === 'today' || period === 'last_7_days') {
    trend.reverse();
  }

  return {
    todayRevenueHalalas: periodRevenueHalalas,
    todayOrdersCount: periodOrdersCount,
    activeOrders,
    staffCount,
    trend,
  }
  } catch (error) {
    console.error('getRestaurantStats CRASH:', (error as Error).stack);
    throw error;
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

export async function getRestaurantBackupData() {
  const [orders, categories, menuItems, staff] = await Promise.all([
    tenantRepo(OrderModel).find({}),
    tenantRepo(MenuCategoryModel).find({}),
    tenantRepo(MenuItemModel).find({}),
    tenantRepo(UserModel).find({}),
  ])

  return {
    orders,
    categories,
    menuItems,
    staff,
  }
}
