/**
 * Role-based access control and audit immutability.
 *
 * Covers Sec-07 (a cashier must not reach admin functionality) and Sec-08
 * (kitchen staff must not touch payments) at the middleware level. The route
 * assertions grow as the routes themselves arrive in Steps 3-6.
 */

import { Role } from '@rw/shared'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runWithContext } from '../../src/core/context.js'
import { errorHandler } from '../../src/middleware/errorHandler.js'
import { requireRole, requireRestaurantAdmin } from '../../src/middleware/rbac.js'
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js'
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo.js'

/** Minimal app that injects a role, so RBAC is tested in isolation. */
function appWithRole(role: string | undefined, guard: express.RequestHandler) {
  const app = express()
  app.use((req, _res, next) => {
    runWithContext(
      {
        requestId: 'test',
        startedAt: Date.now(),
        ...(role ? { actorUserId: 'user-1', actorRole: role } : {}),
      },
      () => {
        next()
      },
    )
  })
  app.get('/guarded', guard, (_req, res) => {
    res.json({ ok: true })
  })
  app.use(errorHandler)
  return app
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

describe('Sec-07 a cashier cannot reach restaurant-admin functionality', () => {
  it('rejects CASHIER, KITCHEN and WAITER with 403', async () => {
    for (const role of [Role.CASHIER, Role.KITCHEN, Role.WAITER]) {
      const res = await request(appWithRole(role, requireRestaurantAdmin)).get('/guarded')
      expect(res.status, `role ${role}`).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    }
  })

  it('allows OWNER and MANAGER', async () => {
    for (const role of [Role.OWNER, Role.MANAGER]) {
      const res = await request(appWithRole(role, requireRestaurantAdmin)).get('/guarded')
      expect(res.status, `role ${role}`).toBe(200)
    }
  })
})

describe('Sec-08 kitchen staff cannot reach payment functionality', () => {
  const paymentGuard = requireRole(Role.CASHIER, Role.MANAGER, Role.OWNER)

  it('rejects KITCHEN', async () => {
    const res = await request(appWithRole(Role.KITCHEN, paymentGuard)).get('/guarded')
    expect(res.status).toBe(403)
  })

  it('allows CASHIER', async () => {
    const res = await request(appWithRole(Role.CASHIER, paymentGuard)).get('/guarded')
    expect(res.status).toBe(200)
  })
})

describe('RBAC denies by default', () => {
  it('an unauthenticated request is 401, not 403', async () => {
    const res = await request(appWithRole(undefined, requireRestaurantAdmin)).get('/guarded')
    expect(res.status).toBe(401)
  })

  it('a platform admin is not automatically a restaurant admin', async () => {
    const res = await request(appWithRole(Role.PLATFORM_ADMIN, requireRestaurantAdmin)).get(
      '/guarded',
    )
    expect(res.status).toBe(403)
  })

  it('an unknown role is rejected', async () => {
    const res = await request(appWithRole('SUPERUSER', requireRestaurantAdmin)).get('/guarded')
    expect(res.status).toBe(403)
  })
})

describe('the audit log is append-only', () => {
  it('accepts inserts', async () => {
    await AuditLogModel.create({ actorType: 'SYSTEM', action: 'TEST_EVENT' })
    expect(await AuditLogModel.countDocuments({})).toBe(1)
  })

  it('refuses updates and deletes', async () => {
    await AuditLogModel.create({ actorType: 'SYSTEM', action: 'TEST_EVENT' })

    await expect(AuditLogModel.updateOne({}, { $set: { action: 'REWRITTEN' } })).rejects.toThrow(
      /append-only/,
    )
    await expect(AuditLogModel.deleteMany({})).rejects.toThrow(/append-only/)
    await expect(
      AuditLogModel.findOneAndUpdate({}, { $set: { action: 'REWRITTEN' } }),
    ).rejects.toThrow(/append-only/)

    const surviving = await AuditLogModel.findOne({})
    expect(surviving?.action).toBe('TEST_EVENT')
  })
})
