/**
 * Portion counts.
 *
 * A restaurant sets "20 biriyani today" and each order takes from that. Two
 * things make this harder than a subtraction, and both are handled here:
 *
 *  1. **Two customers can tap at the same moment.** A read-then-write would let
 *     both take the last portion. Every decrement is therefore a single
 *     conditional `findOneAndUpdate` guarded on `stockRemaining >= quantity` —
 *     the same pattern order transitions use. The database decides the race, not
 *     us.
 *
 *  2. **An order has several lines.** If the third line has nothing left, the
 *     first two have already been taken. There are no transactions in this
 *     project (they need a replica set), so the reservation walks back what it
 *     took, exactly as `platform.service.ts` does for a half-created tenant.
 *
 * `stockRemaining: null` means nobody counts this dish. Untracked items are
 * skipped entirely — never decremented, never blocking. That is what keeps this
 * feature opt-in per item.
 */

import { trusted } from 'mongoose'
import { badRequest } from '../../core/errors.js'
import { logger } from '../../core/logger.js'
import { tenantRepo } from '../../core/tenant.js'
import { MenuItemModel } from '../menu/menuItem.model.js'

export interface StockClaim {
  menuItemId: string
  quantity: number
}

/**
 * The same dish can appear on several lines — two Biriyani with different
 * modifiers are two lines but four portions if each is quantity two. Stock is
 * per dish, so the lines are summed before anything is taken.
 */
function totalsByItem(lines: readonly StockClaim[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const line of lines) {
    totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + line.quantity)
  }
  return totals
}

/**
 * Takes stock for an order, or takes nothing at all.
 *
 * Returns what was actually claimed, which the caller must hand back to
 * `releaseStock` if the order then fails for any other reason.
 */
export async function reserveStock(lines: readonly StockClaim[]): Promise<StockClaim[]> {
  const repo = tenantRepo(MenuItemModel)
  const claimed: StockClaim[] = []

  for (const [menuItemId, quantity] of totalsByItem(lines)) {
    // `trusted()` because `sanitizeFilter` is on globally and would otherwise
    // rewrite `$gte` into `$eq`, which matches nothing — the guard would then
    // never fire and every order would silently fail to reserve.
    //
    // A `null` stockRemaining does not satisfy `$gte`, so an untracked item
    // falls through to the check below rather than being decremented.
    const updated = await repo.findOneAndUpdate(
      { _id: menuItemId, stockRemaining: trusted({ $gte: quantity }) },
      { $inc: { stockRemaining: -quantity } },
    )

    if (updated) {
      claimed.push({ menuItemId, quantity })
      continue
    }

    // The guard did not match. Either the dish is untracked, which is fine, or
    // there genuinely is not enough left, which is not.
    const item = await repo.findById(menuItemId)
    if (item && item.stockRemaining == null) continue

    await releaseStock(claimed)

    const remaining = item?.stockRemaining ?? 0
    const name = item?.name?.en ?? 'That item'
    throw badRequest(
      remaining === 0
        ? `${name} is sold out.`
        : `Only ${remaining} left of ${name}. Please reduce the quantity.`,
    )
  }

  return claimed
}

/**
 * Puts stock back — when an order fails after reserving, and when one is
 * cancelled, rejected or expired.
 *
 * Never throws. This runs on paths that are already handling a failure or
 * completing a cancellation, and turning a bookkeeping problem into a 500 would
 * replace a small wrong number with a broken request. A miss is logged loudly
 * so it can be corrected by hand.
 */
export async function releaseStock(lines: readonly StockClaim[]): Promise<void> {
  if (lines.length === 0) return

  const repo = tenantRepo(MenuItemModel)

  for (const [menuItemId, quantity] of totalsByItem(lines)) {
    try {
      // `$ne: null` so an item that has since stopped being counted is not
      // resurrected with a number. `$inc` on null would throw in any case.
      await repo.findOneAndUpdate(
        { _id: menuItemId, stockRemaining: trusted({ $ne: null }) },
        { $inc: { stockRemaining: quantity } },
      )
    } catch (err) {
      logger.error({ err, menuItemId, quantity }, 'failed to return stock; correct it by hand')
    }
  }
}

/** The claims implied by an order that has already been placed. */
export function claimsFromOrder(order: {
  items: readonly { menuItemId?: unknown; quantity: number }[]
}): StockClaim[] {
  return order.items
    .filter((line) => line.menuItemId)
    .map((line) => ({ menuItemId: String(line.menuItemId), quantity: line.quantity }))
}
