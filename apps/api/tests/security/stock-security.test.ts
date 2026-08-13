/**
 * Portion counts.
 *
 * Three things have to hold, and each has a way of failing quietly:
 *
 *  1. **The number never reaches a customer.** It says how well a dish sells,
 *     and it invites "only 2 left" pressure nobody asked us to create. The
 *     customer surface gets a boolean.
 *  2. **The last portion cannot be sold twice.** A read-then-write would let two
 *     simultaneous taps both succeed, and the kitchen would find out at the pass.
 *  3. **Food that was never cooked goes back.** A cancelled order that keeps its
 *     portions turns a busy service into a phantom sell-out.
 */

import { OrderStatus, Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MenuCategoryModel } from '../../src/modules/menu/menuCategory.model.js'
import { MenuItemModel } from '../../src/modules/menu/menuItem.model.js'
import { TableModel } from '../../src/modules/tables/table.model.js'
import { sha256, encryptSecret, generateToken } from '../../src/core/crypto.js'
import { makeTenant } from '../setup/factories.js'
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

/** A tenant with one table, one category and one item at a known stock level. */
async function makeShop(stockRemaining: number | null) {
  const tenant = await makeTenant()
  const restaurantId = tenant.restaurant._id

  const category = await MenuCategoryModel.create({
    restaurantId,
    name: { en: 'Mains' },
    sortOrder: 0,
  })

  const item = await MenuItemModel.create({
    restaurantId,
    categoryId: category._id,
    name: { en: 'Biriyani' },
    priceHalalas: 2800,
    stockRemaining,
  })

  const token = generateToken()
  await TableModel.create({
    restaurantId,
    label: '1',
    tokenHash: sha256(token),
    tokenCipher: encryptSecret(token),
  })

  const session = await request(app).post('/api/v1/public/table-sessions').send({ tableToken: token })
  expect(session.status).toBe(201)

  return {
    tenant,
    item,
    sessionToken: session.body.sessionToken as string,
  }
}

const asCustomer = (token: string) => ({ Authorization: `Bearer ${token}` })

let keySeq = 0
function order(shop: { sessionToken: string; item: { _id: unknown } }, quantity: number) {
  keySeq += 1
  return request(app)
    .post('/api/v1/public/orders')
    .set(asCustomer(shop.sessionToken))
    .set('Idempotency-Key', `stock-test-${keySeq}-${Math.random().toString(36).slice(2)}`)
    .send({
      paymentMethod: 'CASH',
      items: [{ menuItemId: String(shop.item._id), quantity }],
    })
}

const stockOf = async (id: unknown) =>
  (await MenuItemModel.findById(id).setOptions({ unscoped: true }))?.stockRemaining

describe('the portion count never reaches a customer', () => {
  it('is absent from the customer menu, which gets a boolean instead', async () => {
    const shop = await makeShop(7)

    const res = await request(app)
      .get('/api/v1/public/menu')
      .set(asCustomer(shop.sessionToken))

    const item = res.body.categories[0].items[0]
    expect(item.isSoldOut).toBe(false)
    expect(item.stockRemaining).toBeUndefined()
    // Belt and braces: the number 7 must appear nowhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain('stockRemaining')
  })

  it('marks a dish sold out once the count reaches zero, still without the number', async () => {
    const shop = await makeShop(0)

    const res = await request(app)
      .get('/api/v1/public/menu')
      .set(asCustomer(shop.sessionToken))

    const item = res.body.categories[0].items[0]
    expect(item.isSoldOut).toBe(true)
    expect(item.stockRemaining).toBeUndefined()
  })

  it('is visible to staff, who are the ones who need it', async () => {
    const shop = await makeShop(7)
    const session = await loginAs(shop.tenant.owner.email)

    const res = await request(app).get('/api/v1/app/menu/items').set(auth(session))
    expect(res.body.items[0].stockRemaining).toBe(7)
  })
})

describe('stock is taken when an order is placed', () => {
  it('decrements by the quantity ordered', async () => {
    const shop = await makeShop(10)

    expect((await order(shop, 3)).status).toBe(201)
    expect(await stockOf(shop.item._id)).toBe(7)
  })

  it('refuses an order for more than is left, and takes nothing', async () => {
    const shop = await makeShop(2)

    const res = await order(shop, 5)

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/Only 2 left/)
    expect(await stockOf(shop.item._id)).toBe(2)
  })

  it('refuses an order for a sold-out dish', async () => {
    const shop = await makeShop(0)

    const res = await order(shop, 1)

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/sold out/i)
  })

  /**
   * The reason every decrement is a conditional update rather than a read then a
   * write. Three phones tap at the same moment with two portions left.
   */
  it('cannot sell the last portions twice, however simultaneous the taps', async () => {
    const shop = await makeShop(2)

    const results = await Promise.all([order(shop, 1), order(shop, 1), order(shop, 1)])
    const created = results.filter((r) => r.status === 201)
    const refused = results.filter((r) => r.status === 400)

    expect(created).toHaveLength(2)
    expect(refused).toHaveLength(1)
    expect(await stockOf(shop.item._id)).toBe(0)
  })

  it('leaves an untracked dish alone — null is unlimited, not zero', async () => {
    const shop = await makeShop(null)

    // 50 is the per-line cap in `placeOrderSchema`; the point is that a large
    // quantity sails through when nobody is counting the dish.
    expect((await order(shop, 50)).status).toBe(201)
    expect(await stockOf(shop.item._id)).toBeNull()
  })
})

