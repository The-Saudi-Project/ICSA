import { Role, RestaurantStatus, UserStatus } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REFRESH_COOKIE } from '../src/modules/auth/auth.routes.js'
import { RefreshTokenModel } from '../src/modules/auth/refreshToken.model.js'
import { AuditAction, AuditLogModel } from '../src/modules/audit/auditLog.model.js'
import { RestaurantModel } from '../src/modules/restaurants/restaurant.model.js'
import { UserModel } from '../src/modules/users/user.model.js'
import { makeRestaurant, makeUser, TEST_PASSWORD } from './setup/factories.js'
import { app, loginAs } from './setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from './setup/mongo.js'

const cookieValue = (cookies: string[], name: string): string | undefined =>
  cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0]?.split('=')[1]

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('Auth-01 login', () => {
  it('issues an access token and a refresh cookie', async () => {
    const restaurant = await makeRestaurant()
    const user = await makeUser({ restaurant, role: Role.OWNER, email: 'owner@a.test' })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@a.test', password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.user.id).toBe(user._id.toString())
    expect(res.body.user.restaurantId).toBe(restaurant._id.toString())

    const setCookie = res.headers['set-cookie'] as unknown as string[]
    const refreshCookie = setCookie.find((c) => c.startsWith(REFRESH_COOKIE))
    expect(refreshCookie).toBeDefined()
    expect(refreshCookie).toContain('HttpOnly')
    expect(refreshCookie).toContain('Path=/api/v1/auth')
    expect(refreshCookie).toMatch(/SameSite=Lax/i)
  })

  it('never returns the password hash or the refresh token in the body', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'owner@b.test' })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@b.test', password: TEST_PASSWORD })

    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/passwordHash/)
    expect(body).not.toMatch(/\$argon2/)
    expect(body).not.toMatch(/refreshToken/)
  })

  it('normalises email case', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'mixed@case.test' })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '  MiXeD@Case.TEST ', password: TEST_PASSWORD })

    expect(res.status).toBe(200)
  })

  it('stores the refresh token only as a hash', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'hash@a.test' })

    const session = await loginAs('hash@a.test')
    const raw = cookieValue(session.cookies, REFRESH_COOKIE)

    const stored = await RefreshTokenModel.findOne({})
    expect(stored).toBeTruthy()
    expect(stored?.tokenHash).not.toBe(raw)
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('writes a USER_LOGIN audit event', async () => {
    const restaurant = await makeRestaurant()
    const user = await makeUser({ restaurant, email: 'audit@a.test' })
    await loginAs('audit@a.test')

    const event = await AuditLogModel.findOne({ action: AuditAction.USER_LOGIN })
    expect(event).toBeTruthy()
    expect(event?.targetId).toBe(user._id.toString())
    expect(event?.restaurantId?.toString()).toBe(restaurant._id.toString())
  })
})

describe('Auth-02 login failures are indistinguishable', () => {
  const attempt = (email: string, password: string) =>
    request(app).post('/api/v1/auth/login').send({ email, password })

  it('returns the same 401 body for unknown email, wrong password, disabled user and suspended restaurant', async () => {
    const active = await makeRestaurant()
    await makeUser({ restaurant: active, email: 'good@a.test' })
    await makeUser({ restaurant: active, email: 'disabled@a.test', status: UserStatus.DISABLED })

    const suspended = await makeRestaurant({ status: RestaurantStatus.SUSPENDED })
    await makeUser({ restaurant: suspended, email: 'suspended@a.test' })

    const responses = await Promise.all([
      attempt('nobody@nowhere.test', TEST_PASSWORD),
      attempt('good@a.test', 'wrong-password-entirely'),
      attempt('disabled@a.test', TEST_PASSWORD),
      attempt('suspended@a.test', TEST_PASSWORD),
    ])

    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe('Invalid email or password')
    }

    // All four bodies identical apart from the request id.
    const shapes = responses.map((r) => ({ ...r.body.error, requestId: undefined }))
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1)
  })

  it('rejects a malformed body with 422, not 500', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a NoSQL operator in place of a string', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'inject@a.test' })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })

    expect(res.status).toBe(422)
  })
})

describe('Auth-03 account lockout', () => {
  it('locks the account after repeated failures and keeps rejecting the correct password', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'lock@a.test' })

    for (let i = 0; i < 8; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lock@a.test', password: `wrong-${i}` })
    }

    const locked = await UserModel.findOne({ email: 'lock@a.test' })
    expect(locked?.lockedUntil).toBeTruthy()
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now())

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lock@a.test', password: TEST_PASSWORD })
    expect(res.status).toBe(401)

    const lockEvent = await AuditLogModel.findOne({ action: AuditAction.USER_LOCKED })
    expect(lockEvent).toBeTruthy()
  })
})

