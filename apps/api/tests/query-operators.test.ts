/**
 * Every deliberate MongoDB operator must survive `sanitizeFilter`.
 *
 * `mongoose.set('sanitizeFilter', true)` rewrites any operator-shaped object in
 * a filter to `{ $eq: … }` — the protection that stops a `{"$ne": null}` from a
 * client becoming a query operator. It applies to *our* operators too, so each
 * one has to be wrapped in `mongoose.trusted()`. Forgetting the wrapper does not
 * degrade quietly: on a typed path Mongoose tries to cast the operator object to
 * that type and the route returns 500.
 *
 * These are the routes where that happened. One request each, asserting only
 * that the query still runs — the behaviour itself is covered elsewhere.
 */

import { Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { OtpCodeModel } from '../src/modules/customers/customer.model.js'
import { makeRestaurant, makeUser } from './setup/factories.js'
import { app, auth, loginAs } from './setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from './setup/mongo.js'

async function makeOwner() {
  const restaurant = await makeRestaurant()
  const email = `owner-${Math.random().toString(36).slice(2, 7)}@t.test`
  await makeUser({ restaurant, role: Role.OWNER, email })
  return { restaurant, session: await loginAs(email) }
}

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('menu search ($regex)', () => {
  it('finds an item by name instead of failing to cast the filter', async () => {
    const { session } = await makeOwner()

    const category = await request(app)
      .post('/api/v1/app/menu/categories')
      .set(auth(session))
      .send({ name: { en: 'Mains', ar: 'أطباق' } })
    expect(category.status).toBe(201)

    const item = await request(app)
      .post('/api/v1/app/menu/items')
      .set(auth(session))
      .send({
        categoryId: category.body.category.id,
        name: { en: 'Truffle Burger', ar: 'برجر' },
        priceHalalas: 4500,
      })
    expect(item.status).toBe(201)

    const hit = await request(app)
      .get('/api/v1/app/menu/items/search?q=truffle')
      .set(auth(session))
    expect(hit.status).toBe(200)
    expect(hit.body.items).toHaveLength(1)
    expect(hit.body.items[0].name.en).toBe('Truffle Burger')

    const miss = await request(app)
      .get('/api/v1/app/menu/items/search?q=zzzz')
      .set(auth(session))
    expect(miss.status).toBe(200)
    expect(miss.body.items).toEqual([])
  })
})

describe('OTP verification ($exists, $gt)', () => {
  it('accepts a live code once and refuses the replay', async () => {
    const phone = '+966500000001'

    const requested = await request(app).post('/api/v1/customers/request-otp').send({ phone })
    expect(requested.status).toBe(200)

    // The code is never returned by the request endpoint; read it as the SMS
    // gateway would deliver it.
    const stored = await OtpCodeModel.findOne({ phone })
    const code = stored!.code

    const verified = await request(app).post('/api/v1/customers/verify-otp').send({ phone, code })
    expect(verified.status).toBe(200)
    expect(verified.body.token).toBeTruthy()

    const replay = await request(app).post('/api/v1/customers/verify-otp').send({ phone, code })
    expect(replay.status).toBe(400)
  })

  it('refuses an expired code', async () => {
    const phone = '+966500000002'
    await request(app).post('/api/v1/customers/request-otp').send({ phone })

    await OtpCodeModel.updateOne({ phone }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const stored = await OtpCodeModel.findOne({ phone })
    const res = await request(app)
      .post('/api/v1/customers/verify-otp')
      .send({ phone, code: stored!.code })
    expect(res.status).toBe(400)
  })
})

describe('customer order pagination ($lt cursor)', () => {
  it('accepts a cursor instead of failing to cast it', async () => {
    const { session } = await makeOwner()

    const table = await request(app)
      .post('/api/v1/app/tables')
      .set(auth(session))
      .send({ label: 'P1' })
    expect(table.status).toBe(201)

    const tableToken = String(table.body.table.url).split('/t/')[1]!
    const opened = await request(app).post('/api/v1/public/table-sessions').send({ tableToken })
    expect(opened.status).toBe(201)

    const res = await request(app)
      .get(`/api/v1/public/orders?cursor=${encodeURIComponent(new Date().toISOString())}`)
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(res.status).toBe(200)
    expect(res.body.orders).toEqual([])
  })
})
