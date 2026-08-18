/**
 * Orders.
 *
 * Three rules govern everything here:
 *
 *  1. The tenant and table come from the session, never from the request.
 *  2. Prices come from the database, never from the request.
 *  3. Status changes come from the transition table, never from the request.
 *
 * Concurrency is handled with conditional updates rather than read-then-write:
 * a transition only applies if the order is still in the status the caller
 * believed it was in. Two cashiers double-clicking cannot both succeed.
 */

import {
  checkTransition,
  isTerminal,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  type CreateOrderInput,
} from '@rw/shared'
import { createHash } from 'node:crypto'
import { trusted } from 'mongoose'
import { env } from '../../config/env.js'
import { writeAudit } from '../../core/audit.js'
import { getContext, requireContext } from '../../core/context.js'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { logger } from '../../core/logger.js'
import { getIO } from '../../core/socket.js'
import { requireTenantId, tenantRepo } from '../../core/tenant.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { RestaurantModel } from '../restaurants/restaurant.model.js'
import { TableModel } from '../tables/table.model.js'
import { nextOrderNumber, nextInvoiceNumber } from './counter.model.js'
import { IDEMPOTENCY_TTL_MS, IdempotencyKeyModel } from './idempotencyKey.model.js'
import { OrderModel, type OrderDoc } from './order.model.js'
import { priceOrder } from './pricing.js'
import { claimsFromOrder, releaseStock, reserveStock, type StockClaim } from './stock.js'

const IDEMPOTENCY_SCOPE = 'order.create'

/* ── views ────────────────────────────────────────────────────────────────── */

export interface OrderView {
  id: string
  publicId: string
  orderNumber: string
  invoiceNumber?: string
  status: string
  paymentMethod: string
  paymentStatus: string
  tableLabel?: string | null
  items: unknown[]
  totals: unknown
  currency: string
  customerNote?: string | null
  placedAt: Date
  statusHistory?: unknown[]
  isRush?: boolean
}

function toOrderView(order: OrderDoc, includeHistory = false): OrderView {
  return {
    id: order._id.toString(),
    publicId: order.publicId,
    orderNumber: order.orderNumber,
    invoiceNumber: order.invoiceNumber ?? undefined,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    tableLabel: order.tableLabelSnapshot,
    items: order.items,
    totals: order.totals,
    currency: order.currencySnapshot,
    customerNote: order.customerNote,
    placedAt: order.placedAt,
    isRush: order.isRush ?? false,
    ...(includeHistory ? { statusHistory: order.statusHistory } : {}),
  }
}

/**
 * What the customer sees.
 *
 * The internal `_id` is stripped deliberately. A customer only ever needs
 * `publicId`, which is opaque and non-sequential; handing out the database id
 * as well would let anyone who saw one order guess at the shape of the rest.
 */
export type CustomerOrderView = Omit<OrderView, 'id' | 'statusHistory'>

function toCustomerOrderView(order: OrderDoc): CustomerOrderView {
  const { id: _internalId, statusHistory: _history, ...rest } = toOrderView(order)
  return rest
}

/* ── creation ─────────────────────────────────────────────────────────────── */

