/**
 * The restaurant settings API.
 *
 * Two properties matter here and nothing else really does.
 *
 * **Isolation.** The route is `/app/restaurant` — singular, no `:id` — so the
 * tenant can only come from the token. That is easy to believe and worth
 * proving anyway, because the whole point of the shape is that there is no
 * parameter to tamper with, and a future refactor that "helpfully" adds one
 * would sail past every other test in the suite.
 *
 * **The money split.** A restaurant may set its own service charge, up to a cap.
 * It may not set its own VAT rate — that is ZATCA's number, not a business
 * preference, and a wrong one under-collects tax on every order. The schema
 * strips it; these tests prove the strip survives the round trip to the database
 * rather than merely passing validation.
 */

import { Role } from '@rw/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditAction, AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { RestaurantModel } from '../../src/modules/restaurants/restaurant.model.js'
import { makeTenant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs } from '../setup/http.js'
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

const SETTINGS = '/api/v1/app/restaurant'

async function ownerOf(slug?: string) {
  const tenant = await makeTenant(slug)
  const session = await loginAs(tenant.owner.email)
  return { ...tenant, session }
}

describe('reading your own restaurant', () => {
  it('returns the caller’s restaurant, chosen by the token and nothing else', async () => {
    const a = await ownerOf()
    await ownerOf() // a second tenant that must never appear

    const res = await request(app).get(SETTINGS).set(auth(a.session))

    expect(res.status).toBe(200)
    expect(res.body.restaurant.id).toBe(a.restaurant._id.toString())
    expect(res.body.restaurant.slug).toBe(a.restaurant.slug)
  })

  it('shows the VAT rate even though it cannot be changed here', async () => {
    const a = await ownerOf()

    const res = await request(app).get(SETTINGS).set(auth(a.session))

    // An owner who cannot see the rate cannot reconcile their own totals.
    expect(res.body.restaurant.settings.vatRatePercent).toBe(15)
    expect(res.body.restaurant.editable.finance).toContain('vatRatePercent')
    expect(res.body.restaurant.editable.settings).not.toContain('vatRatePercent')
  })

  it('is refused without authentication', async () => {
    expect((await request(app).get(SETTINGS)).status).toBe(401)
  })
})

describe('tenant isolation', () => {
  /**
   * There is no id in the path or the body, so the only way to aim this at
   * another restaurant is to invent one. Each of these is an attempt to smuggle
   * a tenant in; all of them must change the caller's own record or nothing.
   */
  it('ignores every attempt to name another restaurant in the body', async () => {
    const a = await ownerOf()
    const b = await ownerOf()

    const res = await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({
        city: 'Riyadh',
        restaurantId: b.restaurant._id.toString(),
        _id: b.restaurant._id.toString(),
        id: b.restaurant._id.toString(),
        slug: b.restaurant.slug,
      })

    expect(res.status).toBe(200)

    const [mine, theirs] = await Promise.all([
      RestaurantModel.findById(a.restaurant._id),
      RestaurantModel.findById(b.restaurant._id),
    ])

    expect(mine?.city).toBe('Riyadh')
    // Untouched: not the city, and not the slug it tried to steal.
    expect(theirs?.city).toBeFalsy()
    expect(theirs?.slug).toBe(b.restaurant.slug)
    expect(mine?.slug).toBe(a.restaurant.slug)
  })

  it('never lets one restaurant’s settings change another’s', async () => {
    const a = await ownerOf()
    const b = await ownerOf()

    await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ serviceChargePercent: 12 })

    const theirs = await RestaurantModel.findById(b.restaurant._id)
    expect(theirs?.settings.serviceChargePercent).toBe(0)
  })
})

describe('role boundaries', () => {
  it.each([Role.CASHIER, Role.KITCHEN])('refuses a %s', async (role) => {
    const tenant = await makeTenant()
    const staff = await makeUser({ restaurant: tenant.restaurant, role })
    const session = await loginAs(staff.email)

    expect((await request(app).get(SETTINGS).set(auth(session))).status).toBe(403)
    expect(
      (await request(app).patch(SETTINGS).set(auth(session)).send({ city: 'Riyadh' })).status,
    ).toBe(403)
  })

  it('allows a manager, the same bar as changing a menu price', async () => {
    const tenant = await makeTenant()
    const manager = await makeUser({ restaurant: tenant.restaurant, role: Role.MANAGER })
    const session = await loginAs(manager.email)

    expect((await request(app).get(SETTINGS).set(auth(session))).status).toBe(200)
  })
})

