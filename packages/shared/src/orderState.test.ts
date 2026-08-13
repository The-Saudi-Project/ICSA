import { describe, expect, it } from 'vitest'
import { Role } from './enums.js'
import {
  Actor,
  allowedNextStatuses,
  checkTransition,
  isTerminal,
  ORDER_TRANSITIONS,
  OrderStatus,
  TERMINAL_STATUSES,
} from './orderState.js'

describe('terminal states', () => {
  it('are frozen — no transition table entry, and none may be added', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true)
      expect(Object.keys(ORDER_TRANSITIONS[status])).toHaveLength(0)
    }
  })

  it('reject every attempted move, from every actor', () => {
    const everyActor = Object.values(Actor)

    for (const from of TERMINAL_STATUSES) {
      for (const to of Object.values(OrderStatus)) {
        for (const actor of everyActor) {
          const result = checkTransition(from, to, actor)
          expect(result.allowed, `${from} -> ${to} as ${actor}`).toBe(false)
        }
      }
    }
  })
})

describe('the happy path', () => {
  it('walks cash order -> confirmed -> kitchen -> ready -> completed', () => {
    expect(checkTransition(OrderStatus.PLACED, OrderStatus.CASH_PENDING, Actor.SYSTEM).allowed).toBe(
      true,
    )
    expect(
      checkTransition(OrderStatus.CASH_PENDING, OrderStatus.CONFIRMED, Role.CASHIER).allowed,
    ).toBe(true)
    expect(
      checkTransition(OrderStatus.CONFIRMED, OrderStatus.KITCHEN_ACCEPTED, Role.KITCHEN).allowed,
    ).toBe(true)
    expect(
      checkTransition(OrderStatus.KITCHEN_ACCEPTED, OrderStatus.PREPARING, Role.KITCHEN).allowed,
    ).toBe(true)
    expect(checkTransition(OrderStatus.PREPARING, OrderStatus.READY, Role.KITCHEN).allowed).toBe(
      true,
    )
    expect(checkTransition(OrderStatus.READY, OrderStatus.COMPLETED, Role.WAITER).allowed).toBe(true)
  })
})

describe('role restrictions', () => {
  it('Sec-09 — a customer cannot confirm payment on their own order', () => {
    const result = checkTransition(OrderStatus.CASH_PENDING, OrderStatus.CONFIRMED, Actor.CUSTOMER)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('role-not-permitted')
  })

  it('Sec-08 — kitchen staff cannot confirm a cash payment', () => {
    expect(
      checkTransition(OrderStatus.CASH_PENDING, OrderStatus.CONFIRMED, Role.KITCHEN).allowed,
    ).toBe(false)
  })

  it('a cashier cannot mark food ready — only the kitchen can', () => {
    expect(checkTransition(OrderStatus.PREPARING, OrderStatus.READY, Role.CASHIER).allowed).toBe(
      false,
    )
  })

  it('a customer cannot cancel once the order is confirmed and paid', () => {
    expect(checkTransition(OrderStatus.PLACED, OrderStatus.CANCELLED, Actor.CUSTOMER).allowed).toBe(
      true,
    )
    expect(
      checkTransition(OrderStatus.CASH_PENDING, OrderStatus.CANCELLED, Actor.CUSTOMER).allowed,
    ).toBe(true)
    expect(
      checkTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED, Actor.CUSTOMER).allowed,
    ).toBe(false)
  })

  it('a platform admin has no role in a restaurant’s order flow', () => {
    for (const [from, moves] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of Object.keys(moves)) {
        expect(
          checkTransition(from as OrderStatus, to as OrderStatus, Role.PLATFORM_ADMIN).allowed,
          `${from} -> ${to}`,
        ).toBe(false)
      }
    }
  })
})

describe('illegal moves', () => {
  it('cannot skip the kitchen entirely', () => {
    expect(checkTransition(OrderStatus.PLACED, OrderStatus.COMPLETED, Role.OWNER).allowed).toBe(
      false,
    )
    expect(checkTransition(OrderStatus.CONFIRMED, OrderStatus.READY, Role.KITCHEN).allowed).toBe(
      false,
    )
  })

  it('cannot move backwards', () => {
    expect(checkTransition(OrderStatus.READY, OrderStatus.PREPARING, Role.KITCHEN).allowed).toBe(
      false,
    )
    expect(checkTransition(OrderStatus.CONFIRMED, OrderStatus.PLACED, Role.OWNER).allowed).toBe(
      false,
    )
  })

  it('reports a move to the same status rather than silently allowing it', () => {
    const result = checkTransition(OrderStatus.PREPARING, OrderStatus.PREPARING, Role.KITCHEN)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('same-status')
  })
})

describe('allowedNextStatuses', () => {
  it('tells each role only what it may actually do', () => {
    expect(allowedNextStatuses(OrderStatus.CASH_PENDING, Role.CASHIER).sort()).toEqual(
      [OrderStatus.CANCELLED, OrderStatus.CONFIRMED, OrderStatus.REJECTED].sort(),
    )
    expect(allowedNextStatuses(OrderStatus.CASH_PENDING, Role.KITCHEN)).toEqual([])
    expect(allowedNextStatuses(OrderStatus.COMPLETED, Role.OWNER)).toEqual([])
  })
})
