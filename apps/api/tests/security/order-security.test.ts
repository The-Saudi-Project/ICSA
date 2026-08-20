/**
 * Order security — the money step.
 *
 * Completes these rows of the mandatory matrix:
 *   Sec-04  a session for one table cannot order against another table
 *   Sec-06  an order id belonging to another tenant is invisible
 *   Sec-09  a customer cannot mark their own order as paid
 *   Ord-01  duplicate submission
 *   Ord-02  invalid item
 *   Ord-03  changed / client-supplied price
 *   Ord-04  unavailable item
 *   Ord-05  invalid status transition and frozen completed orders
 *   Cash-01..03  cashier confirmation, unauthorised confirmation, duplicate confirmation
 */

import { OrderStatus, PaymentStatus, Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { OrderModel } from '../../src/modules/orders/order.model.js'
import { RestaurantModel } from '../../src/modules/restaurants/restaurant.model.js'
import { makeRestaurant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs, type Session } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

let keyCounter = 0
const newKey = () => `idem-${Date.now()}-${(keyCounter += 1)}`

/**
 * A restaurant with an owner, a cashier, a kitchen user, one table with a live
 * customer session, and one menu item priced at 25.00 SAR.
 */
async function makeShop(prefix: string) {
  const restaurant = await makeRestaurant()
  const suffix = Math.random().toString(36).slice(2, 7)

  const ownerEmail = `owner-${prefix}-${suffix}@o.test`
  await makeUser({ restaurant, role: Role.OWNER, email: ownerEmail })
  const owner = await loginAs(ownerEmail)

  const cashierEmail = `cashier-${prefix}-${suffix}@o.test`
  await makeUser({ restaurant, role: Role.CASHIER, email: cashierEmail })
  const cashier = await loginAs(cashierEmail)

  const kitchenEmail = `kitchen-${prefix}-${suffix}@o.test`
  await makeUser({ restaurant, role: Role.KITCHEN, email: kitchenEmail })
  const kitchen = await loginAs(kitchenEmail)

  const category = await request(app)
    .post('/api/v1/app/menu/categories')
    .set(auth(owner))
    .send({ name: { en: `${prefix} Mains` } })

  const item = await request(app)
    .post('/api/v1/app/menu/items')
    .set(auth(owner))
    .send({
      categoryId: category.body.category.id,
      name: { en: `${prefix} Burger` },
      priceHalalas: 2500, // 25.00 SAR, VAT inclusive by default
    })

  const openTable = async (label: string) => {
    const table = await request(app)
      .post('/api/v1/app/tables')
      .set(auth(owner))
      .send({ label })
    const token = String(table.body.table.url).split('/t/')[1]!
    const opened = await request(app)
      .post('/api/v1/public/table-sessions')
      .send({ tableToken: token })
    return {
      id: table.body.table.id as string,
      label,
      sessionToken: opened.body.sessionToken as string,
    }
  }

  const table = await openTable(`${prefix}-1`)

  return {
    restaurant,
    owner,
    cashier,
    kitchen,
    category: category.body.category,
    item: item.body.item,
    table,
    openTable,
  }
}

const asCustomer = (token: string) => ({ Authorization: `Bearer ${token}` })

const placeOrder = (
  sessionToken: string,
  body: Record<string, unknown>,
  key: string = newKey(),
) =>
  request(app)
    .post('/api/v1/public/orders')
    .set(asCustomer(sessionToken))
    .set('Idempotency-Key', key)
    .send(body)

const oneBurger = (itemId: string, quantity = 1) => ({
  items: [{ menuItemId: itemId, quantity }],
  paymentMethod: 'CASH',
})

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('placing an order', () => {
  it('creates the order with server-computed VAT-inclusive totals', async () => {
    const shop = await makeShop('A')

    const res = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id, 2))

    expect(res.status).toBe(201)
    expect(res.body.order.orderNumber).toBe('001')
    expect(res.body.order.status).toBe(OrderStatus.CASH_PENDING)
    expect(res.body.order.tableLabel).toBe('A-1')

    // 2 x 25.00 inclusive of 15% VAT = 50.00 gross -> 43.48 net + 6.52 VAT
    expect(res.body.order.totals.grandTotalHalalas).toBe(5000)
    expect(res.body.order.totals.subtotalHalalas).toBe(4348)
    expect(res.body.order.totals.vatHalalas).toBe(652)
    expect(
      res.body.order.totals.subtotalHalalas + res.body.order.totals.vatHalalas,
    ).toBe(res.body.order.totals.grandTotalHalalas)
  })

  it('numbers orders sequentially per restaurant per day, independently of other restaurants', async () => {
    const a = await makeShop('A')
    const b = await makeShop('B')

    const a1 = await placeOrder(a.table.sessionToken, oneBurger(a.item.id))
    const a2 = await placeOrder(a.table.sessionToken, oneBurger(a.item.id))
    const b1 = await placeOrder(b.table.sessionToken, oneBurger(b.item.id))

    expect(a1.body.order.orderNumber).toBe('001')
    expect(a2.body.order.orderNumber).toBe('002')
    expect(b1.body.order.orderNumber).toBe('001')
  })

  it('gives each order an opaque, non-sequential public id', async () => {
    const shop = await makeShop('A')

    const first = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const second = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))

    expect(first.body.order.publicId).not.toBe(second.body.order.publicId)
    expect(first.body.order.publicId).not.toMatch(/^\d+$/)
    // The internal database id is never exposed to a customer.
    expect(first.body.order.id).toBeUndefined()
  })

  it('stores immutable snapshots, so a later price change cannot alter the bill', async () => {
    const shop = await makeShop('A')

    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const publicId = placed.body.order.publicId

    await request(app)
      .patch(`/api/v1/app/menu/items/${shop.item.id}`)
      .set(auth(shop.owner))
      .send({ priceHalalas: 9900, name: { en: 'Renamed Burger' } })

    const after = await request(app)
      .get(`/api/v1/public/orders/${publicId}`)
      .set(asCustomer(shop.table.sessionToken))

    expect(after.body.order.totals.grandTotalHalalas).toBe(2500)
    expect(after.body.order.items[0].unitPriceHalalas).toBe(2500)
    expect(after.body.order.items[0].nameSnapshot.en).toBe('A Burger')
  })

  it('prices modifiers from the database and validates the selection rules', async () => {
    const shop = await makeShop('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${shop.item.id}`)
      .set(auth(shop.owner))
      .send({
        modifierGroups: [
          {
            key: 'extras',
            name: { en: 'Extras' },
            minSelect: 0,
            maxSelect: 1,
            required: false,
            options: [
              { key: 'cheese', name: { en: 'Extra cheese' }, priceDeltaHalalas: 300 },
              { key: 'bacon', name: { en: 'Bacon' }, priceDeltaHalalas: 500, isAvailable: false },
            ],
          },
        ],
      })

    const ok = await placeOrder(shop.table.sessionToken, {
      items: [
        {
          menuItemId: shop.item.id,
          quantity: 1,
          modifiers: [{ groupKey: 'extras', optionKey: 'cheese' }],
        },
      ],
      paymentMethod: 'CASH',
    })
    expect(ok.status).toBe(201)
    expect(ok.body.order.totals.grandTotalHalalas).toBe(2800) // 25.00 + 3.00

    const soldOut = await placeOrder(shop.table.sessionToken, {
      items: [
        {
          menuItemId: shop.item.id,
          quantity: 1,
          modifiers: [{ groupKey: 'extras', optionKey: 'bacon' }],
        },
      ],
      paymentMethod: 'CASH',
    })
    expect(soldOut.status).toBe(400)

    const unknown = await placeOrder(shop.table.sessionToken, {
      items: [
        {
          menuItemId: shop.item.id,
          quantity: 1,
          modifiers: [{ groupKey: 'extras', optionKey: 'truffle' }],
        },
      ],
      paymentMethod: 'CASH',
    })
    expect(unknown.status).toBe(400)

    const tooMany = await placeOrder(shop.table.sessionToken, {
      items: [
        {
          menuItemId: shop.item.id,
          quantity: 1,
          modifiers: [
            { groupKey: 'extras', optionKey: 'cheese' },
            { groupKey: 'extras', optionKey: 'cheese' },
          ],
        },
      ],
      paymentMethod: 'CASH',
    })
    expect(tooMany.status).toBe(400)
  })

  it('respects a per-item VAT rate over the restaurant default', async () => {
    const shop = await makeShop('A')

    const zeroRated = await request(app)
      .post('/api/v1/app/menu/items')
      .set(auth(shop.owner))
      .send({
        categoryId: shop.category.id,
        name: { en: 'Zero rated' },
        priceHalalas: 1000,
        vatRatePercent: 0,
      })

    const res = await placeOrder(shop.table.sessionToken, oneBurger(zeroRated.body.item.id))

    expect(res.body.order.totals.vatHalalas).toBe(0)
    expect(res.body.order.totals.subtotalHalalas).toBe(1000)
  })

  it('honours the restaurant’s cook-before-payment setting', async () => {
    const shop = await makeShop('A')

    await RestaurantModel.updateOne(
      { _id: shop.restaurant._id },
      { $set: { 'settings.kitchenStartsBeforePayment': true } },
    )

    const res = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    expect(res.body.order.status).toBe(OrderStatus.CONFIRMED)
    expect(res.body.order.paymentStatus).toBe(PaymentStatus.CASH_PENDING)
  })
})

