/**
 * Menu isolation and access control.
 *
 * Completes requirement Sec-01 ("Restaurant A cannot read Restaurant B's menu")
 * against the real model rather than a stand-in, and proves the customer menu
 * is scoped by the table session alone.
 */

import { Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { MenuItemModel } from '../../src/modules/menu/menuItem.model.js'
import { makeRestaurant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs, type Session } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

/** A restaurant with an owner, one table, one category and one item. */
async function makeMenu(prefix: string, itemName = `${prefix} Burger`) {
  const restaurant = await makeRestaurant()
  const email = `owner-${prefix}-${Math.random().toString(36).slice(2, 7)}@m.test`
  await makeUser({ restaurant, role: Role.OWNER, email })
  const session = await loginAs(email)

  const category = await request(app)
    .post('/api/v1/app/menu/categories')
    .set(auth(session))
    .send({ name: { en: `${prefix} Mains`, ar: 'أطباق' } })
  expect(category.status).toBe(201)

  const item = await request(app)
    .post('/api/v1/app/menu/items')
    .set(auth(session))
    .send({
      categoryId: category.body.category.id,
      name: { en: itemName, ar: 'برجر' },
      priceHalalas: 2500,
    })
  expect(item.status).toBe(201)

  const table = await request(app)
    .post('/api/v1/app/tables')
    .set(auth(session))
    .send({ label: `${prefix}-1` })

  const token = String(table.body.table.url).split('/t/')[1]!
  const opened = await request(app)
    .post('/api/v1/public/table-sessions')
    .send({ tableToken: token })

  return {
    restaurant,
    session,
    category: category.body.category,
    item: item.body.item,
    customerToken: opened.body.sessionToken as string,
  }
}

const asCustomer = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('Sec-01 restaurant A cannot read or change restaurant B’s menu', () => {
  it('staff see only their own categories and items', async () => {
    const a = await makeMenu('A')
    const b = await makeMenu('B')

    const categories = await request(app)
      .get('/api/v1/app/menu/categories')
      .set(auth(a.session))
    expect(categories.body.categories).toHaveLength(1)
    expect(categories.body.categories[0].name.en).toBe('A Mains')

    const items = await request(app).get('/api/v1/app/menu/items').set(auth(a.session))
    expect(items.body.items).toHaveLength(1)
    expect(items.body.items[0].name.en).toBe('A Burger')
    expect(JSON.stringify(items.body)).not.toContain('B Burger')
    expect(b.item.id).toBeTruthy()
  })

  it('cannot read, update or delete another restaurant’s item by id', async () => {
    const a = await makeMenu('A')
    const b = await makeMenu('B')

    const update = await request(app)
      .patch(`/api/v1/app/menu/items/${b.item.id}`)
      .set(auth(a.session))
      .send({ priceHalalas: 1 })
    expect(update.status).toBe(404)

    const availability = await request(app)
      .patch(`/api/v1/app/menu/items/${b.item.id}/availability`)
      .set(auth(a.session))
      .send({ isAvailable: false })
    expect(availability.status).toBe(404)

    const remove = await request(app)
      .delete(`/api/v1/app/menu/items/${b.item.id}`)
      .set(auth(a.session))
    expect(remove.status).toBe(404)

    // B's item is untouched.
    const stored = await MenuItemModel.findOne({ _id: b.item.id }).setOptions({ unscoped: true })
    expect(stored?.priceHalalas).toBe(2500)
    expect(stored?.isAvailable).toBe(true)
  })

  it('cannot attach an item to another restaurant’s category', async () => {
    const a = await makeMenu('A')
    const b = await makeMenu('B')

    const res = await request(app)
      .post('/api/v1/app/menu/items')
      .set(auth(a.session))
      .send({
        categoryId: b.category.id,
        name: { en: 'Smuggled' },
        priceHalalas: 100,
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/Unknown category/)
  })

  it('cannot move an existing item into another restaurant’s category', async () => {
    const a = await makeMenu('A')
    const b = await makeMenu('B')

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({ categoryId: b.category.id })

    expect(res.status).toBe(400)
  })

  it('allows two restaurants to use the same category and item names', async () => {
    await makeMenu('A', 'Cheeseburger')
    const b = await makeMenu('B', 'Cheeseburger')
    expect(b.item.name.en).toBe('Cheeseburger')
  })
})

describe('the customer menu is scoped by the table session', () => {
  it('returns only the session’s own restaurant menu', async () => {
    const a = await makeMenu('A')
    await makeMenu('B')

    const res = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))

    expect(res.status).toBe(200)
    expect(res.body.categories).toHaveLength(1)
    expect(res.body.categories[0].items[0].name.en).toBe('A Burger')
    expect(JSON.stringify(res.body)).not.toContain('B Burger')
  })

  it('ignores any restaurant or category the client tries to name', async () => {
    const a = await makeMenu('A')
    const b = await makeMenu('B')

    const res = await request(app)
      .get('/api/v1/public/menu')
      .query({ restaurantId: b.restaurant._id.toString(), categoryId: b.category.id })
      .set(asCustomer(a.customerToken))

    expect(res.status).toBe(200)
    expect(res.body.categories[0].items[0].name.en).toBe('A Burger')
  })

  it('requires a table session', async () => {
    await makeMenu('A')
    const res = await request(app).get('/api/v1/public/menu')
    expect(res.status).toBe(404)
    expect(res.body.error.message).toBe('Table not found')
  })

  it('rejects a staff token on the customer menu', async () => {
    const a = await makeMenu('A')
    const res = await request(app).get('/api/v1/public/menu').set(auth(a.session))
    expect(res.status).toBe(404)
  })

  /**
   * Changed 2026-08-12 by product-owner decision. A sold-out dish used to vanish
   * from the customer menu; it now stays, marked. Retired (`isActive: false`)
   * still disappears — retired and sold out are different things.
   */
  it('shows an unavailable item to customers as sold out, rather than hiding it', async () => {
    const a = await makeMenu('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}/availability`)
      .set(auth(a.session))
      .send({ isAvailable: false })

    const customer = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))
    expect(customer.body.categories).toHaveLength(1)
    expect(customer.body.categories[0].items).toHaveLength(1)
    expect(customer.body.categories[0].items[0].isSoldOut).toBe(true)

    const staff = await request(app).get('/api/v1/app/menu/items').set(auth(a.session))
    expect(staff.body.items).toHaveLength(1)
    expect(staff.body.items[0].isAvailable).toBe(false)
  })

  it('still hides a retired item entirely', async () => {
    const a = await makeMenu('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({ isActive: false })

    const customer = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))
    // The only item is gone, so its now-empty category is omitted too.
    expect(customer.body.categories).toHaveLength(0)
  })

  it('hides an inactive category', async () => {
    const a = await makeMenu('A')

    await request(app)
      .patch(`/api/v1/app/menu/categories/${a.category.id}`)
      .set(auth(a.session))
      .send({ isActive: false })

    const res = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))
    expect(res.body.categories).toHaveLength(0)
  })

  it('hides unavailable modifier options', async () => {
    const a = await makeMenu('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({
        modifierGroups: [
          {
            key: 'extras',
            name: { en: 'Extras' },
            minSelect: 0,
            maxSelect: 2,
            required: false,
            options: [
              { key: 'cheese', name: { en: 'Extra cheese' }, priceDeltaHalalas: 300 },
              { key: 'bacon', name: { en: 'Bacon' }, priceDeltaHalalas: 500, isAvailable: false },
            ],
          },
        ],
      })

    const res = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))
    const options = res.body.categories[0].items[0].modifierGroups[0].options

    expect(options).toHaveLength(1)
    expect(options[0].key).toBe('cheese')
    expect(JSON.stringify(res.body)).not.toContain('Bacon')
  })

  it('revalidates with an ETag so a repeat load costs almost nothing', async () => {
    const a = await makeMenu('A')

    const first = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))
    const etag = first.headers.etag
    expect(etag).toBeTruthy()
    expect(first.headers['cache-control']).toContain('private')

    const second = await request(app)
      .get('/api/v1/public/menu')
      .set(asCustomer(a.customerToken))
      .set('If-None-Match', etag)
    expect(second.status).toBe(304)

    // Changing the menu must invalidate it.
    await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({ priceHalalas: 3000 })

    const third = await request(app)
      .get('/api/v1/public/menu')
      .set(asCustomer(a.customerToken))
      .set('If-None-Match', etag)
    expect(third.status).toBe(200)
  })
})