describe('the money split', () => {
  it('lets an owner set a service charge within the cap', async () => {
    const a = await ownerOf()

    const res = await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ serviceChargePercent: 12 })

    expect(res.status).toBe(200)
    expect(res.body.restaurant.settings.serviceChargePercent).toBe(12)
  })

  it('refuses a service charge above the cap, whatever the client believes', async () => {
    const a = await ownerOf()

    const res = await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ serviceChargePercent: 90 })

    expect(res.status).toBe(422)

    const after = await RestaurantModel.findById(a.restaurant._id)
    expect(after?.settings.serviceChargePercent).toBe(0)
  })

  /**
   * The decision this whole module was shaped around. A restaurant sending a
   * VAT rate must not get one — and the request must not fail either, because
   * the field is simply not part of the contract. It is stripped, the rest of
   * the patch applies, and the rate in the database is unchanged.
   */
  it('silently discards a VAT rate an owner tries to set', async () => {
    const a = await ownerOf()

    const res = await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ city: 'Jeddah', vatRatePercent: 5, pricesIncludeVat: false })

    expect(res.status).toBe(200)

    const after = await RestaurantModel.findById(a.restaurant._id)
    expect(after?.city).toBe('Jeddah')
    expect(after?.settings.vatRatePercent).toBe(15)
    expect(after?.settings.pricesIncludeVat).toBe(true)
  })

  it('a platform admin can set the VAT rate, or nobody could', async () => {
    const tenant = await makeTenant()
    const platformAdmin = await makeUser({ role: Role.PLATFORM_ADMIN })
    const session = await loginAs(platformAdmin.email)

    const res = await request(app)
      .patch(`/api/v1/platform/restaurants/${tenant.restaurant._id.toString()}/finance`)
      .set(auth(session))
      .send({ vatRatePercent: 0 })

    expect(res.status).toBe(200)

    const after = await RestaurantModel.findById(tenant.restaurant._id)
    expect(after?.settings.vatRatePercent).toBe(0)

    // Money-relevant, so it carries before and after rather than "something changed".
    const event = await AuditLogModel.findOne({ action: AuditAction.RESTAURANT_VAT_CHANGED })
    expect(event).not.toBeNull()
    expect((event?.metadata as Record<string, unknown>).from).toBe(15)
    expect((event?.metadata as Record<string, unknown>).to).toBe(0)
  })

  it('refuses the finance route to a restaurant owner', async () => {
    const a = await ownerOf()

    const res = await request(app)
      .patch(`/api/v1/platform/restaurants/${a.restaurant._id.toString()}/finance`)
      .set(auth(a.session))
      .send({ vatRatePercent: 0 })

    expect(res.status).toBe(403)
  })
})

describe('settings that carry risk', () => {
  it('records who let the kitchen start before payment', async () => {
    const a = await ownerOf()

    await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ kitchenStartsBeforePayment: true })

    const event = await AuditLogModel.findOne({
      action: AuditAction.RESTAURANT_PAYMENT_POLICY_CHANGED,
    })
    expect(event).not.toBeNull()
    expect(event?.actorUserId?.toString()).toBe(a.owner._id.toString())
    expect((event?.metadata as Record<string, unknown>).to).toBe(true)
  })

  it('caps a table session well short of the column’s limit', async () => {
    const a = await ownerOf()

    // 1440 is a valid value for the column and an absurd one for a visit: it is
    // also how long a photographed QR code would keep working.
    const res = await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ tableSessionTtlMinutes: 1440 })

    expect(res.status).toBe(422)
  })

  it('refuses a logo hosted anywhere but our own image provider', async () => {
    const a = await ownerOf()

    const res = await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ logoUrl: 'https://evil.test/tracking-pixel.png' })

    expect(res.status).toBe(400)

    const after = await RestaurantModel.findById(a.restaurant._id)
    expect(after?.logoUrl).toBeFalsy()
  })
})

describe('audit', () => {
  it('writes one settings event naming only what actually changed', async () => {
    const a = await ownerOf()

    await request(app).patch(SETTINGS).set(auth(a.session)).send({ city: 'Riyadh' })

    const event = await AuditLogModel.findOne({
      action: AuditAction.RESTAURANT_SETTINGS_UPDATED,
    })
    expect(event).not.toBeNull()
    expect(event?.restaurantId?.toString()).toBe(a.restaurant._id.toString())
    expect((event?.metadata as { changed: string[] }).changed).toEqual(['city'])
  })

  it('gives a service-charge change its own event with before and after', async () => {
    const a = await ownerOf()

    await request(app)
      .patch(SETTINGS)
      .set(auth(a.session))
      .send({ serviceChargePercent: 10 })

    const event = await AuditLogModel.findOne({
      action: AuditAction.RESTAURANT_SERVICE_CHARGE_CHANGED,
    })
    expect(event).not.toBeNull()
    expect((event?.metadata as Record<string, unknown>).fromPercent).toBe(0)
    expect((event?.metadata as Record<string, unknown>).toPercent).toBe(10)
  })
})