describe('Auth-04 refresh rotation', () => {
  it('rotates the token and invalidates the previous one', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'rot@a.test' })
    const session = await loginAs('rot@a.test')
    const firstCookie = session.cookies

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie)
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.accessToken).toBeTruthy()

    const newCookie = refreshed.headers['set-cookie'] as unknown as string[]
    expect(cookieValue(newCookie, REFRESH_COOKIE)).not.toBe(
      cookieValue(firstCookie, REFRESH_COOKIE),
    )

    // The old token is spent.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie)
    expect(replay.status).toBe(401)
  })

  it('Auth-05 detects reuse and destroys the whole family', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'reuse@a.test' })
    const session = await loginAs('reuse@a.test')

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookies)
    const currentCookie = rotated.headers['set-cookie'] as unknown as string[]

    // An attacker replays the stolen, already-rotated token.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookies)
    expect(replay.status).toBe(401)

    // The legitimate client's current token is now dead too — containment.
    const afterBreach = await request(app).post('/api/v1/auth/refresh').set('Cookie', currentCookie)
    expect(afterBreach.status).toBe(401)

    const event = await AuditLogModel.findOne({ action: AuditAction.TOKEN_REUSE_DETECTED })
    expect(event).toBeTruthy()

    const live = await RefreshTokenModel.countDocuments({ revokedAt: null })
    expect(live).toBe(0)
  })

  it('rejects a refresh with no cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh')
    expect(res.status).toBe(401)
  })

  it('rejects a forged refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=totally-made-up-value`])
    expect(res.status).toBe(401)
  })

  it('refuses to refresh once the restaurant is suspended', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'susp@a.test' })
    const session = await loginAs('susp@a.test')

    await RestaurantModel.updateOne(
      { _id: restaurant._id },
      { $set: { status: RestaurantStatus.SUSPENDED } },
    )

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookies)
    expect(res.status).toBe(401)
  })
})

describe('Auth-06 logout and revocation', () => {
  it('logout revokes the family and clears the cookie', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'out@a.test' })
    const session = await loginAs('out@a.test')

    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', session.cookies)
    expect(res.status).toBe(204)

    const retry = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookies)
    expect(retry.status).toBe(401)
  })

  it('bumping tokenVersion invalidates a live access token immediately', async () => {
    const restaurant = await makeRestaurant()
    const user = await makeUser({ restaurant, email: 'rev@a.test' })
    const session = await loginAs('rev@a.test')

    const before = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
    expect(before.status).toBe(200)

    await UserModel.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } })

    const after = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
    expect(after.status).toBe(401)
  })

  it('disabling a user invalidates a live access token immediately', async () => {
    const restaurant = await makeRestaurant()
    const user = await makeUser({ restaurant, email: 'dis@a.test' })
    const session = await loginAs('dis@a.test')

    await UserModel.updateOne({ _id: user._id }, { $set: { status: UserStatus.DISABLED } })

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
    expect(res.status).toBe(401)
  })

  it('suspending the restaurant blocks its staff immediately', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'live@a.test' })
    const session = await loginAs('live@a.test')

    await RestaurantModel.updateOne(
      { _id: restaurant._id },
      { $set: { status: RestaurantStatus.SUSPENDED } },
    )

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
    expect(res.status).toBe(401)
  })
})

describe('Auth-07 token handling', () => {
  it('rejects a missing, malformed, or unsigned token', async () => {
    const none = await request(app).get('/api/v1/auth/me')
    expect(none.status).toBe(401)

    const junk = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer nonsense')
    expect(junk.status).toBe(401)

    // alg:none — the classic JWT downgrade. Algorithms are pinned to HS256.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({ sub: '0'.repeat(24), rid: null, role: 'OWNER', tv: 0 }),
    ).toString('base64url')
    const forged = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${header}.${payload}.`)
    expect(forged.status).toBe(401)
  })

  it('rejects a token whose signature was tampered with', async () => {
    const restaurant = await makeRestaurant()
    await makeUser({ restaurant, email: 'tamper@a.test' })
    const session = await loginAs('tamper@a.test')

    const parts = session.accessToken.split('.')
    const tampered = `${parts[0]}.${parts[1]}.${'x'.repeat(parts[2]!.length)}`

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tampered}`)
    expect(res.status).toBe(401)
  })
})