describe('Ord-03 the client cannot influence the price', () => {
  it('ignores prices, totals, status and payment status sent in the body', async () => {
    const shop = await makeShop('A')

    const res = await placeOrder(shop.table.sessionToken, {
      items: [
        {
          menuItemId: shop.item.id,
          quantity: 1,
          priceHalalas: 1,
          unitPriceHalalas: 1,
          lineTotalHalalas: 1,
        },
      ],
      paymentMethod: 'CASH',
      totals: { grandTotalHalalas: 1, subtotalHalalas: 1, vatHalalas: 0 },
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      orderNumber: '999',
    })

    expect(res.status).toBe(201)
    expect(res.body.order.totals.grandTotalHalalas).toBe(2500)
    expect(res.body.order.status).toBe(OrderStatus.CASH_PENDING)
    expect(res.body.order.paymentStatus).toBe(PaymentStatus.CASH_PENDING)
    expect(res.body.order.orderNumber).toBe('001')
  })

  it('rejects a negative or fractional quantity rather than computing with it', async () => {
    const shop = await makeShop('A')

    for (const quantity of [0, -1, 1.5, 999]) {
      const res = await placeOrder(shop.table.sessionToken, {
        items: [{ menuItemId: shop.item.id, quantity }],
        paymentMethod: 'CASH',
      })
      expect(res.status, `quantity ${quantity}`).toBe(422)
    }
  })
})