describe('menu RBAC', () => {
  const rolesThatCannotEdit = [Role.CASHIER, Role.KITCHEN, Role.WAITER] as const

  it('only owners and managers may create, change or delete items', async () => {
    const a = await makeMenu('A')

    for (const role of rolesThatCannotEdit) {
      const email = `${role.toLowerCase()}@menu.test`
      await makeUser({ restaurant: a.restaurant, role, email })
      const session: Session = await loginAs(email)

      const create = await request(app)
        .post('/api/v1/app/menu/items')
        .set(auth(session))
        .send({ categoryId: a.category.id, name: { en: 'X' }, priceHalalas: 100 })
      expect(create.status, `create as ${role}`).toBe(403)

      const patch = await request(app)
        .patch(`/api/v1/app/menu/items/${a.item.id}`)
        .set(auth(session))
        .send({ priceHalalas: 1 })
      expect(patch.status, `patch as ${role}`).toBe(403)

      const remove = await request(app)
        .delete(`/api/v1/app/menu/items/${a.item.id}`)
        .set(auth(session))
      expect(remove.status, `delete as ${role}`).toBe(403)
    }
  })

  it('a cashier may take an item off the menu mid-service, but not change its price', async () => {
    const a = await makeMenu('A')
    await makeUser({ restaurant: a.restaurant, role: Role.CASHIER, email: 'till@menu.test' })
    const cashier = await loginAs('till@menu.test')

    const toggle = await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}/availability`)
      .set(auth(cashier))
      .send({ isAvailable: false })
    expect(toggle.status).toBe(200)
    expect(toggle.body.item.isAvailable).toBe(false)

    const price = await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(cashier))
      .send({ priceHalalas: 1 })
    expect(price.status).toBe(403)
  })

  it('kitchen staff may read the menu', async () => {
    const a = await makeMenu('A')
    await makeUser({ restaurant: a.restaurant, role: Role.KITCHEN, email: 'chef@menu.test' })
    const kitchen = await loginAs('chef@menu.test')

    const res = await request(app).get('/api/v1/app/menu/items').set(auth(kitchen))
    expect(res.status).toBe(200)
  })
})

describe('image URLs cannot point at arbitrary hosts', () => {
  it('rejects an external URL when no provider is configured', async () => {
    const a = await makeMenu('A')

    for (const imageUrl of [
      'https://evil.test/tracker.png',
      'https://res.cloudinary.com/someone-else/image/upload/x.png',
      'javascript:alert(1)',
      'http://res.cloudinary.com/x/rw/y/menu-item/a.png',
    ]) {
      const res = await request(app)
        .patch(`/api/v1/app/menu/items/${a.item.id}`)
        .set(auth(a.session))
        .send({ imageUrl })
      expect(res.status, imageUrl).toBe(400)
    }
  })

  it('refuses to sign an upload while no provider is configured, and says why', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .post('/api/v1/app/menu/images/upload-credentials')
      .set(auth(a.session))
      .send({ kind: 'menu-item' })

    expect(res.status).toBe(503)
    expect(res.body.error.message).toMatch(/IMAGE_PROVIDER/)
  })
})

describe('money and audit', () => {
  it('rejects a fractional or negative price', async () => {
    const a = await makeMenu('A')

    for (const priceHalalas of [12.5, -100, Number.NaN]) {
      const res = await request(app)
        .post('/api/v1/app/menu/items')
        .set(auth(a.session))
        .send({ categoryId: a.category.id, name: { en: 'Bad' }, priceHalalas })
      expect(res.status, String(priceHalalas)).toBe(422)
    }
  })

  it('stores the price as an exact integer of halalas', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .post('/api/v1/app/menu/items')
      .set(auth(a.session))
      .send({ categoryId: a.category.id, name: { en: 'Exact' }, priceHalalas: 1999 })

    expect(res.body.item.priceHalalas).toBe(1999)
    const stored = await MenuItemModel.findOne({ _id: res.body.item.id }).setOptions({
      unscoped: true,
    })
    expect(stored?.priceHalalas).toBe(1999)
    expect(Number.isInteger(stored?.priceHalalas)).toBe(true)
  })

  it('records a price change with before and after values', async () => {
    const a = await makeMenu('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({ priceHalalas: 3100 })

    const event = await AuditLogModel.findOne({ action: AuditAction.MENU_PRICE_CHANGED })
    expect(event).toBeTruthy()
    expect((event?.metadata as Record<string, unknown>).fromHalalas).toBe(2500)
    expect((event?.metadata as Record<string, unknown>).toHalalas).toBe(3100)
  })

  it('does not record a price change when the price did not change', async () => {
    const a = await makeMenu('A')

    await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({ priceHalalas: 2500, sortOrder: 5 })

    expect(await AuditLogModel.countDocuments({ action: AuditAction.MENU_PRICE_CHANGED })).toBe(0)
  })
})

describe('validation of modifier groups', () => {
  it('rejects a group whose maxSelect exceeds its option count', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({
        modifierGroups: [
          {
            key: 'size',
            name: { en: 'Size' },
            maxSelect: 5,
            options: [{ key: 's', name: { en: 'Small' } }],
          },
        ],
      })

    expect(res.status).toBe(422)
  })

  it('rejects duplicate option keys and a required group with minSelect 0', async () => {
    const a = await makeMenu('A')

    const duplicate = await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({
        modifierGroups: [
          {
            key: 'size',
            name: { en: 'Size' },
            maxSelect: 2,
            options: [
              { key: 's', name: { en: 'Small' } },
              { key: 's', name: { en: 'Also small' } },
            ],
          },
        ],
      })
    expect(duplicate.status).toBe(422)

    const required = await request(app)
      .patch(`/api/v1/app/menu/items/${a.item.id}`)
      .set(auth(a.session))
      .send({
        modifierGroups: [
          {
            key: 'size',
            name: { en: 'Size' },
            required: true,
            minSelect: 0,
            options: [{ key: 's', name: { en: 'Small' } }],
          },
        ],
      })
    expect(required.status).toBe(422)
  })
})

describe('categories', () => {
  it('renames a category, keeping its items', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .patch(`/api/v1/app/menu/categories/${a.category.id}`)
      .set(auth(a.session))
      .send({ name: { en: 'Naadan Breakfast', ar: 'فطور نادان' }, sortOrder: 20 })

    expect(res.status).toBe(200)
    expect(res.body.category.name.en).toBe('Naadan Breakfast')
    expect(res.body.category.sortOrder).toBe(20)

    const items = await request(app).get('/api/v1/app/menu/items').set(auth(a.session))
    expect(items.body.items).toHaveLength(1)
    expect(items.body.items[0].categoryId).toBe(a.category.id)
  })

  /**
   * The category editor sends the whole name object on every save, so an admin
   * only adding an Arabic translation re-sends the English name unchanged. The
   * uniqueness guard must not read that as a clash with the category itself.
   */
  it('does not treat a category’s own name as a duplicate of itself', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .patch(`/api/v1/app/menu/categories/${a.category.id}`)
      .set(auth(a.session))
      .send({ name: { en: a.category.name.en, ar: 'فطور' } })

    expect(res.status).toBe(200)
    expect(res.body.category.name.ar).toBe('فطور')
  })

  it('hides a category from customers without deleting it', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .patch(`/api/v1/app/menu/categories/${a.category.id}`)
      .set(auth(a.session))
      .send({ isActive: false })
    expect(res.status).toBe(200)

    const customer = await request(app).get('/api/v1/public/menu').set(asCustomer(a.customerToken))
    expect(customer.body.categories).toHaveLength(0)

    // Still there for staff, and reversible.
    const staff = await request(app).get('/api/v1/app/menu/categories').set(auth(a.session))
    expect(staff.body.categories).toHaveLength(1)
    expect(staff.body.categories[0].isActive).toBe(false)
  })

  it('refuses to delete a category that still has items', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .delete(`/api/v1/app/menu/categories/${a.category.id}`)
      .set(auth(a.session))

    expect(res.status).toBe(409)
    expect(res.body.error.message).toMatch(/still contains 1 item/)
  })

  it('allows deleting an empty category', async () => {
    const a = await makeMenu('A')

    await request(app).delete(`/api/v1/app/menu/items/${a.item.id}`).set(auth(a.session))

    const res = await request(app)
      .delete(`/api/v1/app/menu/categories/${a.category.id}`)
      .set(auth(a.session))
    expect(res.status).toBe(204)
  })

  it('rejects a duplicate category name within one restaurant', async () => {
    const a = await makeMenu('A')

    const res = await request(app)
      .post('/api/v1/app/menu/categories')
      .set(auth(a.session))
      .send({ name: { en: 'A Mains' } })

    expect(res.status).toBe(409)
  })
})
