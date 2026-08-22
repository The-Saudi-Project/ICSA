/**
 * "Call waiter" — the customer flag and the waiter screen that reads it.
 *
 * Two things are pinned here.
 *
 *  1. **The route must not 500.** `sanitizeFilter` is on globally, so the
 *     `{ $ne: null }` this board depends on has to be wrapped in
 *     `mongoose.trusted()`. Without it Mongoose rewrites the filter to
 *     `{ $eq: { $ne: null } }`, tries to cast that object to a Date, and every
 *     poll of the waiter screen fails with a CastError. A per-query
 *     `{ sanitizeFilter: false }` does not help — the global setting wins.
 *
 *  2. **The board is tenant-scoped and says nothing about tables.** A call
 *     raised in one restaurant is invisible in another, another tenant's table
 *     id resolves to a 404, and the payload carries no table token material.
 */

import { Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeRestaurant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs, type Session } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

/** One owner per tenant: Argon2 is deliberately slow, so extra users cost seconds. */
async function makeTenantWithTable(label: string) {
  const restaurant = await makeRestaurant()
  const email = `owner-${label}-${Math.random().toString(36).slice(2, 7)}@t.test`
  await makeUser({ restaurant, role: Role.OWNER, email })
  const session = await loginAs(email)

  const created = await request(app).post('/api/v1/app/tables').set(auth(session)).send({ label })
  expect(created.status).toBe(201)

  const tableToken = String(created.body.table.url).split('/t/')[1]!
  const opened = await request(app).post('/api/v1/public/table-sessions').send({ tableToken })
  expect(opened.status).toBe(201)

  return {
    session,
    tableId: created.body.table.id as string,
    sessionToken: opened.body.sessionToken as string,
  }
}

const callWaiter = (sessionToken: string) =>
  request(app).post('/api/v1/public/call-waiter').set('Authorization', `Bearer ${sessionToken}`)

const waiterCalls = (session: Session) =>
  request(app).get('/api/v1/app/orders/waiter-calls').set(auth(session))

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('the waiter call board', () => {
  it('lists a table that called, and resolving it clears the call', async () => {
    const { session, tableId, sessionToken } = await makeTenantWithTable('12')

    expect((await waiterCalls(session)).body.calls).toEqual([])

    const called = await callWaiter(sessionToken)
    expect(called.status).toBe(200)

    const listed = await waiterCalls(session)
    expect(listed.status).toBe(200)
    expect(listed.body.calls).toHaveLength(1)
    expect(listed.body.calls[0].label).toBe('12')
    expect(listed.body.calls[0]._id).toBe(tableId)
    expect(listed.body.calls[0].needsWaiterAt).toBeTruthy()

    const resolved = await request(app)
      .post(`/api/v1/app/orders/${tableId}/resolve-call`)
      .set(auth(session))
    expect(resolved.status).toBe(200)

    expect((await waiterCalls(session)).body.calls).toEqual([])
  })

  it('never returns table token material', async () => {
    const { session, sessionToken } = await makeTenantWithTable('7')
    await callWaiter(sessionToken)

    const call = (await waiterCalls(session)).body.calls[0]
    expect(call.tokenHash).toBeUndefined()
    expect(call.tokenCipher).toBeUndefined()
    expect(call.restaurantId).toBeUndefined()
  })

  it('does not show one restaurant a call raised in another', async () => {
    const mine = await makeTenantWithTable('A1')
    const theirs = await makeTenantWithTable('B1')

    await callWaiter(theirs.sessionToken)

    expect((await waiterCalls(mine.session)).body.calls).toEqual([])
    expect((await waiterCalls(theirs.session)).body.calls).toHaveLength(1)
  })

  it('answers 404 — not 403 — when resolving another tenant’s table', async () => {
    const mine = await makeTenantWithTable('A2')
    const theirs = await makeTenantWithTable('B2')

    await callWaiter(theirs.sessionToken)

    const res = await request(app)
      .post(`/api/v1/app/orders/${theirs.tableId}/resolve-call`)
      .set(auth(mine.session))
    expect(res.status).toBe(404)

    // And the call it could not reach is still standing.
    expect((await waiterCalls(theirs.session)).body.calls).toHaveLength(1)
  })
})
