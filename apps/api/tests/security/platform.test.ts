/**
 * Platform-admin boundary.
 *
 * Two directions matter, and both are tested:
 *  - a platform admin may legitimately act across tenants;
 *  - nobody else may reach these routes at all, whatever their restaurant role.
 */

import { RestaurantStatus, Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { RestaurantModel } from '../../src/modules/restaurants/restaurant.model.js'
import { UserModel } from '../../src/modules/users/user.model.js'
import { makeTenant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

const PLATFORM_EMAIL = 'platform@rw.test'

async function platformSession() {
  await makeUser({ role: Role.PLATFORM_ADMIN, email: PLATFORM_EMAIL, restaurant: null })
  return loginAs(PLATFORM_EMAIL)
}

const validPayload = () => ({
  name: { en: 'Test Kitchen', ar: 'مطبخ' },
  slug: `kitchen-${Math.random().toString(36).slice(2, 8)}`,
  owner: { email: `owner-${Math.random().toString(36).slice(2, 8)}@x.test`, name: 'Owner One' },
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

describe('platform routes are closed to everyone but us', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/v1/platform/restaurants')
    expect(res.status).toBe(401)
  })

  it('rejects every restaurant role with 403', async () => {
    const tenant = await makeTenant()

    for (const role of [Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN, Role.WAITER]) {
      const email = `${role.toLowerCase()}@deny.test`
      await makeUser({ restaurant: tenant.restaurant, role, email })
      const session = await loginAs(email)

      const list = await request(app).get('/api/v1/platform/restaurants').set(auth(session))
      expect(list.status, `GET as ${role}`).toBe(403)

      const create = await request(app)
        .post('/api/v1/platform/restaurants')
        .set(auth(session))
        .send(validPayload())
      expect(create.status, `POST as ${role}`).toBe(403)

      const audit = await request(app).get('/api/v1/platform/audit').set(auth(session))
      expect(audit.status, `audit as ${role}`).toBe(403)
    }
  })

  it('an owner cannot suspend anyone, including themselves', async () => {
    const tenant = await makeTenant()
    await makeUser({ restaurant: tenant.restaurant, role: Role.OWNER, email: 'o@deny.test' })
    const session = await loginAs('o@deny.test')

    const res = await request(app)
      .patch(`/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/status`)
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED })

    expect(res.status).toBe(403)
  })
})

describe('creating a restaurant', () => {
  it('creates the tenant and its first owner, and returns a one-time password', async () => {
    const session = await platformSession()
    const payload = validPayload()

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body.restaurant.slug).toBe(payload.slug)
    expect(res.body.owner.email).toBe(payload.owner.email)
    expect(res.body.temporaryPassword).toBeTruthy()
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(20)

    const owner = await UserModel.findOne({ email: payload.owner.email })
    expect(owner?.role).toBe(Role.OWNER)
    expect(owner?.mustChangePassword).toBe(true)
    expect(owner?.restaurantId?.toString()).toBe(res.body.restaurant.id)
  })

  it('the new owner can immediately log in with the temporary password', async () => {
    const session = await platformSession()
    const payload = validPayload()

    const created = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload)

    const ownerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.owner.email, password: created.body.temporaryPassword })

    expect(ownerLogin.status).toBe(200)
    expect(ownerLogin.body.user.mustChangePassword).toBe(true)
    expect(ownerLogin.body.user.restaurantId).toBe(created.body.restaurant.id)
  })

  it('never stores or echoes the temporary password as a hash', async () => {
    const session = await platformSession()
    const payload = validPayload()

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload)

    expect(JSON.stringify(res.body)).not.toMatch(/\$argon2/)

    const owner = await UserModel.findOne({ email: payload.owner.email }).select('+passwordHash')
    expect(owner?.passwordHash).not.toBe(res.body.temporaryPassword)
    expect(owner?.passwordHash).toMatch(/^\$argon2/)
  })

  it('rejects a duplicate slug and a duplicate email with 409', async () => {
    const session = await platformSession()
    const payload = validPayload()

    await request(app).post('/api/v1/platform/restaurants').set(auth(session)).send(payload)

    const sameSlug = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send({ ...payload, owner: { ...payload.owner, email: 'different@x.test' } })
    expect(sameSlug.status).toBe(409)

    const sameEmail = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send({ ...payload, slug: `other-${Date.now().toString(36)}` })
    expect(sameEmail.status).toBe(409)
  })

  it('rejects reserved and malformed slugs', async () => {
    const session = await platformSession()

    for (const slug of ['api', 'admin', 'platform', 't', 'has space', 'double--hyphen', 'ab', '-lead']) {
      const res = await request(app)
        .post('/api/v1/platform/restaurants')
        .set(auth(session))
        .send({ ...validPayload(), slug })
      expect(res.status, `slug "${slug}"`).toBe(422)
    }
  })

  it('normalises slug case rather than rejecting it', async () => {
    const session = await platformSession()

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send({ ...validPayload(), slug: 'Burger-Palace' })

    expect(res.status).toBe(201)
    expect(res.body.restaurant.slug).toBe('burger-palace')

    // Which means a differently-cased duplicate is still a conflict.
    const duplicate = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send({ ...validPayload(), slug: 'BURGER-PALACE' })
    expect(duplicate.status).toBe(409)
  })

  it('leaves no orphan restaurant when owner creation fails', async () => {
    const session = await platformSession()
    const payload = validPayload()

    // Take the email first, so the owner insert fails after the restaurant exists.
    const tenant = await makeTenant()
    await makeUser({ restaurant: tenant.restaurant, email: payload.owner.email })

    const res = await request(app)
      .post('/api/v1/platform/restaurants')
      .set(auth(session))
      .send(payload)
    expect(res.status).toBe(409)

    // The pre-check catches this case; the rollback covers the race. Either
    // way, no restaurant with that slug may survive.
    expect(await RestaurantModel.countDocuments({ slug: payload.slug })).toBe(0)
  })

  it('writes audit events naming the platform admin', async () => {
    const session = await platformSession()
    const payload = validPayload()

    await request(app).post('/api/v1/platform/restaurants').set(auth(session)).send(payload)

    const event = await AuditLogModel.findOne({ action: AuditAction.RESTAURANT_CREATED })
    expect(event).toBeTruthy()
    expect(event?.actorRole).toBe(Role.PLATFORM_ADMIN)
    expect(event?.actorUserId?.toString()).toBe(session.user.id)
    expect((event?.metadata as Record<string, unknown>).slug).toBe(payload.slug)
  })
})

