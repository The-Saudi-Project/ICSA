/**
 * The public contact form — the only unauthenticated write in the product that
 * is not a customer at a table.
 *
 * Three properties are pinned here. The form must accept a genuine enquiry; it
 * must reveal nothing in its reply, because a response carrying an id or a count
 * hands a scraper a way to measure our pipeline; and the resulting list of
 * restaurant owners' names and phone numbers must be reachable by nobody except
 * a platform admin.
 */

import { Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { LeadModel, LeadStatus } from '../../src/modules/leads/lead.model.js'
import { makeTenant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

const VALID = {
  restaurantName: 'Najd Grill',
  contactName: 'Layla',
  phone: '+966500000000',
  email: 'owner@najd.test',
  city: 'Riyadh',
  branches: 3,
  message: 'We have four branches and want self-ordering on every table.',
  locale: 'ar',
}

const submit = (body: Record<string, unknown>) => request(app).post('/api/v1/leads').send(body)

async function platformSession() {
  await makeUser({ role: Role.PLATFORM_ADMIN, email: 'plat@leads.test', restaurant: null })
  return loginAs('plat@leads.test')
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

describe('the public contact form', () => {
  it('accepts an enquiry and stores it', async () => {
    const res = await submit(VALID)

    expect(res.status).toBe(201)

    const stored = await LeadModel.findOne({ phone: VALID.phone })
    expect(stored?.restaurantName).toBe('Najd Grill')
    expect(stored?.branches).toBe(3)
    expect(stored?.locale).toBe('ar')
    expect(stored?.status).toBe(LeadStatus.NEW)
  })

  it('says nothing back — no id, no count, no echo of the message', async () => {
    const res = await submit(VALID)

    expect(res.body).toEqual({ received: true })
    expect(JSON.stringify(res.body)).not.toContain('Najd')
  })

  it('stores the address as a hash, never in the clear', async () => {
    await submit(VALID)

    const stored = await LeadModel.findOne({ phone: VALID.phone })
    expect(stored?.ipHash ?? '').not.toContain('127.0.0.1')
    expect(stored?.ipHash ?? '').not.toContain('::ffff')
  })

  /** 422, not 400 — the shape the error handler gives every Zod failure. */
  it('refuses a malformed or oversized submission', async () => {
    expect((await submit({ contactName: 'x' })).status).toBe(422)
    expect((await submit({ ...VALID, restaurantName: 'a' })).status).toBe(422)
    expect((await submit({ ...VALID, message: 'x'.repeat(2001) })).status).toBe(422)
    expect((await submit({ ...VALID, email: 'not-an-email' })).status).toBe(422)

    expect(await LeadModel.countDocuments({})).toBe(0)
  })

  it('swallows a bot silently — the honeypot answers 201 and stores nothing', async () => {
    const res = await submit({ ...VALID, website: 'http://spam.example' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ received: true })
    expect(await LeadModel.countDocuments({})).toBe(0)
  })
})

describe('the platform inbox', () => {
  it('is refused to every restaurant role', async () => {
    const tenant = await makeTenant()
    await submit(VALID)

    for (const email of [tenant.owner.email, tenant.cashier.email, tenant.kitchen.email]) {
      const session = await loginAs(email)
      const list = await request(app).get('/api/v1/platform/leads').set(auth(session))
      expect(list.status, `GET /platform/leads as ${email}`).toBe(403)
    }
  })

  it('is refused to an anonymous request', async () => {
    await submit(VALID)
    expect((await request(app).get('/api/v1/platform/leads')).status).toBe(401)
  })

  it('lists enquiries for a platform admin, newest first, uncacheable', async () => {
    await submit(VALID)
    await submit({ ...VALID, restaurantName: 'Second Kitchen', phone: '+966500000001' })

    const session = await platformSession()
    const res = await request(app).get('/api/v1/platform/leads').set(auth(session))

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body.total).toBe(2)
    expect(res.body.leads[0].restaurantName).toBe('Second Kitchen')
    // The hashed address is ours, not something the inbox needs to show.
    expect(res.body.leads[0].ipHash).toBeUndefined()
  })

  it('triages a lead and records who did it', async () => {
    await submit(VALID)
    const lead = await LeadModel.findOne({})
    const session = await platformSession()

    const res = await request(app)
      .patch(`/api/v1/platform/leads/${lead!._id.toString()}/status`)
      .set(auth(session))
      .send({ status: LeadStatus.CONTACTED })

    expect(res.status).toBe(200)
    expect(res.body.lead.status).toBe(LeadStatus.CONTACTED)

    const audited = await AuditLogModel.findOne({ action: AuditAction.LEAD_STATUS_CHANGED })
    expect(audited?.targetId).toBe(lead!._id.toString())
  })

  it('refuses a status that is not one of ours', async () => {
    await submit(VALID)
    const lead = await LeadModel.findOne({})
    const session = await platformSession()

    const res = await request(app)
      .patch(`/api/v1/platform/leads/${lead!._id.toString()}/status`)
      .set(auth(session))
      .send({ status: 'DELETED' })

    expect(res.status).toBe(422)
  })
})