describe('Ord-02 / Ord-04 invalid and unavailable items', () => {
  it('refuses an item that does not exist, is retired, or is sold out — with the same message', async () => {
    const shop = await makeShop('A')

    const unknown = await placeOrder(shop.table.sessionToken, {
      items: [{ menuItemId: '0'.repeat(24), quantity: 1 }],
      paymentMethod: 'CASH',
    })
    expect(unknown.status).toBe(400)

    await request(app)
      .patch(`/api/v1/app/menu/items/${shop.item.id}`)
      .set(auth(shop.owner))
      .send({ isActive: false })

    const retired = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    expect(retired.status).toBe(400)
    expect(retired.body.error.message).toBe(unknown.body.error.message)
  })

  it('refuses an item another restaurant owns, revealing nothing about it', async () => {
    const a = await makeShop('A')
    const b = await makeShop('B')

    const res = await placeOrder(a.table.sessionToken, oneBurger(b.item.id))

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('One of the items is no longer on the menu')
    expect(JSON.stringify(res.body)).not.toContain('B Burger')
  })

  it('refuses an item that has been marked unavailable', async () => {
    const shop = await makeShop('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${shop.item.id}/availability`)
      .set(auth(shop.cashier))
      .send({ isAvailable: false })

    const res = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/not available/)
  })
})

