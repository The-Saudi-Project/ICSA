/**
 * Customer authentication by table session.
 *
 * The counterpart to `middleware/auth.ts` for the public side. It puts
 * `restaurantId` and `tableId` into the request context from the verified
 * session token — which is the entire reason an order request needs no table
 * identifier, and therefore has none to tamper with.
 *
 * Every failure returns the same 404 as an unknown table token. Expired,
 * closed, tampered, revoked and "restaurant suspended" must all look identical.
 */

import { RestaurantStatus } from '@rw/shared'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { requireContext } from '../core/context.js'
import { notFound } from '../core/errors.js'
import { verifyTableSessionToken } from '../core/tableSessionToken.js'
import { RestaurantModel } from '../modules/restaurants/restaurant.model.js'
import { TableModel, TableStatus } from '../modules/tables/table.model.js'
import {
  TableSessionModel,
  TableSessionStatus,
} from '../modules/tables/tableSession.model.js'

const TABLE_NOT_FOUND = 'Table not found'

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization')
  if (!header) return undefined
  const [scheme, value] = header.split(' ')
  if (!value || scheme?.toLowerCase() !== 'bearer') return undefined
  return value.trim()
}

export const requireTableSession: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = bearerToken(req)
    if (!token) throw notFound(TABLE_NOT_FOUND)

    // Audience is pinned to 'rw-table', so a staff access token fails here.
    const claims = await verifyTableSessionToken(token)
    if (!claims) throw notFound(TABLE_NOT_FOUND)

    const session = await TableSessionModel.findById(claims.sid)
    if (!session) throw notFound(TABLE_NOT_FOUND)
    if (session.status !== TableSessionStatus.ACTIVE) throw notFound(TABLE_NOT_FOUND)
    if (session.expiresAt <= new Date()) throw notFound(TABLE_NOT_FOUND)

    // The token's claims must still agree with the stored session. If they ever
    // disagree, the token is forged or stale — either way it is not usable.
    if (
      session.restaurantId.toString() !== claims.rid ||
      session.tableId.toString() !== claims.tid
    ) {
      throw notFound(TABLE_NOT_FOUND)
    }

    // Unscoped: this lookup is what establishes the tenant, so it cannot itself
    // be tenant-scoped. The id comes from the signed session, never from input.
    const table = await TableModel.findOne({ _id: session.tableId }).setOptions({ unscoped: true })
    if (!table || table.status !== TableStatus.ACTIVE) throw notFound(TABLE_NOT_FOUND)

    // A suspended restaurant stops trading immediately, customers included.
    const restaurant = await RestaurantModel.findById(session.restaurantId).select('status')
    if (!restaurant || restaurant.status !== RestaurantStatus.ACTIVE) {
      throw notFound(TABLE_NOT_FOUND)
    }

    const context = requireContext()
    context.restaurantId = session.restaurantId.toString()
    context.tableId = session.tableId.toString()
    context.tableSessionId = session._id.toString()
    context.actorRole = 'CUSTOMER'

    next()
  } catch (error) {
    next(error)
  }
}
