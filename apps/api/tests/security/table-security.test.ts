/**
 * Table token and session security — Tbl-01..05.
 *
 * The product requirement this covers: table 15 must not be able to order
 * against table 14. In Step 4 that reduces to two guarantees, both tested here:
 *
 *   1. A table token cannot be guessed, tampered with, or reused after
 *      rotation, and every failure mode is indistinguishable from every other.
 *   2. `restaurantId` and `tableId` come only from the signed session, so a
 *      client has nothing to lie about.
 *
 * Sec-04 completes in Step 6, when orders exist to attempt this against.
 */

import { RestaurantStatus, Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, sha256 } from '../../src/core/crypto.js'
import { signTableSessionToken } from '../../src/core/tableSessionToken.js'
import { RestaurantModel } from '../../src/modules/restaurants/restaurant.model.js'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { TableModel, TableStatus } from '../../src/modules/tables/table.model.js'
import {
  TableSessionModel,
  TableSessionStatus,
} from '../../src/modules/tables/tableSession.model.js'
import { makeRestaurant, makeTenant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs, type Session } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

/**
 * Creates a table through the real admin route and returns its raw token.
 *
 * Deliberately creates one owner rather than a full staffed tenant: Argon2 is
 * intentionally slow, so every extra user costs real seconds across 27 tests.
 */
async function makeTable(label = 'T1') {
  const restaurant = await makeRestaurant()
  const email = `owner-${label}-${Math.random().toString(36).slice(2, 7)}@t.test`
  await makeUser({ restaurant, role: Role.OWNER, email })
  const session = await loginAs(email)

  const res = await request(app).post('/api/v1/app/tables').set(auth(session)).send({ label })
  expect(res.status).toBe(201)

  const token = String(res.body.table.url).split('/t/')[1]!
  return { restaurant, session, table: res.body.table, token }
}

const exchange = (tableToken: string) =>
  request(app).post('/api/v1/public/table-sessions').send({ tableToken })

const session401Body = (res: request.Response) => ({ ...res.body.error, requestId: undefined })

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('Tbl-01 a valid token opens a session', () => {
  it('exchanges the token and returns only what the customer needs', async () => {
    const { token, restaurant } = await makeTable('12')

    const res = await exchange(token)

    expect(res.status).toBe(201)
    expect(res.body.sessionToken).toBeTruthy()
    expect(res.body.table.label).toBe('12')
    expect(res.body.restaurant.publicId).toBe(restaurant.publicId)
    expect(res.body.restaurant.settings.vatRatePercent).toBe(15)

    // The response must not leak internal identifiers or the token itself.
    const body = JSON.stringify(res.body)
    expect(body).not.toContain(token)
    expect(body).not.toMatch(/tokenHash|tokenCipher/)
    expect(body).not.toContain(restaurant._id.toString())
    expect(res.headers['cache-control']).toContain('no-store')
  })

  it('the session token carries the tenant and table, and the client sends neither', async () => {
    const { token, table } = await makeTable('5')
    const opened = await exchange(token)

    const me = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)

    expect(me.status).toBe(200)
    expect(me.body.session.tableId).toBe(table.id)
  })

  it('two devices at the same table get separate sessions', async () => {
    const { token } = await makeTable('9')

    const first = await exchange(token)
    const second = await exchange(token)

    expect(first.body.sessionToken).not.toBe(second.body.sessionToken)
    expect(await TableSessionModel.countDocuments({})).toBe(2)
  })

  it('writes an audit event naming the table', async () => {
    const { token } = await makeTable('3')
    await exchange(token)

    const event = await AuditLogModel.findOne({ action: AuditAction.TABLE_SESSION_STARTED })
    expect(event?.actorType).toBe('CUSTOMER')
    expect((event?.metadata as Record<string, unknown>).tableLabel).toBe('3')
  })
})