function hashRequest(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

/**
 * Where a new order starts.
 *
 * Default: cash is confirmed by a cashier before the kitchen begins, so a
 * restaurant never cooks food nobody has paid for. A restaurant that prefers
 * speed can flip `kitchenStartsBeforePayment` and accept that risk knowingly.
 */
function initialStatusFor(
  paymentMethod: string,
  kitchenStartsBeforePayment: boolean,
): { status: OrderStatus; paymentStatus: PaymentStatus } {
  if (paymentMethod === PaymentMethod.CASH) {
    return kitchenStartsBeforePayment
      ? { status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.CASH_PENDING }
      : { status: OrderStatus.CASH_PENDING, paymentStatus: PaymentStatus.CASH_PENDING }
  }
  // Card arrives in Phase 2 with the payment provider. Until a webhook can
  // confirm payment, accepting a card order would mean trusting the browser.
  throw badRequest('Card payment is not available yet. Please choose cash.')
}

export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey: string,
): Promise<{ order: CustomerOrderView; replayed: boolean }> {
  const context = requireContext()
  const restaurantId = requireTenantId()

  if (!context.tableSessionId || !context.tableId) {
    // Unreachable through the router — requireTableSession runs first.
    throw forbidden('A table session is required to place an order')
  }

  const requestHash = hashRequest(input)

  // Claim the key first. If another request already holds it, we lost the race
  // and must replay its answer rather than create a second order.
  let claimed = true
  try {
    await IdempotencyKeyModel.create({
      restaurantId,
      scope: IDEMPOTENCY_SCOPE,
      key: idempotencyKey,
      requestHash,
      status: 'IN_PROGRESS',
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    claimed = false
  }

  if (!claimed) {
    const existing = await IdempotencyKeyModel.findOne({
      restaurantId,
      scope: IDEMPOTENCY_SCOPE,
      key: idempotencyKey,
    })

    if (existing?.status === 'DONE') {
      // Reusing a key with different content is a client bug. Replaying the old
      // response would hide it and could serve the wrong order to the customer.
      if (existing.requestHash !== requestHash) {
        throw conflict('This idempotency key was already used for a different order')
      }
      return { order: existing.responseSnapshot as CustomerOrderView, replayed: true }
    }

    throw conflict('That order is already being processed. Please wait a moment.')
  }

  // Tracked outside the try so the catch can hand back whatever was taken if
  // anything downstream fails.
  let reserved: StockClaim[] = []

  try {
    const [restaurant, table] = await Promise.all([
      RestaurantModel.findById(restaurantId),
      TableModel.findOne({ _id: context.tableId }).setOptions({ unscoped: true }),
    ])
    if (!restaurant) throw notFound('Restaurant not found')

    const settings = restaurant.settings

    // Every price is computed here, from the database. Nothing the client sent
    // about money survives this call — there was nothing to send.
    const priced = await priceOrder(input, {
      vatRatePercent: settings.vatRatePercent,
      pricesIncludeVat: settings.pricesIncludeVat,
      serviceChargePercent: settings.serviceChargePercent,
      currency: settings.currency,
    })

    // After pricing, because pricing is what proves the items exist and are
    // orderable; before the order document, so a dish that ran out in the last
    // second stops the order rather than producing one the kitchen cannot cook.
    reserved = await reserveStock(
      input.items.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
    )

    const { status, paymentStatus } = initialStatusFor(
      input.paymentMethod,
      settings.kitchenStartsBeforePayment,
    )

    const orderNumber = await nextOrderNumber(restaurantId)
    const invoiceNumber = await nextInvoiceNumber(restaurantId)

    const order = await tenantRepo(OrderModel).create({
      orderNumber,
      invoiceNumber,
      // Read from the session. There is no field in the request for either.
      tableId: context.tableId,
      tableSessionId: context.tableSessionId,
      tableLabelSnapshot: table?.label,
      status,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      items: priced.items,
      totals: priced.totals,
      vatRateSnapshotPercent: settings.vatRatePercent,
      pricesIncludeVatSnapshot: settings.pricesIncludeVat,
      currencySnapshot: settings.currency,
      customerNote: input.customerNote,
      customerPhone: input.customerPhone,
      idempotencyKey,
      statusHistory: [{ to: status, byRole: 'CUSTOMER', at: new Date() }],
      placedAt: new Date(),
    })

    // The customer-safe shape is what gets returned *and* what gets stored for
    // replay, so a retried request cannot receive more than the original did.
    const view = toCustomerOrderView(order)

    await IdempotencyKeyModel.updateOne(
      { restaurantId, scope: IDEMPOTENCY_SCOPE, key: idempotencyKey },
      { $set: { status: 'DONE', responseSnapshot: view } },
    )

    await writeAudit({
      action: AuditAction.ORDER_CREATED,
      actorType: 'CUSTOMER',
      targetType: 'Order',
      targetId: order._id.toString(),
      metadata: {
        orderNumber,
        invoiceNumber,
        tableLabel: table?.label,
        grandTotalHalalas: priced.totals.grandTotalHalalas,
        itemCount: priced.items.length,
      },
    })

    try {
      getIO().to(`restaurant_${restaurantId}`).emit('order_created')
    } catch (err) {
      logger.warn({ err }, 'failed to emit order_created')
    }

    return { order: view, replayed: false }
  } catch (error) {
    // Nothing was cooked, so nothing should stay reserved. Safe to call with an
    // empty list when the failure happened before or during reservation —
    // `reserveStock` already unwinds its own partial work.
    await releaseStock(reserved)

    // Release the key so a corrected retry is not blocked for 24 hours by a
    // failure that was never going to produce an order.
    await IdempotencyKeyModel.deleteOne({
      restaurantId,
      scope: IDEMPOTENCY_SCOPE,
      key: idempotencyKey,
      status: 'IN_PROGRESS',
    }).catch((err: unknown) => {
      logger.error({ err }, 'failed to release idempotency key after a failed order')
    })
    throw error
  }
}

export async function staffCreateOrder(
  input: CreateOrderInput & { tableId?: string },
  idempotencyKey: string,
): Promise<{ order: OrderView; replayed: boolean }> {
  const context = requireContext()
  const restaurantId = requireTenantId()

  const requestHash = hashRequest(input)

  let claimed = true
  try {
    await IdempotencyKeyModel.create({
      restaurantId,
      scope: 'staff.order.create',
      key: idempotencyKey,
      requestHash,
      status: 'IN_PROGRESS',
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    claimed = false
  }

  if (!claimed) {
    const existing = await IdempotencyKeyModel.findOne({
      restaurantId,
      scope: 'staff.order.create',
      key: idempotencyKey,
    })

    if (existing?.status === 'DONE') {
      if (existing.requestHash !== requestHash) {
        throw conflict('This idempotency key was already used for a different order')
      }
      return { order: existing.responseSnapshot as OrderView, replayed: true }
    }
    throw conflict('That order is already being processed.')
  }

  let reserved: StockClaim[] = []

  try {
    const restaurant = await RestaurantModel.findById(restaurantId)
    if (!restaurant) throw notFound('Restaurant not found')

    let table: { label?: string } | null = null
    let sessionId: unknown = null

    if (input.tableId) {
      table = await TableModel.findOne({ _id: input.tableId }).setOptions({ unscoped: true })
      if (!table) throw notFound('Table not found')
      
      // Look for an active session to attach it to, so customers see it.
      const mongoose = await import('mongoose')
      const activeSession = await mongoose.model('TableSession').findOne({
        restaurantId,
        tableId: input.tableId,
        status: 'ACTIVE'
      })
      if (activeSession) sessionId = activeSession._id
    }

    const settings = restaurant.settings

    const priced = await priceOrder(input, {
      vatRatePercent: settings.vatRatePercent,
      pricesIncludeVat: settings.pricesIncludeVat,
      serviceChargePercent: settings.serviceChargePercent,
      currency: settings.currency,
    })

    reserved = await reserveStock(
      input.items.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
    )

    const { status, paymentStatus } = initialStatusFor(
      input.paymentMethod,
      settings.kitchenStartsBeforePayment,
    )

    const orderNumber = await nextOrderNumber(restaurantId)
    const invoiceNumber = await nextInvoiceNumber(restaurantId)

    const order = await tenantRepo(OrderModel).create({
      orderNumber,
      invoiceNumber,
      tableId: input.tableId || null,
      tableSessionId: sessionId,
      tableLabelSnapshot: table?.label,
      status,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      items: priced.items,
      totals: priced.totals,
      vatRateSnapshotPercent: settings.vatRatePercent,
      pricesIncludeVatSnapshot: settings.pricesIncludeVat,
      currencySnapshot: settings.currency,
      customerNote: input.customerNote,
      idempotencyKey,
      statusHistory: [{ to: status, byRole: context.actorRole ?? 'STAFF', byUserId: context.actorUserId, at: new Date() }],
      placedAt: new Date(),
    })

    const view = toOrderView(order)

    await IdempotencyKeyModel.updateOne(
      { restaurantId, scope: 'staff.order.create', key: idempotencyKey },
      { $set: { status: 'DONE', responseSnapshot: view } },
    )

    await writeAudit({
      action: AuditAction.ORDER_CREATED,
      targetType: 'Order',
      targetId: order._id.toString(),
      metadata: {
        orderNumber,
        invoiceNumber,
        tableLabel: table?.label,
        grandTotalHalalas: priced.totals.grandTotalHalalas,
        itemCount: priced.items.length,
      },
    })

    try {
      getIO().to(`restaurant_${restaurantId}`).emit('order_created')
    } catch (err) {
      logger.warn({ err }, 'failed to emit order_created')
    }

    return { order: view, replayed: false }
  } catch (error) {
    await releaseStock(reserved)
    await IdempotencyKeyModel.deleteOne({
      restaurantId,
      scope: 'staff.order.create',
      key: idempotencyKey,
      status: 'IN_PROGRESS',
    }).catch(() => {})
    throw error
  }
}

/* ── reading ──────────────────────────────────────────────────────────────── */

/** Customer view: only orders belonging to the session presenting the request. */
export async function getOrderForSession(publicId: string) {
  const sessionId = getContext()?.tableSessionId
  if (!sessionId) throw notFound('Order not found')

  const order = await tenantRepo(OrderModel).findOne({ publicId, tableSessionId: sessionId })
  if (!order) throw notFound('Order not found')

  return toCustomerOrderView(order)
}

export async function listOrdersForSession(options?: { cursor?: string; limit?: number }) {
  const sessionId = getContext()?.tableSessionId
  if (!sessionId) throw notFound('Order not found')

  const limit = options?.limit ?? 20
  
  const query: Record<string, unknown> = { tableSessionId: sessionId }
  if (options?.cursor) {
    query.createdAt = { $lt: new Date(options.cursor) }
  }

  const orders = await tenantRepo(OrderModel).find(
    query,
    { sort: { createdAt: -1 }, limit },
  )

  return orders.map(toCustomerOrderView)
}

export async function listOrders(filter: {
  statuses?: readonly string[]
  from?: Date
  to?: Date
  limit: number
  skip: number
}): Promise<OrderView[]> {
  // `trusted()` marks these operators as ours. Without it `sanitizeFilter`
  // wraps them in `$eq` — see the note in pricing.ts.
  const query: Record<string, unknown> = {}
  if (filter.statuses?.length) query.status = trusted({ $in: [...filter.statuses] })
  if (filter.from || filter.to) {
    query.createdAt = trusted({
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    })
  }

  const orders = await tenantRepo(OrderModel).find(query, {
    sort: { createdAt: -1 },
    limit: filter.limit,
    skip: filter.skip,
  })

  return orders.map((o) => toOrderView(o))
}

export async function getOrder(id: string): Promise<OrderView> {
  const order = await tenantRepo(OrderModel).findById(id)
  if (!order) throw notFound('Order not found')
  return toOrderView(order, true)
}

/* ── transitions ──────────────────────────────────────────────────────────── */

const TIMESTAMP_FOR_STATUS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.CONFIRMED]: 'confirmedAt',
  [OrderStatus.READY]: 'readyAt',
  [OrderStatus.COMPLETED]: 'completedAt',
  [OrderStatus.CANCELLED]: 'cancelledAt',
}

/**
 * Moves an order, or refuses.
 *
 * The update is conditional on the current status, so it is safe under
 * concurrency: whichever request arrives second matches nothing and is told the
 * order has already moved, instead of overwriting the first.
 */
/**
 * Terminal states where the food was never served, so its portions return to
 * stock. `COMPLETED` is deliberately absent — that order was eaten.
 */
const RESTOCKING_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.EXPIRED,
])

