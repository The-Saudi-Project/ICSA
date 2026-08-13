import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../src/modules/audit/auditLog.model.js'
import { UserModel } from '../src/modules/users/user.model.js'
import { makeRestaurant, makeUser, TEST_PASSWORD } from './setup/factories.js'
import { app, auth, loginAs } from './setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from './setup/mongo.js'

const NEW_PASSWORD = 'a-much-longer-new-password'

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

async function signedInUser(email = 'pw@a.test') {
  const restaurant = await makeRestaurant()
  const user = await makeUser({ restaurant, email })
  const session = await loginAs(email)
  return { user, session, email }
}

describe('change password', () => {
  it('changes the password and lets the user sign in with the new one', async () => {
    const { session, email } = await signedInUser()

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })

    expect(res.status).toBe(200)

    const withNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: NEW_PASSWORD })
    expect(withNew.status).toBe(200)

    const withOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
    expect(withOld.status).toBe(401)
  })

  it('requires the current password — a stolen access token is not enough', async () => {
    const { session } = await signedInUser()

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: 'not-the-right-one', newPassword: NEW_PASSWORD })

    expect(res.status).toBe(401)
  })

  it('rejects an unauthenticated caller', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(401)
  })

  it('rejects a new password that is too short', async () => {
    const { session } = await signedInUser()

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })

    expect(res.status).toBe(422)
  })

  it('rejects reusing the same password', async () => {
    const { session } = await signedInUser()

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })

    expect(res.status).toBe(400)
  })

  it('revokes every session, including the caller’s own', async () => {
    const { session } = await signedInUser()

    await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })

    // The access token it was changed with is now dead.
    const me = await request(app).get('/api/v1/auth/me').set(auth(session))
    expect(me.status).toBe(401)

    // So is the refresh cookie.
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookies)
    expect(refreshed.status).toBe(401)
  })

  it('clears mustChangePassword and writes an audit event', async () => {
    const restaurant = await makeRestaurant()
    const user = await makeUser({ restaurant, email: 'temp@a.test' })
    await UserModel.updateOne({ _id: user._id }, { $set: { mustChangePassword: true } })

    const session = await loginAs('temp@a.test')
    expect(session.user.mustChangePassword).toBe(true)

    await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })

    const reloaded = await UserModel.findById(user._id)
    expect(reloaded?.mustChangePassword).toBe(false)

    const event = await AuditLogModel.findOne({ action: AuditAction.PASSWORD_CHANGED })
    expect(event?.targetId).toBe(user._id.toString())
  })
})