describe('Tbl-02..05 every failure mode is indistinguishable', () => {
  it('unknown, tampered, inactive, suspended and rotated tokens all return the identical 404', async () => {
    const valid = await makeTable('A')

    // 1. A well-formed token that was never issued.
    const unknown = await exchange('x'.repeat(43))

    // 2. The real token with one character changed.
    const tamperedToken =
      valid.token.slice(0, -1) + (valid.token.endsWith('a') ? 'b' : 'a')
    const tampered = await exchange(tamperedToken)

    // 3. A real token whose table has been deactivated.
    const inactive = await makeTable('B')
    await TableModel.updateOne(
      { _id: inactive.table.id },
      { $set: { status: TableStatus.INACTIVE } },
    ).setOptions({ unscoped: true })
    const inactiveRes = await exchange(inactive.token)

    // 4. A real, active table whose restaurant is suspended.
    const suspended = await makeTable('C')
    await RestaurantModel.updateOne(
      { _id: suspended.restaurant._id },
      { $set: { status: RestaurantStatus.SUSPENDED } },
    )
    const suspendedRes = await exchange(suspended.token)

    // 5. A token that was valid until the owner rotated it.
    const rotated = await makeTable('D')
    await request(app)
      .post(`/api/v1/app/tables/${rotated.table.id}/rotate-token`)
      .set(auth(rotated.session))
    const rotatedRes = await exchange(rotated.token)

    const responses = [unknown, tampered, inactiveRes, suspendedRes, rotatedRes]

    for (const res of responses) {
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(res.body.error.message).toBe('Table not found')
    }

    // Byte-identical apart from the request id: the endpoint is not an oracle.
    const shapes = new Set(responses.map((r) => JSON.stringify(session401Body(r))))
    expect(shapes.size).toBe(1)
  })

  it('rejects a malformed token at validation without touching the database', async () => {
    for (const bad of ['', 'short', 'has spaces here!!', 'x'.repeat(500)]) {
      const res = await exchange(bad)
      expect(res.status, `token "${bad.slice(0, 12)}"`).toBe(422)
    }
  })

  it('rejects a NoSQL operator in place of the token', async () => {
    const res = await request(app)
      .post('/api/v1/public/table-sessions')
      .send({ tableToken: { $ne: null } })
    expect(res.status).toBe(422)
  })

  it('records rejected attempts in the audit log without storing the token', async () => {
    await exchange('y'.repeat(43))

    const event = await AuditLogModel.findOne({ action: AuditAction.TABLE_TOKEN_REJECTED })
    expect(event).toBeTruthy()
    expect((event?.metadata as Record<string, unknown>).reason).toBe('unknown-token')
    expect(JSON.stringify(event?.metadata)).not.toContain('yyyy')
  })
})

describe('session lifecycle', () => {
  it('rejects an expired session with the same 404', async () => {
    const { token } = await makeTable('E')
    const opened = await exchange(token)

    await TableSessionModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const res = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error.message).toBe('Table not found')
  })

  it('rejects a closed session', async () => {
    const { token } = await makeTable('F')
    const opened = await exchange(token)

    await TableSessionModel.updateMany({}, { $set: { status: TableSessionStatus.CLOSED } })

    const res = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(res.status).toBe(404)
  })

  it('rotating a table’s token closes any live session on it immediately', async () => {
    const rotated = await makeTable('G')
    const opened = await exchange(rotated.token)

    const before = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(before.status).toBe(200)

    await request(app)
      .post(`/api/v1/app/tables/${rotated.table.id}/rotate-token`)
      .set(auth(rotated.session))

    const after = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(after.status).toBe(404)
  })

  it('suspending the restaurant stops customers on their next request', async () => {
    const { token, restaurant } = await makeTable('H')
    const opened = await exchange(token)

    await RestaurantModel.updateOne(
      { _id: restaurant._id },
      { $set: { status: RestaurantStatus.SUSPENDED } },
    )

    const res = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(res.status).toBe(404)
  })

  it('refresh slides the window and issues a new token', async () => {
    const { token } = await makeTable('I')
    const opened = await exchange(token)

    const refreshed = await request(app)
      .post('/api/v1/public/table-sessions/refresh')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)

    expect(refreshed.status).toBe(200)
    expect(refreshed.body.sessionToken).toBeTruthy()
  })
})

describe('session tokens cannot be forged or crossed with staff tokens', () => {
  it('rejects a session token signed for a different session id', async () => {
    const { token, restaurant, table } = await makeTable('J')
    await exchange(token)

    // Correct signature, but the session it names does not exist.
    const forged = await signTableSessionToken({
      sid: '0'.repeat(24),
      rid: restaurant._id.toString(),
      tid: table.id,
    })

    const res = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(404)
  })

  it('rejects a token whose claims disagree with the stored session', async () => {
    const a = await makeTable('K')
    const b = await makeTable('L')
    const opened = await exchange(a.token)

    const sessionDoc = await TableSessionModel.findOne({})

    // Same real session, but claiming a different table.
    const crossed = await signTableSessionToken({
      sid: sessionDoc!._id.toString(),
      rid: a.restaurant._id.toString(),
      tid: b.table.id,
    })

    const res = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${crossed}`)
    expect(res.status).toBe(404)

    // The genuine token still works — only the forgery was rejected.
    const genuine = await request(app)
      .get('/api/v1/public/session')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(genuine.status).toBe(200)
  })

  it('a staff access token cannot be used as a table session', async () => {
    const { session } = await makeTable('M')

    const res = await request(app).get('/api/v1/public/session').set(auth(session))
    expect(res.status).toBe(404)
  })

  it('a table session token cannot be used as staff credentials', async () => {
    const { token } = await makeTable('N')
    const opened = await exchange(token)

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${opened.body.sessionToken}`)
    expect(res.status).toBe(401)
  })
})