export async function transitionOrder(
  id: string,
  to: OrderStatus,
  options: { reason?: string; expectedCurrentStatus?: string } = {},
): Promise<OrderView> {
  const context = requireContext()
  const actor = context.actorRole ?? 'SYSTEM'

  const repo = tenantRepo(OrderModel)
  const order = await repo.findById(id)
  if (!order) throw notFound('Order not found')

  if (options.expectedCurrentStatus && options.expectedCurrentStatus !== order.status) {
    throw conflict(`This order has already moved to ${order.status}`)
  }

  const from = order.status as OrderStatus
  const check = checkTransition(from, to, actor)

  if (!check.allowed) {
    switch (check.reason) {
      case 'terminal':
        throw conflict(`This order is ${from} and can no longer be changed`)
      case 'role-not-permitted':
        throw forbidden(`Your role cannot move an order from ${from} to ${to}`)
      case 'same-status':
        throw conflict(`This order is already ${from}`)
      default:
        throw badRequest(`An order cannot go from ${from} to ${to}`)
    }
  }

  const now = new Date()
  const set: Record<string, unknown> = { status: to }
  const timestampField = TIMESTAMP_FOR_STATUS[to]
  if (timestampField) set[timestampField] = now

  // Confirming a cash order is the moment the money is recognised.
  if (to === OrderStatus.CONFIRMED && order.paymentMethod === PaymentMethod.CASH) {
    set.paymentStatus = PaymentStatus.PAID
  }

  // The `status: from` clause is the concurrency guard. Losing this line would
  // let two clicks both apply.
  const updated = await repo.findOneAndUpdate(
    { _id: order._id, status: from },
    {
      $set: set,
      $push: {
        statusHistory: {
          from,
          to,
          byUserId: context.actorUserId,
          byRole: actor,
          at: now,
          reason: options.reason,
        },
      },
    },
  )

  if (!updated) throw conflict('This order was changed by someone else. Refresh and try again.')

  // Food that will never be cooked goes back on the shelf. Deliberately not
  // COMPLETED — that order was served, and its portions are genuinely gone.
  //
  // This runs *after* the conditional update, so it happens exactly once: two
  // simultaneous cancellations produce one winner, and only the winner restocks.
  if (RESTOCKING_STATUSES.has(to)) {
    await releaseStock(claimsFromOrder(order))
  }

  await writeAudit({
    action:
      to === OrderStatus.CONFIRMED && order.paymentMethod === PaymentMethod.CASH
        ? AuditAction.CASH_CONFIRMED
        : AuditAction.ORDER_STATUS_CHANGED,
    targetType: 'Order',
    targetId: order._id.toString(),
    metadata: {
      orderNumber: order.orderNumber,
      from,
      to,
      reason: options.reason,
      ...(to === OrderStatus.CONFIRMED
        ? { grandTotalHalalas: order.totals?.grandTotalHalalas }
        : {}),
    },
  })

  try {
    // Need restaurantId from order. Let's cast it or retrieve it from context
    const restaurantId = requireTenantId()
    getIO().to(`restaurant_${restaurantId}`).to(`order_${order.publicId}`).emit('order_updated')
  } catch (err) {
    logger.warn({ err }, 'failed to emit order_updated')
  }

  return toOrderView(updated, true)
}

