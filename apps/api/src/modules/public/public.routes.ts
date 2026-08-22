/**
 * The customer-facing surface. No login, no account, no cookies.
 *
 * Only two things happen here in Step 4: a table token is exchanged for a
 * session, and that session is kept alive. The menu and orders attach to this
 * router in Steps 5 and 6, behind `requireTableSession`.
 */

import { createOrderSchema, exchangeTableTokenSchema, idempotencyKeySchema } from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { getContext, requireContext } from '../../core/context.js'
import { badRequest, notFound } from '../../core/errors.js'
import * as orderService from '../orders/order.service.js'
import { requireTableSession } from '../../middleware/tableSession.js'
import { perTableRateLimit, tableSessionRateLimit } from '../../middleware/rateLimit.js'
import { validate } from '../../middleware/validate.js'
import * as menuService from '../menu/menu.service.js'
import * as tableService from '../tables/table.service.js'
import * as reviewService from '../menu/review.service.js'
import { RestaurantModel } from '../restaurants/restaurant.model.js'
import { requireTenantId, tenantRepo } from '../../core/tenant.js'
import { logger } from '../../core/logger.js'
import { z } from 'zod'
import { TableModel } from '../tables/table.model.js'
import { getIO } from '../../core/socket.js'

export const publicRouter: Router = Router()

/**
 * Exchange the NFC/QR token for a session.
 *
 * This is the only endpoint that ever sees a table token. Everything afterwards
 * uses the returned session token, and reads the table and restaurant from it.
 */
publicRouter.post(
  '/table-sessions',
  tableSessionRateLimit,
  perTableRateLimit,
  validate({ body: exchangeTableTokenSchema }),
  async (req: Request, res: Response) => {
    const { tableToken } = req.body as { tableToken: string }

    const result = await tableService.exchangeTableToken(tableToken, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    })

    // A session token is a credential. Never let a proxy or the browser cache it.
    res.setHeader('Cache-Control', 'no-store')
    res.status(201).json(result)
  },
)

/**
 * Slide the session window and mint a fresh token.
 * The phone calls this quietly while the customer is still at the table.
 */
publicRouter.post(
  '/table-sessions/refresh',
  requireTableSession,
  async (_req: Request, res: Response) => {
    const sessionId = getContext()?.tableSessionId
    if (!sessionId) throw notFound('Table not found')

    const result = await tableService.refreshTableSession(sessionId)

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(result)
  },
)

/**
 * The menu for whichever restaurant the session belongs to.
 *
 * There is no restaurant parameter. The tenant comes from the session, so a
 * customer cannot request another restaurant's menu however they craft the
 * request.
 *
 * Cached privately for a short window and revalidated with an ETag: the menu is
 * the page a customer hits first and re-opens throughout a meal, and it is the
 * one request that must feel instant on a phone. `private` keeps it out of
 * shared proxies, since one tenant's menu must never be served to another.
 */
publicRouter.get('/menu', requireTableSession, async (req: Request, res: Response) => {
  const menu = await menuService.getPublicMenu()

  const etag = `W/"menu-${menu.version}"`
  res.setHeader('ETag', etag)
  res.setHeader('Cache-Control', 'private, max-age=30, must-revalidate')

  if (req.header('if-none-match') === etag) {
    res.status(304).end()
    return
  }

  res.status(200).json(menu)
})

publicRouter.get('/menu/:id/reviews', requireTableSession, async (req: Request, res: Response) => {
  const reviews = await reviewService.getReviews(String(req.params.id))
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ reviews })
})

const reviewSchema = z.object({
  menuItemId: z.string(),
  orderPublicId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
  customerName: z.string().min(1).max(100),
})

publicRouter.post('/reviews', requireTableSession, validate({ body: reviewSchema }), async (req: Request, res: Response) => {
  const review = await reviewService.createReview(req.body as z.infer<typeof reviewSchema>)
  res.status(201).json({ review })
})