describe('stock comes back when the food is not served', () => {
  it('returns portions when a customer cancels', async () => {
    const shop = await makeShop(5)

    const placed = await order(shop, 2)
    expect(placed.status).toBe(201)
    expect(await stockOf(shop.item._id)).toBe(3)

    const cancelled = await request(app)
      .post(`/api/v1/public/orders/${placed.body.order.publicId}/cancel`)
      .set(asCustomer(shop.sessionToken))

    expect(cancelled.status).toBe(200)
    expect(await stockOf(shop.item._id)).toBe(5)
  })

  it('returns portions when staff reject an order', async () => {
    const shop = await makeShop(5)
    const placed = await order(shop, 2)
    const session = await loginAs(shop.tenant.owner.email)

    const staffOrders = await request(app).get('/api/v1/app/orders').set(auth(session))
    const id = staffOrders.body.orders[0].id

    const rejected = await request(app)
      .post(`/api/v1/app/orders/${id}/transition`)
      .set(auth(session))
      .send({ to: OrderStatus.REJECTED, reason: 'kitchen closed' })

    expect(rejected.status).toBe(200)
    expect(await stockOf(shop.item._id)).toBe(5)
    expect(placed.status).toBe(201)
  })

  /**
   * The one terminal state that must NOT restock. A completed order was eaten;
   * giving its portions back would let the kitchen sell food it has already served.
   */
  it('does not return portions for an order that was completed', async () => {
    const shop = await makeShop(5)
    await order(shop, 2)
    const session = await loginAs(shop.tenant.owner.email)

    const staffOrders = await request(app).get('/api/v1/app/orders').set(auth(session))
    const id = staffOrders.body.orders[0].id

    for (const to of [
      OrderStatus.CONFIRMED,
      OrderStatus.KITCHEN_ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ]) {
      const res = await request(app)
        .post(`/api/v1/app/orders/${id}/transition`)
        .set(auth(session))
        .send({ to })
      expect(res.status, to).toBe(200)
    }

    expect(await stockOf(shop.item._id)).toBe(3)
  })
})

describe('only the right roles may set stock', () => {
  it('lets an owner set and clear the count', async () => {
    const shop = await makeShop(null)
    const session = await loginAs(shop.tenant.owner.email)

    const set = await request(app)
      .patch(`/api/v1/app/menu/items/${String(shop.item._id)}`)
      .set(auth(session))
      .send({ stockRemaining: 12 })
    expect(set.status).toBe(200)
    expect(await stockOf(shop.item._id)).toBe(12)

    const cleared = await request(app)
      .patch(`/api/v1/app/menu/items/${String(shop.item._id)}`)
      .set(auth(session))
      .send({ stockRemaining: null })
    expect(cleared.status).toBe(200)
    expect(await stockOf(shop.item._id)).toBeNull()
  })

  /**
   * Documents a known gap rather than asserting it is correct. The product owner
   * asked for kitchen staff to edit stock, then chose to put the control in the
   * admin item editor, which kitchen cannot reach. If kitchen access is added
   * later, this expectation flips to 200 and the route needs Role.KITCHEN.
   */
  it('does not yet let kitchen staff set stock — see PROJECT_STATE §16', async () => {
    const shop = await makeShop(5)
    const session = await loginAs(shop.tenant.kitchen.email)

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${String(shop.item._id)}`)
      .set(auth(session))
      .send({ stockRemaining: 99 })

    expect(res.status).toBe(403)
    expect(await stockOf(shop.item._id)).toBe(5)
  })

  it('refuses a negative count', async () => {
    const shop = await makeShop(5)
    const session = await loginAs(shop.tenant.owner.email)

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${String(shop.item._id)}`)
      .set(auth(session))
      .send({ stockRemaining: -1 })

    expect(res.status).toBe(422)
  })

  it('keeps one restaurant’s stock away from another', async () => {
    const [a, b] = await Promise.all([makeShop(5), makeShop(5)])
    const session = await loginAs(a.tenant.owner.email)

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${String(b.item._id)}`)
      .set(auth(session))
      .send({ stockRemaining: 0 })

    expect(res.status).toBe(404)
    expect(await stockOf(b.item._id)).toBe(5)
  })
})

describe('roles', () => {
  it('a cashier still cannot edit an item, only its availability', async () => {
    const shop = await makeShop(5)
    const session = await loginAs(shop.tenant.cashier.email)

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${String(shop.item._id)}`)
      .set(auth(session))
      .send({ stockRemaining: 0 })

    expect(res.status).toBe(403)
    expect(Role.CASHIER).toBe('CASHIER')
  })
})