describe('Ord-01 duplicate submission', () => {
  it('returns the same order for a repeated Idempotency-Key, creating only one', async () => {
    const shop = await makeShop('A')
    const key = newKey()
    const body = oneBurger(shop.item.id)

    const first = await placeOrder(shop.table.sessionToken, body, key)
    const second = await placeOrder(shop.table.sessionToken, body, key)

    expect(first.status).toBe(201)
    expect(first.body.replayed).toBe(false)
    expect(second.status).toBe(200)
    expect(second.body.replayed).toBe(true)
    expect(second.body.order.publicId).toBe(first.body.order.publicId)

    expect(await OrderModel.countDocuments({}).setOptions({ unscoped: true })).toBe(1)
  })

  it('survives concurrent submissions of the same key', async () => {
    const shop = await makeShop('A')
    const key = newKey()
    const body = oneBurger(shop.item.id)

    const results = await Promise.all([
      placeOrder(shop.table.sessionToken, body, key),
      placeOrder(shop.table.sessionToken, body, key),
      placeOrder(shop.table.sessionToken, body, key),
    ])

    const created = results.filter((r) => r.status === 201)
    expect(created).toHaveLength(1)

    // The losers either replay the winner's answer or are told to wait.
    for (const res of results.filter((r) => r.status !== 201)) {
      expect([200, 409]).toContain(res.status)
    }

    expect(await OrderModel.countDocuments({}).setOptions({ unscoped: true })).toBe(1)
  })

  it('refuses to replay when the same key is reused with different content', async () => {
    const shop = await makeShop('A')
    const key = newKey()

    await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id, 1), key)
    const different = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id, 5), key)

    expect(different.status).toBe(409)
  })

  it('requires an Idempotency-Key header', async () => {
    const shop = await makeShop('A')

    const res = await request(app)
      .post('/api/v1/public/orders')
      .set(asCustomer(shop.table.sessionToken))
      .send(oneBurger(shop.item.id))

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/Idempotency-Key/)
  })

  it('releases the key when the order fails, so a corrected retry works', async () => {
    const shop = await makeShop('A')
    const key = newKey()

    const failed = await placeOrder(
      shop.table.sessionToken,
      { items: [{ menuItemId: '0'.repeat(24), quantity: 1 }], paymentMethod: 'CASH' },
      key,
    )
    expect(failed.status).toBe(400)

    const retried = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id), key)
    expect(retried.status).toBe(201)
  })
})

describe('Sec-04 a session cannot order against another table', () => {
  it('ignores a tableId in the body — the table comes from the session', async () => {
    const shop = await makeShop('A')
    const otherTable = await shop.openTable('A-14')

    const res = await placeOrder(shop.table.sessionToken, {
      ...oneBurger(shop.item.id),
      tableId: otherTable.id,
      tableLabel: 'A-14',
      restaurantId: '0'.repeat(24),
    })

    expect(res.status).toBe(201)
    expect(res.body.order.tableLabel).toBe('A-1')

    const stored = await OrderModel.findOne({ publicId: res.body.order.publicId }).setOptions({
      unscoped: true,
    })
    expect(stored?.tableId?.toString()).toBe(shop.table.id)
  })

  it('a session for table 15 cannot read table 14’s orders', async () => {
    const shop = await makeShop('A')
    const table14 = await shop.openTable('A-14')

    const placed = await placeOrder(table14.sessionToken, oneBurger(shop.item.id))
    const publicId = placed.body.order.publicId

    const stolen = await request(app)
      .get(`/api/v1/public/orders/${publicId}`)
      .set(asCustomer(shop.table.sessionToken))
    expect(stolen.status).toBe(404)

    const own = await request(app)
      .get(`/api/v1/public/orders/${publicId}`)
      .set(asCustomer(table14.sessionToken))
    expect(own.status).toBe(200)
  })

  it('the order list is scoped to the presenting session', async () => {
    const shop = await makeShop('A')
    const table14 = await shop.openTable('A-14')

    await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    await placeOrder(table14.sessionToken, oneBurger(shop.item.id))

    const mine = await request(app)
      .get('/api/v1/public/orders')
      .set(asCustomer(shop.table.sessionToken))

    expect(mine.body.orders).toHaveLength(1)
    expect(mine.body.orders[0].tableLabel).toBe('A-1')
  })
})