/**
 * Cash confirmation.
 *
 * A thin, explicit wrapper over the transition so the audit trail and the
 * cashier's screen both have a single obvious action, rather than a generic
 * status change that happens to mean "money received".
 */
export async function confirmCashPayment(id: string): Promise<OrderView> {
  const repo = tenantRepo(OrderModel)
  const order = await repo.findById(id)
  if (!order) throw notFound('Order not found')

  if (order.paymentMethod !== PaymentMethod.CASH) {
    throw badRequest('This is not a cash order')
  }
  if (order.paymentStatus === PaymentStatus.PAID) {
    // Idempotent from the cashier's point of view: a double-click reports the
    // truth rather than double-recording a payment.
    throw conflict('This order is already paid')
  }

  // If the order was held waiting for cash, transition it forward.
  if (order.status === OrderStatus.CASH_PENDING) {
    return transitionOrder(id, OrderStatus.CONFIRMED, { reason: 'cash received' })
  }

  // Otherwise, the kitchen already started (kitchenStartsBeforePayment = true).
  // Just record the payment without changing the order status.
  const updated = await repo.findOneAndUpdate(
    { _id: order._id, paymentStatus: order.paymentStatus },
    { $set: { paymentStatus: PaymentStatus.PAID } },
    { new: true }
  )
  
  if (!updated) {
    throw conflict('This order was changed by someone else. Refresh and try again.')
  }
  
  try {
    const { getIO } = await import('../../core/socket.js')
    getIO().to(`restaurant_${updated.restaurantId}`).emit('order_updated')
  } catch (err) {}
  
  return toOrderView(updated)
}

