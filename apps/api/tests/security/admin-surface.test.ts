/**
 * Every admin endpoint, walked as a cashier and as a kitchen user.
 *
 * `rbac.test.ts` proves the `requireRestaurantAdmin` middleware rejects those
 * roles — but it mounts the middleware on a synthetic route. That leaves the
 * question this file answers: does every *real* admin route actually use it? A
 * new route that forgets the guard would pass every existing test.
 *
 * This became worth writing on 2026-08-12, when a cashier turned out to be able
 * to open `/admin/menu` in the browser. The client-side route guard had been
 * dropped in a redesign. Nothing leaked, because the server refused all of it —
 * which is exactly the property pinned below, so that the client guard stays a
 * convenience and never becomes the thing standing between a cashier and the
 * menu editor.
 */

import { Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTenant } from '../setup/factories.js'
import { app, auth, loginAs, type Session } from '../setup/http.js'
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

/** RBAC runs before the handler, so a well-formed but absent id is enough. */
const SOME_ID = '65d1a1234567890123456789'

type Method = 'get' | 'post' | 'patch' | 'delete'

/** Everything only an OWNER or MANAGER may touch. */
const ADMIN_ROUTES: readonly [Method, string][] = [
  ['get', '/api/v1/app/menu/categories'],
  ['post', '/api/v1/app/menu/categories'],
  ['patch', `/api/v1/app/menu/categories/${SOME_ID}`],
  ['delete', `/api/v1/app/menu/categories/${SOME_ID}`],
  ['post', '/api/v1/app/menu/items'],
  ['patch', `/api/v1/app/menu/items/${SOME_ID}`],
  ['delete', `/api/v1/app/menu/items/${SOME_ID}`],
  ['post', '/api/v1/app/menu/images/upload-credentials'],
  ['get', '/api/v1/app/tables'],
  ['post', '/api/v1/app/tables'],
  ['patch', `/api/v1/app/tables/${SOME_ID}`],
  ['post', `/api/v1/app/tables/${SOME_ID}/rotate-token`],
  ['get', `/api/v1/app/tables/${SOME_ID}/qr`],
  ['get', '/api/v1/app/tables/export'],
  ['get', '/api/v1/app/staff'],
  ['post', '/api/v1/app/staff'],
  ['patch', `/api/v1/app/staff/${SOME_ID}`],
  ['post', `/api/v1/app/staff/${SOME_ID}/reset-password`],
  ['get', '/api/v1/app/dashboard/stats'],
  // Money- and payment-posture-relevant: VAT rate, service charge, VAT-inclusive
  // pricing, and cook-before-payment. Owner/manager only.
  ['patch', '/api/v1/app/restaurants/settings'],
]

const call = (session: Session, method: Method, path: string) =>
  request(app)[method](path).set(auth(session)).send({})

describe('no admin route forgot its guard', () => {
  it('refuses a cashier on every one of them', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.cashier.email)

    for (const [method, path] of ADMIN_ROUTES) {
      const res = await call(session, method, path)
      expect(res.status, `${method.toUpperCase()} ${path} as CASHIER`).toBe(403)
      expect(res.body.error.code, `${method.toUpperCase()} ${path}`).toBe('FORBIDDEN')
    }
  })

  it('refuses a kitchen user on every one of them', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.kitchen.email)

    for (const [method, path] of ADMIN_ROUTES) {
      const res = await call(session, method, path)
      expect(res.status, `${method.toUpperCase()} ${path} as KITCHEN`).toBe(403)
    }
  })

  it('refuses a platform admin too — being ours does not make them staff', async () => {
    const tenant = await makeTenant()
    const { makeUser } = await import('../setup/factories.js')
    await makeUser({ role: Role.PLATFORM_ADMIN, email: 'plat@surface.test', restaurant: null })
    const session = await loginAs('plat@surface.test')
    expect(tenant.restaurant).toBeDefined()

    for (const [method, path] of ADMIN_ROUTES) {
      const res = await call(session, method, path)
      expect(res.status, `${method.toUpperCase()} ${path} as PLATFORM_ADMIN`).toBe(403)
    }
  })

  it('lets an owner through, so the list above is not just uniformly broken', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.owner.email)

    for (const path of [
      '/api/v1/app/menu/categories',
      '/api/v1/app/tables',
      '/api/v1/app/staff',
      '/api/v1/app/dashboard/stats',
    ]) {
      const res = await request(app).get(path).set(auth(session))
      expect(res.status, `GET ${path} as OWNER`).toBe(200)
    }
  })
})

describe('the surfaces those roles legitimately do have still work', () => {
  it('a cashier may read the menu, flip availability, and see the till board', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.cashier.email)

    const items = await request(app).get('/api/v1/app/menu/items').set(auth(session))
    expect(items.status).toBe(200)

    const board = await request(app).get('/api/v1/app/orders?board=cashier').set(auth(session))
    expect(board.status).toBe(200)
  })

  it('a kitchen user may read the menu and the kitchen board', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.kitchen.email)

    const items = await request(app).get('/api/v1/app/menu/items').set(auth(session))
    expect(items.status).toBe(200)

    const board = await request(app).get('/api/v1/app/orders?board=kitchen').set(auth(session))
    expect(board.status).toBe(200)
  })

  it('a kitchen user still cannot flip availability — that is the cashier’s', async () => {
    const tenant = await makeTenant()
    const session = await loginAs(tenant.kitchen.email)

    const res = await request(app)
      .patch(`/api/v1/app/menu/items/${SOME_ID}/availability`)
      .set(auth(session))
      .send({ isAvailable: false })

    expect(res.status).toBe(403)
  })
})