describe('Sec-06 cross-tenant order access', () => {
  it('one restaurant cannot read or move another’s order', async () => {
    const a = await makeShop('A')
    const b = await makeShop('B')

    const placed = await placeOrder(b.table.sessionToken, oneBurger(b.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const bOrderId = stored!._id.toString()

    const read = await request(app).get(`/api/v1/app/orders/${bOrderId}`).set(auth(a.owner))
    expect(read.status).toBe(404)

    const move = await request(app)
      .post(`/api/v1/app/orders/${bOrderId}/transition`)
      .set(auth(a.owner))
      .send({ to: OrderStatus.CANCELLED })
    expect(move.status).toBe(404)

    const cash = await request(app)
      .post(`/api/v1/app/orders/${bOrderId}/confirm-cash`)
      .set(auth(a.cashier))
      .send({})
    expect(cash.status).toBe(404)

    const list = await request(app).get('/api/v1/app/orders').set(auth(a.owner))
    expect(list.body.orders).toHaveLength(0)

    // B's order is untouched.
    const after = await OrderModel.findById(bOrderId).setOptions({ unscoped: true })
    expect(after?.status).toBe(OrderStatus.CASH_PENDING)
  })

  it('a customer cannot read another restaurant’s order even with its public id', async () => {
    const a = await makeShop('A')
    const b = await makeShop('B')

    const placed = await placeOrder(b.table.sessionToken, oneBurger(b.item.id))

    const res = await request(app)
      .get(`/api/v1/public/orders/${placed.body.order.publicId}`)
      .set(asCustomer(a.table.sessionToken))
    expect(res.status).toBe(404)
  })
})

describe('Sec-09 a customer cannot mark their own order paid', () => {
  it('there is no customer route that changes payment status', async () => {
    const shop = await makeShop('A')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const orderId = stored!._id.toString()

    // The staff transition route rejects a table session token outright.
    const viaTransition = await request(app)
      .post(`/api/v1/app/orders/${orderId}/transition`)
      .set(asCustomer(shop.table.sessionToken))
      .send({ to: OrderStatus.CONFIRMED })
    expect(viaTransition.status).toBe(401)

    const viaCash = await request(app)
      .post(`/api/v1/app/orders/${orderId}/confirm-cash`)
      .set(asCustomer(shop.table.sessionToken))
      .send({})
    expect(viaCash.status).toBe(401)

    const after = await OrderModel.findById(orderId).setOptions({ unscoped: true })
    expect(after?.paymentStatus).toBe(PaymentStatus.CASH_PENDING)
  })
})

describe('Cash-01..03 cash confirmation', () => {
  it('a cashier confirms cash, which marks the order paid and audits it', async () => {
    const shop = await makeShop('A')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const orderId = stored!._id.toString()

    const res = await request(app)
      .post(`/api/v1/app/orders/${orderId}/confirm-cash`)
      .set(auth(shop.cashier))
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.order.status).toBe(OrderStatus.CONFIRMED)
    expect(res.body.order.paymentStatus).toBe(PaymentStatus.PAID)

    const event = await AuditLogModel.findOne({ action: AuditAction.CASH_CONFIRMED })
    expect(event).toBeTruthy()
    expect(event?.actorRole).toBe(Role.CASHIER)
    expect(event?.actorUserId?.toString()).toBe(shop.cashier.user.id)
    expect((event?.metadata as Record<string, unknown>).grandTotalHalalas).toBe(2500)
  })

  it('Cash-02 kitchen staff cannot confirm cash', async () => {
    const shop = await makeShop('A')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })

    const res = await request(app)
      .post(`/api/v1/app/orders/${stored!._id.toString()}/confirm-cash`)
      .set(auth(shop.kitchen))
      .send({})

    expect(res.status).toBe(403)

    const after = await OrderModel.findById(stored!._id).setOptions({ unscoped: true })
    expect(after?.paymentStatus).toBe(PaymentStatus.CASH_PENDING)
  })

  it('Cash-03 a duplicate confirmation is refused, not double-counted', async () => {
    const shop = await makeShop('A')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const orderId = stored!._id.toString()

    await request(app)
      .post(`/api/v1/app/orders/${orderId}/confirm-cash`)
      .set(auth(shop.cashier))
      .send({})

    const again = await request(app)
      .post(`/api/v1/app/orders/${orderId}/confirm-cash`)
      .set(auth(shop.cashier))
      .send({})

    expect(again.status).toBe(409)
    expect(await AuditLogModel.countDocuments({ action: AuditAction.CASH_CONFIRMED })).toBe(1)
  })

  it('two cashiers clicking at the same moment produce exactly one confirmation', async () => {
    const shop = await makeShop('A')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const orderId = stored!._id.toString()

    const confirm = () =>
      request(app)
        .post(`/api/v1/app/orders/${orderId}/confirm-cash`)
        .set(auth(shop.cashier))
        .send({})

    const results = await Promise.all([confirm(), confirm(), confirm()])

    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(await AuditLogModel.countDocuments({ action: AuditAction.CASH_CONFIRMED })).toBe(1)

    const after = await OrderModel.findById(orderId).setOptions({ unscoped: true })
    expect(after?.statusHistory.filter((h) => h.to === OrderStatus.CONFIRMED)).toHaveLength(1)
  })
})