/**
 * Customer cancellation, allowed for a short window after placing.
 *
 * Beyond that the restaurant may already have started work, so cancelling
 * becomes a staff decision about waste rather than a customer's right.
 */
export async function cancelOwnOrder(publicId: string): Promise<CustomerOrderView> {
  const context = requireContext()
  const sessionId = context.tableSessionId
  if (!sessionId) throw notFound('Order not found')

  const order = await tenantRepo(OrderModel).findOne({ publicId, tableSessionId: sessionId })
  if (!order) throw notFound('Order not found')

  if (isTerminal(order.status as OrderStatus)) {
    throw conflict(`This order is ${order.status} and can no longer be changed`)
  }

  const ageSeconds = (Date.now() - order.placedAt.getTime()) / 1000
  if (ageSeconds > env.ORDER_CANCEL_WINDOW_SECONDS) {
    throw conflict(
      'This order can no longer be cancelled from your phone. Please speak to a member of staff.',
    )
  }

  // Borrow the customer actor for the transition check, so the same table
  // governs staff and customers alike.
  context.actorRole = 'CUSTOMER'

  const updated = await transitionOrder(order._id.toString(), OrderStatus.CANCELLED, {
    reason: 'cancelled by customer',
  })

  // Strip the internal id and the staff-facing history before it goes back to
  // the phone — `transitionOrder` returns the full staff view.
  const { id: _internalId, statusHistory: _history, ...customerSafe } = updated
  return customerSafe
}

