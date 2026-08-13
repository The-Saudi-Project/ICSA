/**
 * Staff authentication middleware.
 *
 * This is where the tenant enters the request. `restaurantId` is taken from the
 * verified token and written into the async context; from that point every
 * tenant-scoped query uses it. No request body or query string can influence it.
 *
 * The user record is loaded on every authenticated request. That is a
 * deliberate trade: it costs one indexed lookup, and it buys instant
 * revocation, immediate effect for disabling an account, and immediate effect
 * for suspending a restaurant — without a Redis blocklist.
 */

import { RestaurantStatus, UserStatus } from '@rw/shared'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { requireContext } from '../core/context.js'
import { unauthenticated } from '../core/errors.js'
import { verifyAccessToken } from '../core/jwt.js'
import { RestaurantModel } from '../modules/restaurants/restaurant.model.js'
import { UserModel } from '../modules/users/user.model.js'

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization')
  if (!header) return undefined
  const [scheme, value] = header.split(' ')
  if (!value || scheme?.toLowerCase() !== 'bearer') return undefined
  return value.trim()
}

export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = bearerToken(req)
    if (!token) throw unauthenticated()

    const claims = await verifyAccessToken(token)
    if (!claims) throw unauthenticated()

    const user = await UserModel.findById(claims.sub)
    if (!user) throw unauthenticated()

    // Revocation check. A bumped tokenVersion invalidates every token issued
    // before it, without waiting for expiry.
    if (user.tokenVersion !== claims.tv) throw unauthenticated('Session revoked')

    if (user.status !== UserStatus.ACTIVE) throw unauthenticated('Session revoked')

    // The token's tenant must still match the user's. If a user were ever moved
    // between restaurants, an old token must not keep the old tenant.
    const userRestaurantId = user.restaurantId ? user.restaurantId.toString() : null
    if (userRestaurantId !== (claims.rid ?? null)) throw unauthenticated('Session revoked')

    if (userRestaurantId) {
      const restaurant = await RestaurantModel.findById(userRestaurantId).select('status')
      if (!restaurant || restaurant.status !== RestaurantStatus.ACTIVE) {
        throw unauthenticated('Session revoked')
      }
    }

    const context = requireContext()
    context.actorUserId = user._id.toString()
    context.actorRole = user.role
    // The one and only place a tenant is assigned for a staff request.
    context.restaurantId = userRestaurantId ?? undefined

    next()
  } catch (error) {
    next(error)
  }
}