describe('Ord-05 the state machine is enforced over HTTP', () => {
  async function placedOrderId(shop: Awaited<ReturnType<typeof makeShop>>) {
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    return stored!._id.toString()
  }

  const move = (session: Session, id: string, to: string, extra: Record<string, unknown> = {}) =>
    request(app)
      .post(`/api/v1/app/orders/${id}/transition`)
      .set(auth(session))
      .send({ to, ...extra })

  it('refuses to skip the kitchen', async () => {
    const shop = await makeShop('A')
    const id = await placedOrderId(shop)

    const res = await move(shop.owner, id, OrderStatus.COMPLETED)
    expect(res.status).toBe(400)
  })

  it('refuses a move the caller’s role is not allowed to make', async () => {
    const shop = await makeShop('A')
    const id = await placedOrderId(shop)

    await move(shop.cashier, id, OrderStatus.CONFIRMED)
    const res = await move(shop.cashier, id, OrderStatus.KITCHEN_ACCEPTED)
    expect(res.status).toBe(403)
  })

  it('freezes a completed order', async () => {
    const shop = await makeShop('A')
    const id = await placedOrderId(shop)

    await move(shop.cashier, id, OrderStatus.CONFIRMED)
    await move(shop.kitchen, id, OrderStatus.KITCHEN_ACCEPTED)
    await move(shop.kitchen, id, OrderStatus.PREPARING)
    await move(shop.kitchen, id, OrderStatus.READY)
    const completed = await move(shop.cashier, id, OrderStatus.COMPLETED)
    expect(completed.status).toBe(200)

    for (const to of [OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.READY]) {
      const res = await move(shop.owner, id, to)
      expect(res.status, `completed -> ${to}`).toBe(409)
    }

    const after = await OrderModel.findById(id).setOptions({ unscoped: true })
    expect(after?.status).toBe(OrderStatus.COMPLETED)
    expect(after?.totals.grandTotalHalalas).toBe(2500)
  })

  it('records who made each move', async () => {
    const shop = await makeShop('A')
    const id = await placedOrderId(shop)

    await move(shop.cashier, id, OrderStatus.CONFIRMED)
    await move(shop.kitchen, id, OrderStatus.KITCHEN_ACCEPTED)

    const stored = await OrderModel.findById(id).setOptions({ unscoped: true })
    const history = stored!.statusHistory
    expect(history.at(-1)?.byRole).toBe(Role.KITCHEN)
    expect(history.at(-1)?.byUserId?.toString()).toBe(shop.kitchen.user.id)
  })

  it('honours expectedCurrentStatus, so a stale screen cannot act', async () => {
    const shop = await makeShop('A')
    const id = await placedOrderId(shop)

    await move(shop.cashier, id, OrderStatus.CONFIRMED)

    const stale = await move(shop.kitchen, id, OrderStatus.KITCHEN_ACCEPTED, {
      expectedCurrentStatus: OrderStatus.CASH_PENDING,
    })
    expect(stale.status).toBe(409)
  })
})

