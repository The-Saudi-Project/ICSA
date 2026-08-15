/**
 * Opens the per-request async context and assigns a correlation ID.
 * Must be mounted before anything that logs or reads context.
 */

import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { runWithContext } from '../core/context.js'
import { logger } from '../core/logger.js'

/** Accept an inbound request ID only if it looks sane — it ends up in logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

let proxyChainReported = false

/**
 * Reports the real proxy depth once, on the first production request.
 *
 * `TRUST_PROXY_HOPS` decides which `X-Forwarded-For` entry becomes `req.ip`, and
 * every IP rate limit rides on that. The right value is a property of the
 * deployment, so it cannot be known from the code — but it *can* be observed,
 * and asking an operator to patch in a `console.log` to find out is a poor
 * substitute for the server simply saying what it sees.
 *
 * Only the number of entries is logged, never an address. Raw IPs are personal
 * data under PDPL and are hashed everywhere else in this codebase; a diagnostic
 * is not a reason to make an exception.
 *
 * Reading it: an ordinary browser sends no `X-Forwarded-For`, so on normal
 * traffic every entry was appended by a proxy in front of us and `entries` is
 * the number to set. A single request can be forged, which is why this reports
 * rather than auto-configures — check it against a few lines before changing
 * the variable.
 */
function reportProxyChainOnce(req: Request): void {
  if (proxyChainReported || !env.isProduction) return
  proxyChainReported = true

  const header = req.headers['x-forwarded-for']
  const raw = Array.isArray(header) ? header.join(',') : (header ?? '')
  const entries = raw ? raw.split(',').filter((part) => part.trim()).length : 0

  logger.info(
    {
      forwardedForEntries: entries,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      agrees: entries === env.TRUST_PROXY_HOPS,
    },
    entries === env.TRUST_PROXY_HOPS
      ? 'proxy depth matches TRUST_PROXY_HOPS'
      : `proxy depth looks like ${entries}, but TRUST_PROXY_HOPS is ${env.TRUST_PROXY_HOPS} — ` +
        'IP rate limiting is keyed on the wrong address until these agree',
  )
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  reportProxyChainOnce(req)

  const inbound = req.header('x-request-id')
  const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID()

  res.setHeader('x-request-id', requestId)

  runWithContext({ requestId, startedAt: Date.now() }, () => {
    next()
  })
}
