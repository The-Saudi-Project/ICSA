import { z } from 'zod'
import { PaymentMethod } from '../enums.js'
import { OrderStatus } from '../orderState.js'
import { objectIdSchema } from './common.js'

/**
 * What a customer's phone sends when placing an order.
 *
 * Note what is NOT here, and never will be:
 *
 *   - no `tableId`      — read from the table session
 *   - no `restaurantId` — read from the table session
 *   - no prices         — recomputed server-side from the database
 *   - no totals         — recomputed server-side
 *   - no status         — decided by the state machine
 *
 * The client says which items and how many. Everything with a consequence is
 * decided by the server. There is nothing here worth tampering with.
 */

export const orderModifierSelectionSchema = z.object({
  groupKey: z.string().trim().min(1).max(40),
  optionKey: z.string().trim().min(1).max(40),
})

export const orderLineSchema = z.object({
  menuItemId: objectIdSchema,
  quantity: z.number().int().min(1).max(50),
  modifiers: z.array(orderModifierSelectionSchema).max(30).default([]),
  note: z.string().trim().max(200).optional(),
})

export const createOrderSchema = z.object({
  items: z.array(orderLineSchema).min(1).max(50),
  // Cash only in Phase 1. Card arrives with the payment provider in Phase 2.
  paymentMethod: z.enum([PaymentMethod.CASH]).default(PaymentMethod.CASH),
  customerNote: z.string().trim().max(500).optional(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+9665\d{8}$/, 'must be a Saudi mobile number in +9665XXXXXXXX form')
    .optional(),
})
export type CreateOrderInput = z.infer<typeof createOrderSchema>

/**
 * The only way an order's status changes.
 *
 * There is no `PATCH /orders/:id` accepting a status field. Every move goes
 * through this, and is checked against the transition table with the caller's
 * role.
 */
export const transitionOrderSchema = z.object({
  to: z.enum([
    OrderStatus.CONFIRMED,
    OrderStatus.KITCHEN_ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.REJECTED,
  ]),
  reason: z.string().trim().max(300).optional(),
  /**
   * The status the caller believes the order is in. When supplied, the update
   * only applies if that is still true — so two people acting on a stale screen
   * cannot both succeed.
   */
  expectedCurrentStatus: z.string().trim().max(30).optional(),
})
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>

/**
 * An idempotency key, supplied by the client on order creation.
 *
 * A phone on a poor connection retries. Without this, one tap on "Place order"
 * plus one retry is two plates of food and one unhappy restaurant.
 */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'invalid idempotency key')
