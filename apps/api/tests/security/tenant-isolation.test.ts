/**
 * Mandatory tenant-isolation suite.
 *
 * These tests exist to fail the build. Every one of them describes an attack
 * that would end the business if it worked, so none may be skipped, weakened,
 * or marked `todo` to get a release out.
 *
 * Covers requirements Sec-01, Sec-02, Sec-03, Sec-05, Sec-06 from the brief.
 * Table-level isolation (Sec-04) arrives with tables in Step 4; order isolation
 * (Sec-06 on orders) is extended in Step 6.
 */

import { Role } from '@rw/shared'
import mongoose from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runWithContext } from '../../src/core/context.js'
import { MissingTenantError, tenantRepo, unscoped } from '../../src/core/tenant.js'
import { tenantGuardPlugin, TenantScopeError } from '../../src/db/plugins/tenantGuard.js'
import { UserModel } from '../../src/modules/users/user.model.js'
import { makeTenant, makeUser } from '../setup/factories.js'
import { app, auth, loginAs } from '../setup/http.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

/**
 * A stand-in for the tenant-owned collections that arrive in Steps 4-6
 * (Table, MenuItem, Order). Testing the mechanism directly means the guarantee
 * is proven now, not assumed until those models exist.
 */
const widgetSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  label: { type: String, required: true },
  secret: { type: String },
})
widgetSchema.plugin(tenantGuardPlugin)
const WidgetModel = mongoose.model('TestWidget', widgetSchema)

const withTenant = <T>(restaurantId: string, fn: () => Promise<T>): Promise<T> =>
  runWithContext({ requestId: 'test', startedAt: Date.now(), restaurantId }, fn)

beforeAll(async () => {
  await startTestDb()
})
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearTestDb()
})

describe('Sec-01 a tenant cannot read another tenant’s records', () => {
  it('find() returns only its own rows', async () => {
    const a = await makeTenant()
    const b = await makeTenant()

    const idA = a.restaurant._id.toString()
    const idB = b.restaurant._id.toString()

    await withTenant(idA, () => tenantRepo(WidgetModel).create({ label: 'A-burger' }))
    await withTenant(idB, () => tenantRepo(WidgetModel).create({ label: 'B-burger' }))

    const seenByA = await withTenant(idA, () => tenantRepo(WidgetModel).find())
    expect(seenByA).toHaveLength(1)
    expect(seenByA[0]!.label).toBe('A-burger')

    const countForB = await withTenant(idB, () => tenantRepo(WidgetModel).countDocuments())
    expect(countForB).toBe(1)
  })

  it('a filter cannot widen the scope back out', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const idA = a.restaurant._id.toString()
    const idB = b.restaurant._id.toString()

    await withTenant(idB, () => tenantRepo(WidgetModel).create({ label: 'B-secret' }))

    // Tenant A explicitly asks for tenant B's id. The repo overwrites it.
    const results = await withTenant(idA, () =>
      tenantRepo(WidgetModel).find({ restaurantId: new mongoose.Types.ObjectId(idB) } as never),
    )
    expect(results).toHaveLength(0)
  })
})

describe('Sec-06 cross-tenant id access returns nothing, and cannot be distinguished from “missing”', () => {
  it('findById on another tenant’s document resolves to null', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const idA = a.restaurant._id.toString()
    const idB = b.restaurant._id.toString()

    const bWidget = await withTenant(idB, () => tenantRepo(WidgetModel).create({ label: 'B-only' }))

    const stolen = await withTenant(idA, () =>
      tenantRepo(WidgetModel).findById(bWidget._id.toString()),
    )
    expect(stolen).toBeNull()

    const nonexistent = await withTenant(idA, () =>
      tenantRepo(WidgetModel).findById(new mongoose.Types.ObjectId().toString()),
    )
    expect(nonexistent).toBeNull()

    // Identical outcome: the attacker learns nothing about which ids exist.
    expect(stolen).toEqual(nonexistent)
  })

  it('a malformed id returns null rather than throwing a CastError', async () => {
    const a = await makeTenant()
    const result = await withTenant(a.restaurant._id.toString(), () =>
      tenantRepo(WidgetModel).findById('not-an-object-id'),
    )
    expect(result).toBeNull()
  })

  it('cross-tenant update and delete affect nothing', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const idA = a.restaurant._id.toString()
    const idB = b.restaurant._id.toString()

    const bWidget = await withTenant(idB, () => tenantRepo(WidgetModel).create({ label: 'B-safe' }))

    const updated = await withTenant(idA, () =>
      tenantRepo(WidgetModel).findByIdAndUpdate(bWidget._id.toString(), {
        $set: { label: 'HACKED' },
      }),
    )
    expect(updated).toBeNull()

    const deleted = await withTenant(idA, () =>
      tenantRepo(WidgetModel).deleteById(bWidget._id.toString()),
    )
    expect(deleted.deletedCount).toBe(0)

    const stillThere = await withTenant(idB, () =>
      tenantRepo(WidgetModel).findById(bWidget._id.toString()),
    )
    expect(stillThere?.label).toBe('B-safe')
  })
})