describe('suspension', () => {
  it('blocks the restaurant’s staff on their very next request', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()
    await makeUser({ restaurant: tenant.restaurant, email: 'staff@susp.test' })
    const staff = await loginAs('staff@susp.test')

    expect((await request(app).get('/api/v1/auth/me').set(auth(staff))).status).toBe(200)

    const suspend = await request(app)
      .patch(`/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/status`)
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED, reason: 'non-payment' })
    expect(suspend.status).toBe(200)

    expect((await request(app).get('/api/v1/auth/me').set(auth(staff))).status).toBe(401)
  })

  it('reactivation restores access without forcing a new login', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()
    await makeUser({ restaurant: tenant.restaurant, email: 'back@susp.test' })
    const staff = await loginAs('back@susp.test')
    const id = tenant.restaurant._id.toString()

    await request(app)
      .patch(`/api/v1/platform/restaurants/${id}/status`)
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED })

    await request(app)
      .patch(`/api/v1/platform/restaurants/${id}/status`)
      .set(auth(session))
      .send({ status: RestaurantStatus.ACTIVE })

    expect((await request(app).get('/api/v1/auth/me').set(auth(staff))).status).toBe(200)
  })

  it('records the reason in the audit log', async () => {
    const session = await platformSession()
    const tenant = await makeTenant()

    await request(app)
      .patch(`/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/status`)
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED, reason: 'trial expired' })

    const event = await AuditLogModel.findOne({ action: AuditAction.RESTAURANT_SUSPENDED })
    expect((event?.metadata as Record<string, unknown>).reason).toBe('trial expired')
  })

  it('returns 404 for an unknown or malformed restaurant id', async () => {
    const session = await platformSession()

    const unknown = await request(app)
      .patch('/api/v1/platform/restaurants/000000000000000000000000/status')
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED })
    expect(unknown.status).toBe(404)

    const malformed = await request(app)
      .patch('/api/v1/platform/restaurants/not-an-id/status')
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED })
    expect(malformed.status).toBe(422)
  })
})

describe('listing and audit', () => {
  it('lists every tenant with a staff count', async () => {
    const session = await platformSession()
    await makeTenant()
    await makeTenant()

    const res = await request(app).get('/api/v1/platform/restaurants').set(auth(session))

    expect(res.status).toBe(200)
    expect(res.body.restaurants).toHaveLength(2)
    expect(res.body.restaurants[0].staffCount).toBe(3)
  })

  it('filters by status', async () => {
    const session = await platformSession()
    const active = await makeTenant()
    await makeTenant()

    await request(app)
      .patch(`/api/v1/platform/restaurants/${active.restaurant._id.toString()}/status`)
      .set(auth(session))
      .send({ status: RestaurantStatus.SUSPENDED })

    const res = await request(app)
      .get('/api/v1/platform/restaurants')
      .query({ status: RestaurantStatus.SUSPENDED })
      .set(auth(session))

    expect(res.body.restaurants).toHaveLength(1)
  })

  it('shows audit events across all tenants, and can filter to one', async () => {
    const session = await platformSession()
    const a = await makeTenant()
    await makeUser({ restaurant: a.restaurant, email: 'a-login@x.test' })
    await loginAs('a-login@x.test')

    const all = await request(app).get('/api/v1/platform/audit').set(auth(session))
    expect(all.status).toBe(200)
    expect(all.body.events.length).toBeGreaterThan(0)

    const filtered = await request(app)
      .get('/api/v1/platform/audit')
      .query({ restaurantId: a.restaurant._id.toString(), action: AuditAction.USER_LOGIN })
      .set(auth(session))

    expect(filtered.body.events).toHaveLength(1)
    expect(filtered.body.events[0].action).toBe(AuditAction.USER_LOGIN)
  })
})
