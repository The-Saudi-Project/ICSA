/**
 * Staff management privilege rules.
 *
 * The interesting cases are all escalation attempts: can a manager promote
 * themselves, can a restaurant mint a platform admin, can someone lock their
 * own restaurant out by disabling the only owner.
 */

import { Role, UserStatus } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { UserModel } from '../../src/modules/users/user.model.js'
import { makeRestaurant, makeUser, TEST_PASSWORD } from '../setup/factories.js'
import { app, auth, loginAs } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

async function shop(prefix: string) {
  const restaurant = await makeRestaurant()
  const suffix = Math.random().toString(36).slice(2, 7)

  const ownerEmail = `owner-${prefix}-${suffix}@s.test`
  const ownerUser = await makeUser({ restaurant, role: Role.OWNER, email: ownerEmail })
  const owner = await loginAs(ownerEmail)

  const managerEmail = `manager-${prefix}-${suffix}@s.test`
  await makeUser({ restaurant, role: Role.MANAGER, email: managerEmail })
  const manager = await loginAs(managerEmail)

  return { restaurant, owner, ownerUser, manager, suffix }
}

const newStaff = (suffix: string, role: string) => ({
  email: `new-${role.toLowerCase()}-${suffix}-${Math.random().toString(36).slice(2, 6)}@s.test`,
  name: 'New Person',
  role,
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

describe('creating staff', () => {
  it('an owner creates a cashier and gets a one-time password', async () => {
    const s = await shop('A')

    const res = await request(app)
      .post('/api/v1/app/staff')
      .set(auth(s.owner))
      .send(newStaff(s.suffix, Role.CASHIER))

    expect(res.status).toBe(201)
    expect(res.body.temporaryPassword).toBeTruthy()
    expect(res.body.user.mustChangePassword).toBe(true)
    expect(res.body.user.restaurantId).toBe(s.restaurant._id.toString())
    expect(JSON.stringify(res.body)).not.toMatch(/\$argon2/)
    expect(res.headers['cache-control']).toContain('no-store')
  })

  it('the new person can sign in with it immediately', async () => {
    const s = await shop('A')
    const payload = newStaff(s.suffix, Role.KITCHEN)

    const created = await request(app).post('/api/v1/app/staff').set(auth(s.owner)).send(payload)

    const signIn = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: created.body.temporaryPassword })

    expect(signIn.status).toBe(200)
    expect(signIn.body.user.mustChangePassword).toBe(true)
  })

  it('nobody can create a PLATFORM_ADMIN', async () => {
    const s = await shop('A')

    const res = await request(app)
      .post('/api/v1/app/staff')
      .set(auth(s.owner))
      .send({ ...newStaff(s.suffix, Role.CASHIER), role: Role.PLATFORM_ADMIN })

    expect(res.status).toBe(422)
    expect(await UserModel.countDocuments({ role: Role.PLATFORM_ADMIN })).toBe(0)
  })

  it('a manager cannot create an owner or another manager', async () => {
    const s = await shop('A')

    for (const role of [Role.OWNER, Role.MANAGER]) {
      const res = await request(app)
        .post('/api/v1/app/staff')
        .set(auth(s.manager))
        .send(newStaff(s.suffix, role))
      expect(res.status, `manager creating ${role}`).toBe(403)
    }
  })

  it('a manager can create the junior roles', async () => {
    const s = await shop('A')

    for (const role of [Role.CASHIER, Role.KITCHEN, Role.WAITER]) {
      const res = await request(app)
        .post('/api/v1/app/staff')
        .set(auth(s.manager))
        .send(newStaff(s.suffix, role))
      expect(res.status, `manager creating ${role}`).toBe(201)
    }
  })

  it('cashier, kitchen and waiter cannot manage staff at all', async () => {
    const s = await shop('A')

    for (const role of [Role.CASHIER, Role.KITCHEN, Role.WAITER]) {
      const email = `${role.toLowerCase()}-deny-${s.suffix}@s.test`
      await makeUser({ restaurant: s.restaurant, role, email })
      const session = await loginAs(email)

      expect((await request(app).get('/api/v1/app/staff').set(auth(session))).status).toBe(403)
      expect(
        (
          await request(app)
            .post('/api/v1/app/staff')
            .set(auth(session))
            .send(newStaff(s.suffix, Role.CASHIER))
        ).status,
      ).toBe(403)
    }
  })
})