describe('Sec-05 a client cannot choose its own tenant', () => {
  it('create() discards a client-supplied restaurantId', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const idA = a.restaurant._id.toString()
    const idB = b.restaurant._id.toString()

    const created = await withTenant(idA, () =>
      tenantRepo(WidgetModel).create({
        label: 'planted',
        restaurantId: new mongoose.Types.ObjectId(idB),
      } as never),
    )

    expect(created.restaurantId.toString()).toBe(idA)
  })

  it('update() cannot move a document to another tenant', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const idA = a.restaurant._id.toString()
    const idB = b.restaurant._id.toString()

    const widget = await withTenant(idA, () => tenantRepo(WidgetModel).create({ label: 'stays' }))

    await withTenant(idA, () =>
      tenantRepo(WidgetModel).findByIdAndUpdate(widget._id.toString(), {
        $set: { label: 'renamed', restaurantId: new mongoose.Types.ObjectId(idB) },
      }),
    )

    const reloaded = await WidgetModel.findById(widget._id).setOptions({ unscoped: true })
    expect(reloaded?.restaurantId.toString()).toBe(idA)
    expect(reloaded?.label).toBe('renamed')
  })

  it('refuses to run at all when no tenant is in context', async () => {
    await expect(
      runWithContext({ requestId: 'test', startedAt: Date.now() }, () =>
        tenantRepo(WidgetModel).find(),
      ),
    ).rejects.toBeInstanceOf(MissingTenantError)
  })
})

describe('defence layer 3: the Mongoose guard catches direct model use', () => {
  it('throws when a query forgets the tenant filter', async () => {
    await expect(WidgetModel.find({ label: 'anything' })).rejects.toBeInstanceOf(TenantScopeError)
    await expect(WidgetModel.findOne({})).rejects.toBeInstanceOf(TenantScopeError)
    await expect(WidgetModel.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError)
    await expect(WidgetModel.countDocuments({})).rejects.toBeInstanceOf(TenantScopeError)
  })

  it('throws when saving a document with no tenant', async () => {
    await expect(new WidgetModel({ label: 'orphan' }).save()).rejects.toBeInstanceOf(
      TenantScopeError,
    )
  })

  it('throws on an aggregation that does not start with a tenant $match', async () => {
    await expect(WidgetModel.aggregate([{ $group: { _id: null } }])).rejects.toBeInstanceOf(
      TenantScopeError,
    )
  })

  it('allows the explicit, audited unscoped escape hatch', async () => {
    const a = await makeTenant()
    await withTenant(a.restaurant._id.toString(), () =>
      tenantRepo(WidgetModel).create({ label: 'visible-to-platform' }),
    )

    const all = await unscoped(WidgetModel).find({})
    expect(all).toHaveLength(1)
  })
})

describe('Sec-03 staff records are tenant scoped', () => {
  it('one restaurant cannot enumerate another restaurant’s users', async () => {
    const a = await makeTenant()
    const b = await makeTenant()

    const staffOfA = await withTenant(a.restaurant._id.toString(), () =>
      tenantRepo(UserModel).find(),
    )
    const emails = staffOfA.map((u) => u.email)

    expect(staffOfA).toHaveLength(3) // owner, cashier, kitchen
    expect(emails).not.toContain(b.owner.email)
    expect(emails).not.toContain(b.cashier.email)
  })

  it('cannot fetch another restaurant’s user by id', async () => {
    const a = await makeTenant()
    const b = await makeTenant()

    const found = await withTenant(a.restaurant._id.toString(), () =>
      tenantRepo(UserModel).findById(b.owner._id.toString()),
    )
    expect(found).toBeNull()
  })
})

describe('Sec-02 the tenant comes from the token, over HTTP', () => {
  it('/auth/me reports the tenant from the token and ignores any request input', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await makeUser({ restaurant: a.restaurant, email: 'a-owner@x.test', role: Role.OWNER })

    const session = await loginAs('a-owner@x.test')

    const res = await request(app)
      .get('/api/v1/auth/me')
      .query({ restaurantId: b.restaurant._id.toString() })
      .set(auth(session))

    expect(res.status).toBe(200)
    expect(res.body.user.restaurantId).toBe(a.restaurant._id.toString())
  })

  it('a token signed for tenant A never yields tenant B', async () => {
    const a = await makeTenant()
    await makeUser({ restaurant: a.restaurant, email: 'strict@x.test' })
    const session = await loginAs('strict@x.test')

    expect(session.user.restaurantId).toBe(a.restaurant._id.toString())
  })
})