describe('customer cancellation', () => {
  it('allows cancelling inside the window and refuses after the order is confirmed', async () => {
    const shop = await makeShop('A')

    const first = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const cancelled = await request(app)
      .post(`/api/v1/public/orders/${first.body.order.publicId}/cancel`)
      .set(asCustomer(shop.table.sessionToken))
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.order.status).toBe(OrderStatus.CANCELLED)
    // The customer response must never carry the internal id or staff history.
    expect(cancelled.body.order.id).toBeUndefined()
    expect(cancelled.body.order.statusHistory).toBeUndefined()

    const second = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: second.body.order.publicId }).setOptions({
      unscoped: true,
    })
    await request(app)
      .post(`/api/v1/app/orders/${stored!._id.toString()}/confirm-cash`)
      .set(auth(shop.cashier))
      .send({})

    const tooLate = await request(app)
      .post(`/api/v1/public/orders/${second.body.order.publicId}/cancel`)
      .set(asCustomer(shop.table.sessionToken))
    expect(tooLate.status).toBe(403)
  })

  it('cannot cancel another table’s order', async () => {
    const shop = await makeShop('A')
    const table14 = await shop.openTable('A-14')

    const placed = await placeOrder(table14.sessionToken, oneBurger(shop.item.id))

    const res = await request(app)
      .post(`/api/v1/public/orders/${placed.body.order.publicId}/cancel`)
      .set(asCustomer(shop.table.sessionToken))
    expect(res.status).toBe(404)
  })
})

describe('staff boards', () => {
  it('the kitchen board excludes orders still waiting for cash', async () => {
    const shop = await makeShop('A')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const stored = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })

    const before = await request(app)
      .get('/api/v1/app/orders')
      .query({ board: 'kitchen' })
      .set(auth(shop.kitchen))
    expect(before.body.orders).toHaveLength(0)

    await request(app)
      .post(`/api/v1/app/orders/${stored!._id.toString()}/confirm-cash`)
      .set(auth(shop.cashier))
      .send({})

    const after = await request(app)
      .get('/api/v1/app/orders')
      .query({ board: 'kitchen' })
      .set(auth(shop.kitchen))
    expect(after.body.orders).toHaveLength(1)
    expect(after.headers['cache-control']).toContain('no-store')
  })

  it('rejects an unknown status filter instead of ignoring it', async () => {
    const shop = await makeShop('A')

    const res = await request(app)
      .get('/api/v1/app/orders')
      .query({ status: 'NOT_A_STATUS' })
      .set(auth(shop.owner))
    expect(res.status).toBe(422)
  })

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/app/orders')).status).toBe(401)
  })
})

/**
 * The index behind Ord-01, tested at the collection rather than through HTTP.
 *
 * `{restaurantId, idempotencyKey}` used to be `sparse: true`, which does not
 * mean on a compound index what it appears to: MongoDB skips a document only
 * when *every* indexed field is absent, and `restaurantId` is always there. So
 * a key-less order indexed as `null`, and the second one collided with the
 * first. It never bit, because the ordering route requires the header — but it
 * would have bitten the first path that did not.
 */
describe('the idempotency index constrains only orders that carry a key', () => {
  let seq = 0

  async function writeOrder(restaurantId: unknown, idempotencyKey?: string) {
    seq += 1
    return OrderModel.create({
      restaurantId,
      orderNumber: String(seq).padStart(3, '0'),
      status: OrderStatus.PLACED,
      paymentMethod: 'CASH',
      paymentStatus: PaymentStatus.UNPAID,
      items: [
        {
          menuItemId: restaurantId,
          nameSnapshot: { en: 'Item' },
          unitPriceHalalas: 1000,
          vatRatePercentSnapshot: 15,
          quantity: 1,
          lineSubtotalHalalas: 1000,
          lineVatHalalas: 0,
          lineTotalHalalas: 1000,
        },
      ],
      totals: {
        subtotalHalalas: 1000,
        vatHalalas: 0,
        serviceChargeHalalas: 0,
        grandTotalHalalas: 1000,
      },
      vatRateSnapshotPercent: 15,
      pricesIncludeVatSnapshot: true,
      currencySnapshot: 'SAR',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    })
  }

  it('allows two orders with no key at all in the same restaurant', async () => {
    const restaurant = await makeRestaurant()
    await OrderModel.syncIndexes()

    await writeOrder(restaurant._id)
    await expect(writeOrder(restaurant._id)).resolves.toBeDefined()
  })

  it('still refuses two orders sharing a key in one restaurant', async () => {
    const restaurant = await makeRestaurant()
    await OrderModel.syncIndexes()

    await writeOrder(restaurant._id, 'same-key')
    await expect(writeOrder(restaurant._id, 'same-key')).rejects.toThrow()
  })

  it('lets two restaurants use the same key independently', async () => {
    const [a, b] = await Promise.all([makeRestaurant(), makeRestaurant()])
    await OrderModel.syncIndexes()

    await writeOrder(a._id, 'shared-key')
    await expect(writeOrder(b._id, 'shared-key')).resolves.toBeDefined()
  })
})

