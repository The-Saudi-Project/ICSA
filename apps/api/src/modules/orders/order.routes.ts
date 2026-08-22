/**
 * Order routes — restaurant side.
 *
 * Note what is absent: there is no `PATCH /orders/:id` that accepts a status,
 * and no route at all that accepts a price or a total. The only way an order
 * moves is `POST /:id/transition`, which consults the state machine with the
 * caller's role.
 */

import {
  CASHIER_BOARD_STATUSES,
  KITCHEN_BOARD_STATUSES,
  WAITER_BOARD_STATUSES,
  objectIdSchema,
  Role,
  OrderStatus,
  transitionOrderSchema,
  createOrderSchema,
  idempotencyKeySchema,
} from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole, requireStaff } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { badRequest, notFound } from '../../core/errors.js'
import * as orderService from './order.service.js'
import { TableModel } from '../tables/table.model.js'
import { requireTenantId } from '../../core/tenant.js'
import { getIO } from '../../core/socket.js'

export const orderRouter: Router = Router()

orderRouter.use(requireAuth, requireStaff)

const idParamsSchema = z.object({ id: objectIdSchema })

orderRouter.get('/waiter-calls', async (_req: Request, res: Response) => {
  const restaurantId = requireTenantId()
  const tables = await TableModel.find(
    { restaurantId, needsWaiterAt: { $ne: null } },
    null,
    { sanitizeFilter: false }
  )
    .select('label needsWaiterAt status')
    .sort({ needsWaiterAt: 1 })
  
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ calls: tables })
})

orderRouter.post('/:id/resolve-call', validate({ params: idParamsSchema }), async (req: Request, res: Response) => {
  const restaurantId = requireTenantId()
  const table = await TableModel.findOneAndUpdate(
    { _id: req.params.id, restaurantId },
    { $set: { needsWaiterAt: null } },
    { new: true }
  )
  if (!table) throw notFound('Table not found')

  const io = getIO()
  io.to(`restaurant_${restaurantId}`).emit('call_waiter_resolved', { tableId: table.id })

  res.status(200).json({ success: true })
})

const listQuerySchema = z.object({
  /** `board=kitchen|cashier|waiter` is a shortcut for the status set each screen shows. */
  board: z.enum(['kitchen', 'cashier', 'waiter']).optional(),
  status: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined))
    .refine(
      (list) => !list || list.every((s) => (Object.values(OrderStatus) as string[]).includes(s)),
      'unknown status',
    ),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
})

type ListQuery = z.infer<typeof listQuerySchema>

orderRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: Request & { validatedQuery?: ListQuery }, res: Response) => {
    const query = req.validatedQuery!

    const statuses =
      query.status ??
      (query.board === 'kitchen'
        ? KITCHEN_BOARD_STATUSES
        : query.board === 'cashier'
          ? CASHIER_BOARD_STATUSES
          : query.board === 'waiter'
            ? WAITER_BOARD_STATUSES
            : undefined)

    const orders = await orderService.listOrders({
      statuses,
      from: query.from,
      to: query.to,
      limit: query.limit,
      skip: query.skip,
    })

    // Boards poll this every few seconds; never let a proxy hold a stale copy.
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ orders, count: orders.length })
  },
)

orderRouter.get(
  '/:id',
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    res.status(200).json({ order: await orderService.getOrder(String(req.params.id)) })
  },
)

/** The single route that changes an order's status. */
orderRouter.post(
  '/:id/transition',
  validate({ params: idParamsSchema, body: transitionOrderSchema }),
  async (req: Request, res: Response) => {
    const { to, reason, expectedCurrentStatus } = req.body as {
      to: OrderStatus
      reason?: string
      expectedCurrentStatus?: string
    }

    const order = await orderService.transitionOrder(String(req.params.id), to, {
      reason,
      expectedCurrentStatus,
    })

    res.status(200).json({ order })
  },
)

/**
 * Cash confirmation. Cashier and above only — the kitchen must never be able to
 * mark money as received.
 */
orderRouter.post(
  '/:id/confirm-cash',
  requireRole(Role.CASHIER, Role.MANAGER, Role.OWNER),
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    const order = await orderService.confirmCashPayment(String(req.params.id))
    res.status(200).json({ order })
  }
)

orderRouter.post(
  '/:id/refund',
  requireRole(Role.CASHIER, Role.MANAGER, Role.OWNER),
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    const order = await orderService.refundOrder(String(req.params.id))
    res.status(200).json({ order })
  }
)

orderRouter.post(
  '/staff-create',
  requireRole(Role.WAITER, Role.MANAGER, Role.OWNER),
  validate({
    body: createOrderSchema.extend({
      tableId: z.string().optional(),
    }),
  }),
  async (req: Request, res: Response) => {
    const parsed = idempotencyKeySchema.safeParse(req.header('x-idempotency-key'))
    if (!parsed.success) {
      throw badRequest(
        'An X-Idempotency-Key header is required (8-100 characters, letters, digits, - or _).',
      )
    }
    const result = await orderService.staffCreateOrder(
      req.body as Parameters<typeof orderService.staffCreateOrder>[0],
      parsed.data,
    )
    if (result.replayed) {
      res.setHeader('X-Idempotent-Replay', 'true')
    }
    res.status(result.replayed ? 200 : 201).json({ order: result.order })
  },
)

orderRouter.patch(
  '/:id/rush',
  requireRole(Role.KITCHEN, Role.MANAGER, Role.OWNER),
  validate({ params: idParamsSchema, body: z.object({ isRush: z.boolean() }) }),
  async (req: Request, res: Response) => {
    const order = await orderService.toggleRush(String(req.params.id), req.body.isRush)
    res.status(200).json({ order })
  }
)