export async function toggleRush(publicId: string, isRush: boolean) {
  const tenantId = requireTenantId()
  const updated = await tenantRepo(OrderModel).findOneAndUpdate(
    { publicId },
    { $set: { isRush } },
    { new: true }
  )

  if (!updated) throw notFound('Order not found')

  try {
    getIO().to(`restaurant_${tenantId}`).emit('order_updated')
  } catch (err) {
    logger.warn({ err }, 'failed to emit order_updated')
  }

  return toOrderView(updated)
}

export async function refundOrder(publicId: string) {
  const tenantId = requireTenantId()
  const order = await tenantRepo(OrderModel).findOne({ publicId })
  if (!order) throw notFound('Order not found')

  if (order.paymentStatus !== PaymentStatus.PAID) {
    throw badRequest('Order is not paid, cannot refund')
  }

  const updated = await tenantRepo(OrderModel).findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      $push: {
        statusHistory: {
          from: order.status,
          to: OrderStatus.CANCELLED,
          byUserId: getContext()?.actorUserId,
          byRole: getContext()?.actorRole,
          at: new Date(),
          reason: 'Manual refund via staff API',
        },
      },
    },
    { new: true }
  )

  if (!updated) throw notFound('Order not found')

  getIO().to(`restaurant_${tenantId}`).emit('order_updated', { publicId: updated.publicId })

  return toOrderView(updated)
}
