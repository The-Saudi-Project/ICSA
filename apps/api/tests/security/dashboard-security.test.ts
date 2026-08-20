/**
 * Dashboard counters, and the chain/branch boundary underneath them.
 *
 * Two separate concerns share this file because they meet in the same place:
 *
 *  1. The dashboard is the first feature that aggregates rather than lists, so
 *     it is the first place a tenant filter could quietly stop filtering and
 *     still look plausible. A number is much harder to eyeball than a list.
 *
 *  2. `Restaurant.type` now has SINGLE | CHAIN_MAIN | BRANCH with a `parentId`.
 *     A branch is a full tenant of its own; `parentId` is a commercial label,
 *     not a scope. These tests exist to make that permanent — if someone later
 *     "helpfully" rolls a chain's branches up into the parent's dashboard, this
 *     file fails.
 */

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RestaurantType,
  Role,
  UserStatus,
} from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { OrderModel } from '../../src/modules/orders/order.model.js'
import { startOfBusinessDay } from '../../src/modules/orders/counter.model.js'
import { RestaurantModel, type RestaurantDoc } from '../../src/modules/restaurants/restaurant.model.js'
import { UserModel } from '../../src/modules/users/user.model.js'
import { makeTenant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

let orderSeq = 0

/**
 * Writes an order straight to the collection. Going through the public ordering
 * flow would need a menu, a table and a session per tenant, which would make
 * these tests about ordering rather than about scoping.
 */
async function makeOrder(options: {
  restaurant: RestaurantDoc
  status?: string
  grandTotalHalalas?: number
  placedAt?: Date
}) {
  const total = options.grandTotalHalalas ?? 10_00
  orderSeq += 1

  return OrderModel.create({
    restaurantId: options.restaurant._id,
    orderNumber: String(orderSeq).padStart(3, '0'),
    idempotencyKey: `test-${orderSeq}-${Math.random().toString(36).slice(2)}`,
    status: options.status ?? OrderStatus.COMPLETED,
    paymentMethod: PaymentMethod.CASH,
    paymentStatus: PaymentStatus.PAID,
    items: [
      {
        menuItemId: options.restaurant._id,
        nameSnapshot: { en: 'Test item' },
        unitPriceHalalas: total,
        vatRatePercentSnapshot: 15,
        quantity: 1,
        lineSubtotalHalalas: total,
        lineVatHalalas: 0,
        lineTotalHalalas: total,
      },
    ],
    totals: {
      subtotalHalalas: total,
      vatHalalas: 0,
      serviceChargeHalalas: 0,
      grandTotalHalalas: total,
    },
    vatRateSnapshotPercent: 15,
    pricesIncludeVatSnapshot: true,
    currencySnapshot: 'SAR',
    placedAt: options.placedAt ?? new Date(),
  })
}

const statsFor = async (email: string) => {
  const session = await loginAs(email)
  return request(app).get('/api/v1/app/dashboard/stats').set(auth(session))
}

describe('the restaurant dashboard counts this tenant and no other', () => {
  it('counts its own orders and revenue', async () => {
    const a = await makeTenant()
    await makeOrder({ restaurant: a.restaurant, grandTotalHalalas: 4500 })
    await makeOrder({ restaurant: a.restaurant, grandTotalHalalas: 2500 })

    const res = await statsFor(a.owner.email)
    if (res.status !== 200) console.log(res.body);
    expect(res.status).toBe(200)
    expect(res.body.todayOrdersCount).toBe(2)
    expect(res.body.todayRevenueHalalas).toBe(7000)
  })

  /**
   * The regression that prompted this file. `sanitizeFilter` is on globally, so
   * an unwrapped `{ $gte: date }` becomes `{ $eq: { $gte: date } }` and matches
   * nothing at all. Every counter then reads zero, which looks like a quiet
   * restaurant rather than a broken query. The assertion above would catch it,
   * but this one names the cause.
   */
  it('does not silently return zero because the date operator was swallowed', async () => {
    const a = await makeTenant()
    await makeOrder({ restaurant: a.restaurant, grandTotalHalalas: 1234 })

    const res = await statsFor(a.owner.email)

    expect(res.body.todayOrdersCount).toBeGreaterThan(0)
    expect(res.body.todayRevenueHalalas).toBe(1234)
  })

  it('excludes orders from before the business day began', async () => {
    const a = await makeTenant()
    const yesterday = new Date(startOfBusinessDay().getTime() - 60 * 60 * 1000)

    await makeOrder({ restaurant: a.restaurant, grandTotalHalalas: 9999, placedAt: yesterday })
    await makeOrder({ restaurant: a.restaurant, grandTotalHalalas: 100 })

    const res = await statsFor(a.owner.email)

    expect(res.body.todayOrdersCount).toBe(1)
    expect(res.body.todayRevenueHalalas).toBe(100)
  })

  it('counts only completed orders as revenue, but all of today as orders', async () => {
    const a = await makeTenant()
    await makeOrder({ restaurant: a.restaurant, status: OrderStatus.COMPLETED, grandTotalHalalas: 500 })
    await makeOrder({ restaurant: a.restaurant, status: OrderStatus.PLACED, grandTotalHalalas: 700 })

    const res = await statsFor(a.owner.email)

    expect(res.body.todayOrdersCount).toBe(2)
    expect(res.body.todayRevenueHalalas).toBe(500)
    expect(res.body.activeOrders).toBe(1)
  })

  it('never counts another restaurant’s orders or staff', async () => {
    const a = await makeTenant()
    const b = await makeTenant()

    await makeOrder({ restaurant: a.restaurant, grandTotalHalalas: 100 })
    for (let i = 0; i < 5; i++) {
      await makeOrder({ restaurant: b.restaurant, grandTotalHalalas: 10_000 })
    }

    const res = await statsFor(a.owner.email)

    expect(res.body.todayOrdersCount).toBe(1)
    expect(res.body.todayRevenueHalalas).toBe(100)
    // makeTenant creates exactly three users: owner, cashier, kitchen.
    expect(res.body.staffCount).toBe(3)
  })
})

describe('a branch is isolated from its chain and from its siblings', () => {
  async function makeChain() {
    const chain = await makeTenant()
    await RestaurantModel.updateOne(
      { _id: chain.restaurant._id },
      { $set: { type: RestaurantType.CHAIN_MAIN } },
    )

    const branchOne = await makeTenant()
    const branchTwo = await makeTenant()
    await RestaurantModel.updateOne(
      { _id: branchOne.restaurant._id },
      { $set: { type: RestaurantType.BRANCH, parentId: chain.restaurant._id } },
    )
    await RestaurantModel.updateOne(
      { _id: branchTwo.restaurant._id },
      { $set: { type: RestaurantType.BRANCH, parentId: chain.restaurant._id } },
    )

    return { chain, branchOne, branchTwo }
  }

  it('does not roll a branch’s takings up into the chain’s dashboard', async () => {
    const { chain, branchOne } = await makeChain()

    await makeOrder({ restaurant: branchOne.restaurant, grandTotalHalalas: 50_000 })

    const res = await statsFor(chain.owner.email)

    expect(res.body.todayOrdersCount).toBe(0)
    expect(res.body.todayRevenueHalalas).toBe(0)
  })

  it('does not leak the chain’s takings down into a branch’s dashboard', async () => {
    const { chain, branchOne } = await makeChain()

    await makeOrder({ restaurant: chain.restaurant, grandTotalHalalas: 50_000 })

    const res = await statsFor(branchOne.owner.email)

    expect(res.body.todayOrdersCount).toBe(0)
    expect(res.body.todayRevenueHalalas).toBe(0)
  })

  it('keeps sibling branches apart', async () => {
    const { branchOne, branchTwo } = await makeChain()

    await makeOrder({ restaurant: branchOne.restaurant, grandTotalHalalas: 111 })
    await makeOrder({ restaurant: branchTwo.restaurant, grandTotalHalalas: 222 })

    const one = await statsFor(branchOne.owner.email)
    const two = await statsFor(branchTwo.owner.email)

    expect(one.body.todayRevenueHalalas).toBe(111)
    expect(two.body.todayRevenueHalalas).toBe(222)
  })

  it('gives a chain owner 404, not 403, on a branch’s order', async () => {
    const { chain, branchOne } = await makeChain()
    const branchOrder = await makeOrder({ restaurant: branchOne.restaurant })

    const session = await loginAs(chain.owner.email)
    const real = await request(app)
      .get(`/api/v1/app/orders/${branchOrder._id.toString()}`)
      .set(auth(session))

    // Identical to a wholly imaginary id — the chain cannot even learn that the
    // branch's order exists.
    const imaginary = await request(app)
      .get('/api/v1/app/orders/000000000000000000000000')
      .set(auth(session))

    expect(real.status).toBe(404)
    // `requestId` differs per request by design, so compare everything else.
    expect(real.body.error.code).toBe(imaginary.body.error.code)
    expect(real.body.error.message).toBe(imaginary.body.error.message)
  })
})

describe('chain and branch creation rules', () => {
  const PLATFORM_EMAIL = 'platform@dash.test'

  async function platformSession() {
    await makeUser({ role: Role.PLATFORM_ADMIN, email: PLATFORM_EMAIL, restaurant: null })
    return loginAs(PLATFORM_EMAIL)
  }

  const payload = (extra: Record<string, unknown> = {}) => ({
    name: { en: 'Branch Kitchen' },
    slug: `branch-${Math.random().toString(36).slice(2, 8)}`,
    owner: { email: `o-${Math.random().toString(36).slice(2, 8)}@x.test`, name: 'Owner' },
    ...extra,
  })

  it('refuses a branch with no parent', async () => {
    const session = await platformSession()

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload({ type: RestaurantType.BRANCH }))

    expect(res.status).toBe(409)
  })

  it('refuses a branch whose parent is not a chain', async () => {
    const session = await platformSession()
    const single = await makeTenant()

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload({ type: RestaurantType.BRANCH, parentId: single.restaurant._id.toString() }))

    expect(res.status).toBe(409)
  })

  it('refuses a branch under another branch, so the hierarchy stays one deep', async () => {
    const session = await platformSession()

    const chain = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload({ type: RestaurantType.CHAIN_MAIN }))
    expect(chain.status).toBe(201)

    const branch = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload({ type: RestaurantType.BRANCH, parentId: chain.body.restaurant.id }))
    expect(branch.status).toBe(201)

    const grandchild = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload({ type: RestaurantType.BRANCH, parentId: branch.body.restaurant.id }))

    expect(grandchild.status).toBe(409)
  })

  /**
   * A PLATFORM_ADMIN has no `restaurantId`. The User model enforces that in a
   * `pre('validate')` hook — but a document hook does not run on
   * `findOneAndUpdate`, so the update route below could have written the role
   * onto a user that still belongs to a restaurant. Only a platform admin can
   * reach these routes, so this is not an escalation; it is the invariant every
   * tenant check depends on, and a malformed account here is how a cross-tenant
   * leak starts.
   */
  it('refuses to create a PLATFORM_ADMIN inside a restaurant', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    const res = await request(app)
      .post(`/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff`)
      .set(auth(session))
      .send({ name: 'Sneaky', email: 'sneaky@x.test', role: Role.PLATFORM_ADMIN })

    // 422 is this project's validation-failure code; see middleware/validate.ts.
    expect(res.status).toBe(422)
  })

  it('refuses to promote a restaurant user to PLATFORM_ADMIN', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    const res = await request(app)
      .patch(
        `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`,
      )
      .set(auth(session))
      .send({ role: Role.PLATFORM_ADMIN })

    // 422 is this project's validation-failure code; see middleware/validate.ts.
    expect(res.status).toBe(422)

    const unchanged = await UserModel.findById(tenant.cashier._id)
    expect(unchanged?.role).toBe(Role.CASHIER)
    expect(unchanged?.restaurantId?.toString()).toBe(tenant.restaurant._id.toString())
  })

  it('still allows an ordinary role change', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    const res = await request(app)
      .patch(
        `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`,
      )
      .set(auth(session))
      .send({ role: Role.MANAGER })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe(Role.MANAGER)
  })

  /**
   * "Remove from the team" is a disable, not a row deletion. Two things have to
   * be true at once, and the original hard delete got both wrong: the account
   * must stop working *now*, and it must still exist afterwards so the
   * append-only audit log keeps resolving to a real person.
   */
  it('disables a staff member rather than deleting them', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    const res = await request(app)
      .delete(
        `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`,
      )
      .set(auth(session))

    expect(res.status).toBe(200)
    expect(res.body.user.status).toBe(UserStatus.DISABLED)

    const stillThere = await UserModel.findById(tenant.cashier._id)
    expect(stillThere).not.toBeNull()
    expect(stillThere?.status).toBe(UserStatus.DISABLED)
    expect(stillThere?.email).toBe(tenant.cashier.email)
  })

  it('ends the disabled person’s sessions immediately', async () => {
    const tenant = await makeTenant()
    // Sign in first, so there is a live access token and refresh cookie to kill.
    const victim = await loginAs(tenant.cashier.email)

    const before = await request(app).get('/api/v1/auth/me').set(auth(victim))
    expect(before.status).toBe(200)

    const session = await platformSession()
    await request(app)
      .delete(
        `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`,
      )
      .set(auth(session))
      .expect(200)

    // The access token dies on the tokenVersion check, not fifteen minutes later.
    const after = await request(app).get('/api/v1/auth/me').set(auth(victim))
    expect(after.status).toBe(401)

    // And the refresh cookie cannot mint a new one.
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', victim.cookies)
    expect(refreshed.status).toBe(401)
  })

  it('writes an audit event whose actor and target both still resolve', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    await request(app)
      .delete(
        `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`,
      )
      .set(auth(session))
      .expect(200)

    const event = await AuditLogModel.findOne({
      action: AuditAction.STAFF_DISABLED,
      targetId: tenant.cashier._id.toString(),
    })
    expect(event).not.toBeNull()

    // The point of the whole change: the id in the log is not dangling.
    const target = await UserModel.findById(event!.targetId)
    expect(target).not.toBeNull()
  })

  it('re-enables through PATCH, and the person can sign in again', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()
    const staffPath = `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`

    await request(app).delete(staffPath).set(auth(session)).expect(200)
    await expect(loginAs(tenant.cashier.email)).rejects.toThrow()

    const res = await request(app)
      .patch(staffPath)
      .set(auth(session))
      .send({ status: UserStatus.ACTIVE })

    expect(res.status).toBe(200)
    expect(res.body.user.status).toBe(UserStatus.ACTIVE)
    await expect(loginAs(tenant.cashier.email)).resolves.toBeDefined()
  })

  it('does not audit a role change when only the name was edited', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    await request(app)
      .patch(
        `/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/staff/${tenant.cashier._id.toString()}`,
      )
      .set(auth(session))
      .send({ name: 'Renamed Only' })
      .expect(200)

    const roleEvents = await AuditLogModel.countDocuments({
      action: AuditAction.STAFF_ROLE_CHANGED,
      targetId: tenant.cashier._id.toString(),
    })
    expect(roleEvents).toBe(0)
  })

  it('discards a parentId on a restaurant that is not a branch', async () => {
    const session = await platformSession()
    const chain = await makeTenant()

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload({ type: RestaurantType.SINGLE, parentId: chain.restaurant._id.toString() }))

    expect(res.status).toBe(201)

    const created = await RestaurantModel.findById(res.body.restaurant.id).setOptions({
      unscoped: true,
    })
    expect(created?.parentId ?? null).toBeNull()
  })
})

describe('dashboard access is closed to the wrong roles', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/v1/app/dashboard/stats')
    expect(res.status).toBe(401)
  })

  it('rejects a cashier and a kitchen user', async () => {
    const tenant = await makeTenant()

    for (const email of [tenant.cashier.email, tenant.kitchen.email]) {
      const res = await statsFor(email)
      expect(res.status, `as ${email}`).toBe(403)
    }
  })

  it('keeps the platform dashboard away from every restaurant role', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.owner.email)

    const res = await request(app).get('/api/v1/platform/dashboard/stats').set(auth(session))
    expect(res.status).toBe(403)
  })

  it('lets a platform admin see totals across every tenant', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await makeOrder({ restaurant: a.restaurant })
    await makeOrder({ restaurant: b.restaurant })

    await makeUser({ role: Role.PLATFORM_ADMIN, email: 'platform-totals@dash.test', restaurant: null })
    const session = await loginAs('platform-totals@dash.test')

    const res = await request(app).get('/api/v1/platform/dashboard/stats').set(auth(session))

    expect(res.status).toBe(200)
    expect(res.body.totalRestaurants).toBe(2)
    expect(res.body.todayPlatformOrders).toBe(2)
  })
})