/**
 * Staff order actions — refund and rush.
 *
 * Regression for two fixes:
 *  - the endpoints were keyed by publicId while the routes validate an ObjectId,
 *    so refund and rush always 404'd (they now resolve the order by its id);
 *  - refund bypassed the state machine and force-cancelled the order, so a
 *    terminal COMPLETED order could be edited (it now reverses payment only).
 */
describe('staff order actions — refund and rush', () => {
  it('refunds a paid order by its ObjectId, reversing payment without editing a terminal status', async () => {
    const shop = await makeShop('refund')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    expect(placed.status).toBe(201)

    // Arrange the usual case a cashier refunds: a completed, paid order.
    const orderDoc = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const orderId = orderDoc!._id.toString()
    await OrderModel.updateOne(
      { _id: orderDoc!._id },
      { $set: { status: OrderStatus.COMPLETED, paymentStatus: PaymentStatus.PAID } },
    ).setOptions({ unscoped: true })

    const res = await request(app)
      .post(`/api/v1/app/orders/${orderId}/refund`)
      .set(auth(shop.cashier))
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.order.paymentStatus).toBe(PaymentStatus.REFUNDED)
    // Terminal status is left intact — no forced CANCELLED, no state-machine bypass.
    expect(res.body.order.status).toBe(OrderStatus.COMPLETED)

    const audit = await AuditLogModel.findOne({
      action: AuditAction.ORDER_REFUNDED,
      targetId: orderId,
    })
    expect(audit).not.toBeNull()
  })

  it('refuses to refund an order that was never paid', async () => {
    const shop = await makeShop('refund2')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const orderDoc = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })

    const res = await request(app)
      .post(`/api/v1/app/orders/${orderDoc!._id.toString()}/refund`)
      .set(auth(shop.cashier))
      .send({})

    expect(res.status).toBe(400)
  })

  it('refuses a second refund rather than double-processing', async () => {
    const shop = await makeShop('refund3')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const orderDoc = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })
    const orderId = orderDoc!._id.toString()
    await OrderModel.updateOne(
      { _id: orderDoc!._id },
      { $set: { paymentStatus: PaymentStatus.PAID } },
    ).setOptions({ unscoped: true })

    const first = await request(app)
      .post(`/api/v1/app/orders/${orderId}/refund`)
      .set(auth(shop.cashier))
      .send({})
    expect(first.status).toBe(200)

    const second = await request(app)
      .post(`/api/v1/app/orders/${orderId}/refund`)
      .set(auth(shop.cashier))
      .send({})
    expect(second.status).toBe(400) // no longer PAID
  })

  it('toggles rush by ObjectId', async () => {
    const shop = await makeShop('rush')
    const placed = await placeOrder(shop.table.sessionToken, oneBurger(shop.item.id))
    const orderDoc = await OrderModel.findOne({ publicId: placed.body.order.publicId }).setOptions({
      unscoped: true,
    })

    const res = await request(app)
      .patch(`/api/v1/app/orders/${orderDoc!._id.toString()}/rush`)
      .set(auth(shop.kitchen))
      .send({ isRush: true })

    expect(res.status).toBe(200)
    expect(res.body.order.isRush).toBe(true)
  })
})