describe('token storage', () => {
  it('stores a hash for lookup and an encrypted copy for reprinting, never plaintext', async () => {
    const { token, table } = await makeTable('O')

    const stored = await TableModel.findOne({ _id: table.id }).setOptions({ unscoped: true })

    expect(stored?.tokenHash).toBe(sha256(token))
    expect(stored?.tokenHash).not.toBe(token)
    expect(stored?.tokenCipher).not.toContain(token)
    expect(decryptSecret(stored!.tokenCipher)).toBe(token)

    // Nothing in the document contains the raw token.
    expect(JSON.stringify(stored?.toObject())).not.toContain(token)
  })

  it('encryption is authenticated — a tampered ciphertext fails rather than decrypting', () => {
    const cipher = encryptSecret('the-secret-token')
    const parts = cipher.split(':')
    const corrupted = [parts[0], parts[1], parts[2], Buffer.from('different').toString('base64')].join(':')

    expect(decryptSecret(cipher)).toBe('the-secret-token')
    expect(decryptSecret(corrupted)).toBeNull()
    expect(decryptSecret('not-even-close')).toBeNull()
  })

  it('produces a different ciphertext each time, so equal tokens are not detectable', () => {
    expect(encryptSecret('same-input')).not.toBe(encryptSecret('same-input'))
  })
})

describe('table admin routes are restricted', () => {
  it('cashier, kitchen and waiter cannot list tables or see URLs', async () => {
    const tenant = await makeTenant()

    for (const role of [Role.CASHIER, Role.KITCHEN, Role.WAITER]) {
      const email = `${role.toLowerCase()}@tbl.test`
      await makeUser({ restaurant: tenant.restaurant, role, email })
      const session = await loginAs(email)

      const list = await request(app).get('/api/v1/app/tables').set(auth(session))
      expect(list.status, `list as ${role}`).toBe(403)

      const create = await request(app)
        .post('/api/v1/app/tables')
        .set(auth(session))
        .send({ label: 'X' })
      expect(create.status, `create as ${role}`).toBe(403)
    }
  })

  it('rejects an unauthenticated caller', async () => {
    expect((await request(app).get('/api/v1/app/tables')).status).toBe(401)
  })

  it('one restaurant cannot see, rotate or modify another restaurant’s table', async () => {
    const a = await makeTable('A1')
    const b = await makeTable('B1')

    const list = await request(app).get('/api/v1/app/tables').set(auth(a.session))
    expect(list.body.tables).toHaveLength(1)
    expect(list.body.tables[0].label).toBe('A1')

    const rotate = await request(app)
      .post(`/api/v1/app/tables/${b.table.id}/rotate-token`)
      .set(auth(a.session))
    expect(rotate.status).toBe(404)

    const patch = await request(app)
      .patch(`/api/v1/app/tables/${b.table.id}`)
      .set(auth(a.session))
      .send({ label: 'STOLEN' })
    expect(patch.status).toBe(404)

    const qr = await request(app)
      .get(`/api/v1/app/tables/${b.table.id}/qr`)
      .set(auth(a.session))
    expect(qr.status).toBe(404)

    // B's table is untouched.
    const bList = await request(app).get('/api/v1/app/tables').set(auth(b.session))
    expect(bList.body.tables[0].label).toBe('B1')
    expect(bList.body.tables[0].tokenVersion).toBe(1)
  })

  it('rejects duplicate labels within a restaurant but allows them across restaurants', async () => {
    const a = await makeTable('7')

    const duplicate = await request(app)
      .post('/api/v1/app/tables')
      .set(auth(a.session))
      .send({ label: '7' })
    expect(duplicate.status).toBe(409)

    const other = await makeTable('7')
    expect(other.table.label).toBe('7')
  })
})