/**
 * Place an order.
 *
 * The body contains item ids, quantities and modifier keys. It does not contain
 * a table, a restaurant, a price or a total — those come from the session and
 * from the database. There is nothing here for a tampered client to change.
 *
 * `Idempotency-Key` is required, not optional: a phone on a weak connection
 * retries, and without a key one tap plus one retry is two plates of food.
 */
publicRouter.post(
  '/orders',
  requireTableSession,
  validate({ body: createOrderSchema }),
  async (req: Request, res: Response) => {
    const header = req.header('idempotency-key')
    const parsed = idempotencyKeySchema.safeParse(header)
    if (!parsed.success) {
      throw badRequest(
        'An Idempotency-Key header is required (8-100 characters, letters, digits, - or _).',
      )
    }

    const { order, replayed } = await orderService.createOrder(req.body, parsed.data)

    res.setHeader('Cache-Control', 'no-store')
    // 200 rather than 201 on a replay: nothing was created this time.
    res.status(replayed ? 200 : 201).json({ order, replayed })
  },
)

const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime().optional(),
})
type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>

/** Only orders belonging to the session presenting the request. */
publicRouter.get(
  '/orders',
  requireTableSession,
  validate({ query: listOrdersQuerySchema }),
  async (req: Request & { validatedQuery?: ListOrdersQuery }, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')

    const { limit, cursor } = req.validatedQuery!
    res.status(200).json({ orders: await orderService.listOrdersForSession({ limit, cursor }) })
  },
)

publicRouter.get('/orders/:publicId', requireTableSession, async (req: Request, res: Response) => {
  const order = await orderService.getOrderForSession(String(req.params.publicId))
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ order })
})

/** Customer cancellation, inside the configured window only. */
publicRouter.post(
  '/orders/:publicId/cancel',
  requireTableSession,
  async (req: Request, res: Response) => {
    const order = await orderService.cancelOwnOrder(String(req.params.publicId))
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ order })
  },
)

/** What the customer's phone is currently authorised for. Useful for debugging a tag. */
publicRouter.get('/session', requireTableSession, (_req: Request, res: Response) => {
  const context = getContext()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    session: { tableId: context?.tableId, restaurantId: context?.restaurantId },
  })
})

/** Fetch the restaurant's live status such as wait time. */
publicRouter.get('/restaurant/status', requireTableSession, async (_req: Request, res: Response) => {
  const restaurantId = requireTenantId()
  const restaurant = await RestaurantModel.findById(restaurantId).select('settings')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ estimatedWaitMinutes: restaurant?.settings?.estimatedWaitMinutes ?? 15 })
})

/**
 * Call the waiter to this table.
 *
 * The table and the tenant come from the verified session, never from the body,
 * so this is an ordinary tenant-scoped write: `tenantRepo`, not `unscoped()`.
 * A single `findOneAndUpdate` also removes the read-modify-write race between
 * this and the waiter screen resolving the call.
 */
publicRouter.post('/call-waiter', requireTableSession, async (_req: Request, res: Response) => {
  const context = requireContext()
  if (!context.tableId) {
    throw badRequest('Table ID not found in session')
  }

  const table = await tenantRepo(TableModel).findByIdAndUpdate(context.tableId, {
    $set: { needsWaiterAt: new Date() },
  })
  if (!table) {
    throw notFound('Table not found')
  }

  // A realtime hiccup must not fail the customer's request: the waiter screen
  // also polls, and the flag is already persisted.
  try {
    getIO()
      .to(`restaurant_${context.restaurantId}`)
      .emit('call_waiter', {
        tableLabel: table.label,
        tableId: table.id,
        time: (table.needsWaiterAt ?? new Date()).toISOString(),
      })
  } catch (err) {
    logger.warn({ err }, 'failed to emit call_waiter')
  }

  res.status(200).json({ success: true })
})
