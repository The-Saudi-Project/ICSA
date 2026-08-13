/**
 * The order state machine.
 *
 * This is a *table*, not a set of `if` statements, and it is the only thing
 * that decides whether an order may move. Two properties matter:
 *
 *  1. Every legal move is listed here, with the roles allowed to make it. A
 *     move that is not in the table cannot happen, so there is no free-form
 *     `status` field anywhere in the API.
 *  2. Terminal states have no outgoing moves at all. A completed or cancelled
 *     order is frozen — its items, totals and status can never change again,
 *     which is what makes an order a trustworthy financial record.
 *
 * Shared between the API and the web app so a screen can grey out a button the
 * server would reject, rather than discovering it by failing.
 */

import { Role } from './enums.js'

export const OrderStatus = {
  /** Placed by the customer. Nothing has been decided about payment yet. */
  PLACED: 'PLACED',
  /** Cash order waiting for a cashier to confirm the money was handed over. */
  CASH_PENDING: 'CASH_PENDING',
  /** Payment settled (or the restaurant cooks first). The kitchen may take it. */
  CONFIRMED: 'CONFIRMED',
  KITCHEN_ACCEPTED: 'KITCHEN_ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const PaymentStatus = {
  UNPAID: 'UNPAID',
  CASH_PENDING: 'CASH_PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED', // Phase 2
  REFUNDED: 'REFUNDED', // Phase 2
} as const
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]

/** Who is asking. Customers and the system are actors too, not just staff. */
export const Actor = {
  CUSTOMER: 'CUSTOMER',
  SYSTEM: 'SYSTEM',
  ...Role,
} as const
export type Actor = (typeof Actor)[keyof typeof Actor]

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.EXPIRED,
]

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * from -> to -> who may do it.
 *
 * Read a row as "an order in this state may move to these states, and only
 * these actors may move it".
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, Readonly<Partial<Record<OrderStatus, readonly Actor[]>>>>
> = {
  [OrderStatus.PLACED]: {
    // The system routes a new order according to payment method and the
    // restaurant's "cook before payment" setting. Staff never do this by hand.
    [OrderStatus.CASH_PENDING]: [Actor.SYSTEM],
    [OrderStatus.CONFIRMED]: [Actor.SYSTEM],
    [OrderStatus.REJECTED]: [Actor.CASHIER, Actor.MANAGER, Actor.OWNER],
    [OrderStatus.CANCELLED]: [Actor.CUSTOMER, Actor.CASHIER, Actor.MANAGER, Actor.OWNER],
    [OrderStatus.EXPIRED]: [Actor.SYSTEM],
  },
  [OrderStatus.CASH_PENDING]: {
    // Only a cashier (or above) can say the cash arrived. This is the single
    // most money-relevant action in Phase 1 and is always audited.
    [OrderStatus.CONFIRMED]: [Actor.CASHIER, Actor.MANAGER, Actor.OWNER],
    [OrderStatus.CANCELLED]: [Actor.CUSTOMER, Actor.CASHIER, Actor.MANAGER, Actor.OWNER],
    [OrderStatus.REJECTED]: [Actor.CASHIER, Actor.MANAGER, Actor.OWNER],
    [OrderStatus.EXPIRED]: [Actor.SYSTEM],
  },
  [OrderStatus.CONFIRMED]: {
    [OrderStatus.KITCHEN_ACCEPTED]: [Actor.KITCHEN, Actor.MANAGER, Actor.OWNER],
    // Once money has changed hands a customer can no longer cancel unilaterally.
    [OrderStatus.CANCELLED]: [Actor.MANAGER, Actor.OWNER],
  },
  [OrderStatus.KITCHEN_ACCEPTED]: {
    [OrderStatus.PREPARING]: [Actor.KITCHEN, Actor.MANAGER, Actor.OWNER],
    [OrderStatus.CANCELLED]: [Actor.MANAGER, Actor.OWNER],
  },
  [OrderStatus.PREPARING]: {
    [OrderStatus.READY]: [Actor.KITCHEN, Actor.MANAGER, Actor.OWNER],
    // Food is being cooked. Cancelling now is a manager's decision about waste.
    [OrderStatus.CANCELLED]: [Actor.MANAGER, Actor.OWNER],
  },
  [OrderStatus.READY]: {
    [OrderStatus.COMPLETED]: [Actor.WAITER, Actor.CASHIER, Actor.MANAGER, Actor.OWNER],
  },
  // Terminal. Deliberately empty — do not add moves out of these.
  [OrderStatus.COMPLETED]: {},
  [OrderStatus.CANCELLED]: {},
  [OrderStatus.REJECTED]: {},
  [OrderStatus.EXPIRED]: {},
}

export interface TransitionCheck {
  allowed: boolean
  reason?: 'terminal' | 'illegal-transition' | 'role-not-permitted' | 'same-status'
}

export function checkTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: string,
): TransitionCheck {
  if (from === to) return { allowed: false, reason: 'same-status' }
  if (isTerminal(from)) return { allowed: false, reason: 'terminal' }

  const allowedActors = ORDER_TRANSITIONS[from]?.[to]
  if (!allowedActors) return { allowed: false, reason: 'illegal-transition' }
  if (!allowedActors.includes(actor as Actor)) {
    return { allowed: false, reason: 'role-not-permitted' }
  }

  return { allowed: true }
}

/** What a given actor could do next. Used to decide which buttons to show. */
export function allowedNextStatuses(from: OrderStatus, actor: string): OrderStatus[] {
  return (Object.entries(ORDER_TRANSITIONS[from] ?? {}) as Array<[OrderStatus, readonly Actor[]]>)
    .filter(([, actors]) => actors.includes(actor as Actor))
    .map(([to]) => to)
}

/** Statuses a kitchen screen shows: everything live, nothing settled. */
export const KITCHEN_BOARD_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.KITCHEN_ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
]

/** Statuses a cashier screen shows: anything needing a decision or handover. */
export const CASHIER_BOARD_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.CASH_PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.KITCHEN_ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
]
