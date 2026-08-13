/**
 * Role-based access control.
 *
 * Deny by default: a route without `requireRole` is reachable by any
 * authenticated user, so every non-trivial route must state its roles
 * explicitly. Roles are read from the request context, which was populated from
 * the verified token — never from the request itself.
 */

import { Role } from '@rw/shared'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { getContext } from '../core/context.js'
import { forbidden, unauthenticated } from '../core/errors.js'

export function requireRole(...allowed: readonly string[]): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction) => {
    const context = getContext()
    if (!context?.actorUserId || !context.actorRole) {
      next(unauthenticated())
      return
    }
    if (!allowed.includes(context.actorRole)) {
      next(forbidden())
      return
    }
    next()
  }
}

/** Owner or manager — restaurant configuration and staff management. */
export const requireRestaurantAdmin = requireRole(Role.OWNER, Role.MANAGER)

/** Anyone who works in the restaurant. */
export const requireStaff = requireRole(
  Role.OWNER,
  Role.MANAGER,
  Role.CASHIER,
  Role.KITCHEN,
  Role.WAITER,
)

/** Us, not the customer. Platform admins never belong to a tenant. */
export const requirePlatformAdmin = requireRole(Role.PLATFORM_ADMIN)