describe('privilege escalation is blocked', () => {
  it('a manager cannot promote themselves to owner', async () => {
    const s = await shop('A')
    const me = await UserModel.findOne({ _id: s.manager.user.id })

    const res = await request(app)
      .patch(`/api/v1/app/staff/${me!._id.toString()}`)
      .set(auth(s.manager))
      .send({ role: Role.OWNER })

    expect(res.status).toBe(403)
    const after = await UserModel.findById(me!._id)
    expect(after?.role).toBe(Role.MANAGER)
  })

  it('a manager cannot demote or disable the owner', async () => {
    const s = await shop('A')
    const ownerId = s.ownerUser._id.toString()

    const demote = await request(app)
      .patch(`/api/v1/app/staff/${ownerId}`)
      .set(auth(s.manager))
      .send({ role: Role.CASHIER })
    expect(demote.status).toBe(403)

    const disable = await request(app)
      .patch(`/api/v1/app/staff/${ownerId}`)
      .set(auth(s.manager))
      .send({ status: UserStatus.DISABLED })
    expect(disable.status).toBe(403)

    const after = await UserModel.findById(ownerId)
    expect(after?.role).toBe(Role.OWNER)
    expect(after?.status).toBe(UserStatus.ACTIVE)
  })

  it('nobody can change their own role or disable themselves', async () => {
    const s = await shop('A')
    const ownerId = s.ownerUser._id.toString()

    const role = await request(app)
      .patch(`/api/v1/app/staff/${ownerId}`)
      .set(auth(s.owner))
      .send({ role: Role.CASHIER })
    expect(role.status).toBe(400)

    const disable = await request(app)
      .patch(`/api/v1/app/staff/${ownerId}`)
      .set(auth(s.owner))
      .send({ status: UserStatus.DISABLED })
    expect(disable.status).toBe(400)
  })

  it('one restaurant cannot see or touch another restaurant’s staff', async () => {
    const a = await shop('A')
    const b = await shop('B')

    const list = await request(app).get('/api/v1/app/staff').set(auth(a.owner))
    const emails = list.body.staff.map((u: { email: string }) => u.email)
    expect(emails).not.toContain(b.owner.user.id)
    expect(JSON.stringify(list.body)).not.toContain(b.ownerUser.email)

    const patch = await request(app)
      .patch(`/api/v1/app/staff/${b.ownerUser._id.toString()}`)
      .set(auth(a.owner))
      .send({ name: 'Taken over' })
    expect(patch.status).toBe(404)
  })
})

describe('disabling and password reset', () => {
  it('disabling revokes their sessions immediately', async () => {
    const s = await shop('A')
    const email = `victim-${s.suffix}@s.test`
    const victim = await makeUser({ restaurant: s.restaurant, role: Role.CASHIER, email })
    const session = await loginAs(email)

    expect((await request(app).get('/api/v1/auth/me').set(auth(session))).status).toBe(200)

    const res = await request(app)
      .patch(`/api/v1/app/staff/${victim._id.toString()}`)
      .set(auth(s.owner))
      .send({ status: UserStatus.DISABLED })
    expect(res.status).toBe(200)

    expect((await request(app).get('/api/v1/auth/me').set(auth(session))).status).toBe(401)
    expect(await AuditLogModel.countDocuments({ action: AuditAction.STAFF_DISABLED })).toBe(1)
  })

  it('a password reset issues a new one and kills the old sessions', async () => {
    const s = await shop('A')
    const email = `forgot-${s.suffix}@s.test`
    const person = await makeUser({ restaurant: s.restaurant, role: Role.CASHIER, email })
    const session = await loginAs(email)

    const res = await request(app)
      .post(`/api/v1/app/staff/${person._id.toString()}/reset-password`)
      .set(auth(s.owner))

    expect(res.status).toBe(200)
    expect(res.body.temporaryPassword).toBeTruthy()

    // Old session dead, old password dead, new password works.
    expect((await request(app).get('/api/v1/auth/me').set(auth(session))).status).toBe(401)
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD })).status,
    ).toBe(401)
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: res.body.temporaryPassword })
      ).status,
    ).toBe(200)
  })

  it('a role change is audited with before and after', async () => {
    const s = await shop('A')
    const email = `promote-${s.suffix}@s.test`
    const person = await makeUser({ restaurant: s.restaurant, role: Role.WAITER, email })

    await request(app)
      .patch(`/api/v1/app/staff/${person._id.toString()}`)
      .set(auth(s.owner))
      .send({ role: Role.CASHIER })

    const event = await AuditLogModel.findOne({ action: AuditAction.STAFF_ROLE_CHANGED })
    expect((event?.metadata as Record<string, unknown>).from).toBe(Role.WAITER)
    expect((event?.metadata as Record<string, unknown>).to).toBe(Role.CASHIER)
  })
})