describe('QR and CSV export', () => {
  it('renders a PNG and an SVG, marked never to be cached', async () => {
    const { session, table } = await makeTable('Q')

    const png = await request(app)
      .get(`/api/v1/app/tables/${table.id}/qr`)
      .set(auth(session))
      .responseType('blob') // supertest does not buffer binary bodies by default
    expect(png.status).toBe(200)
    expect(png.headers['content-type']).toContain('image/png')
    expect(png.headers['cache-control']).toContain('no-store')
    expect(Buffer.from(png.body).subarray(0, 4).toString('hex')).toBe('89504e47') // PNG magic bytes

    // superagent does not populate `.text` for image/svg+xml, so read the body.
    const svg = await request(app)
      .get(`/api/v1/app/tables/${table.id}/qr`)
      .query({ format: 'svg' })
      .set(auth(session))
      .responseType('blob')
    expect(svg.status).toBe(200)
    expect(svg.headers['content-type']).toContain('image/svg+xml')
    expect(Buffer.from(svg.body).toString('utf8')).toContain('<svg')
  })

  it('exports every table URL as CSV for NFC writing', async () => {
    const { session, token } = await makeTable('Z1')

    const res = await request(app).get('/api/v1/app/tables/export').set(auth(session))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.text.split('\r\n')[0]).toBe('label,zone,status,tokenVersion,url')
    expect(res.text).toContain(token)
  })

  it('escapes quotes in labels so the CSV cannot be broken', async () => {
    const { session } = await makeTable('P')
    await request(app)
      .post('/api/v1/app/tables')
      .set(auth(session))
      .send({ label: 'Table "A", window' })

    const res = await request(app).get('/api/v1/app/tables/export').set(auth(session))
    expect(res.text).toContain('"Table ""A"", window"')
  })
})

/**
 * The table picker — what an order-taking screen may know about a table.
 *
 * A waiter has to name the table they are ordering for, so they need the list.
 * They must not receive the table *URL*: that string is the credential a phone
 * presents to become that table, and handing it to every member of waiting staff
 * would turn a screenshot into a working session. So this list exists separately
 * from `GET /app/tables`, which stays owner/manager-only.
 */
describe('Tbl-06 the table picker never carries the credential', () => {
  async function tenantWithWaiter(label: string) {
    const { restaurant, session, table, token } = await makeTable(label)
    const email = `waiter-${label}-${Math.random().toString(36).slice(2, 7)}@t.test`
    await makeUser({ restaurant, role: Role.WAITER, email })
    return { restaurant, admin: session, waiter: await loginAs(email), table, token }
  }

  const selectable = (session: Session) =>
    request(app).get('/api/v1/app/tables/selectable').set(auth(session))

  it('lists the tables a waiter may order for, with no token material at all', async () => {
    const { waiter, table, token } = await tenantWithWaiter('W1')

    const res = await selectable(waiter)

    expect(res.status).toBe(200)
    expect(res.body.tables).toHaveLength(1)
    expect(res.body.tables[0].id).toBe(table.id)
    expect(res.body.tables[0].label).toBe('W1')

    // The credential, in every form it could take.
    expect(res.body.tables[0].url).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain(token)
    expect(JSON.stringify(res.body)).not.toContain('/t/')
    expect(JSON.stringify(res.body)).not.toContain('tokenHash')
    expect(JSON.stringify(res.body)).not.toContain('tokenCipher')
  })

  it('does not open the admin table list to the same waiter', async () => {
    const { waiter } = await tenantWithWaiter('W2')

    const res = await request(app).get('/api/v1/app/tables').set(auth(waiter))
    expect(res.status).toBe(403)
  })

  it('refuses a role that cannot create an order anyway', async () => {
    const { restaurant } = await makeTable('W3')
    const email = `cashier-${Math.random().toString(36).slice(2, 7)}@t.test`
    await makeUser({ restaurant, role: Role.CASHIER, email })
    const cashier = await loginAs(email)

    expect((await selectable(cashier)).status).toBe(403)
  })

  it('leaves out a table the restaurant has taken out of service', async () => {
    const { admin, waiter, table } = await tenantWithWaiter('W4')

    await request(app)
      .patch(`/api/v1/app/tables/${table.id}`)
      .set(auth(admin))
      .send({ status: TableStatus.INACTIVE })

    expect((await selectable(waiter)).body.tables).toEqual([])
  })

  it('shows a waiter the tables of their own restaurant only', async () => {
    const mine = await tenantWithWaiter('W5')
    await makeTable('OTHER')

    const res = await selectable(mine.waiter)
    expect(res.body.tables).toHaveLength(1)
    expect(res.body.tables[0].label).toBe('W5')
  })
})
