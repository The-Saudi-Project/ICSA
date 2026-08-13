/**
 * Liveness and readiness.
 *
 * /health  — is the process alive? Used by uptime monitors. Never touches the DB.
 * /readyz  — can it serve traffic? Checks dependencies. Used by the platform
 *            before routing requests to a new deploy.
 *
 * Deliberately unauthenticated, and deliberately thin: no version control
 * details, no dependency versions, no environment values. A health endpoint
 * that leaks the stack is free reconnaissance for an attacker.
 */

import { Router } from 'express'
import { dbStatus } from '../../db/mongoose.js'
import { env } from '../../config/env.js'

export const healthRouter: Router = Router()

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
  })
})

healthRouter.get('/readyz', (_req, res) => {
  const db = dbStatus()

  // In development the API is allowed to run without a database so Step 1 boots
  // with no external account. In production a database is mandatory.
  const ready = db === 'connected' || (!env.isProduction && db === 'not-configured')

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    checks: { database: db },
  })
})
