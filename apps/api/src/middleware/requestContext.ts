/**
 * Opens the per-request async context and assigns a correlation ID.
 * Must be mounted before anything that logs or reads context.
 */

import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { runWithContext } from '../core/context.js'

/** Accept an inbound request ID only if it looks sane — it ends up in logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id')
  const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID()

  res.setHeader('x-request-id', requestId)

  runWithContext({ requestId, startedAt: Date.now() }, () => {
    next()
  })
}
