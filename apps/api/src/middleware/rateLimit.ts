/**
 * Rate limiting.
 *
 * In-process memory store, which is *correct* for a single instance and costs
 * nothing. The moment we run more than one instance it becomes wrong — each
 * instance would count separately — and that is exactly when Redis is added
 * (Phase 2). Adding Redis now would be complexity with no benefit.
 *
 * Limits are disabled in tests, otherwise one test's requests exhaust the
 * budget for the next.
 */

import rateLimit, { type Options } from 'express-rate-limit'
import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { sha256 } from '../core/crypto.js'
import { rateLimited } from '../core/errors.js'

function build(options: Partial<Options>): RequestHandler {
  if (env.isTest) {
    return (_req, _res, next) => {
      next()
    }
  }

  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(rateLimited())
    },
    ...options,
  })
}

/**
 * Login. Deliberately tight: this is the endpoint an attacker points a
 * credential-stuffing list at. Successful logins do not count towards the
 * limit, so a busy manager signing in repeatedly is unaffected.
 */
export const loginRateLimit = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
})

/** Refresh runs on a timer in the client, so it needs more headroom than login. */
export const refreshRateLimit = build({
  windowMs: 15 * 60 * 1000,
  limit: 60,
})

/**
 * The public contact form. Tight on purpose — a genuine restaurant owner sends
 * one message, and anything sending five an hour from one address is a script.
 */
export const leadRateLimit = build({
  windowMs: 60 * 60 * 1000,
  limit: 5,
})

/** General ceiling for authenticated API traffic. */
export const apiRateLimit = build({
  windowMs: 60 * 1000,
  limit: 300,
})

/** Menu fetching is highly cached and read-heavy. */
export const menuRateLimit = build({
  windowMs: 60 * 1000,
  limit: 600,
})

/** Order placement and manipulation. Lower limit to prevent spam. */
export const orderRateLimit = build({
  windowMs: 60 * 1000,
  limit: 60,
})

/** Staff operations. */
export const staffRateLimit = build({
  windowMs: 60 * 1000,
  limit: 200,
})

/**
 * Table-token exchange, limited per IP.
 *
 * A 256-bit token is not brute-forceable, so this is not about guessing. It is
 * about blunting a scanner that sprays tokens to map which ones exist, and
 * about stopping one device from opening unlimited sessions.
 */
export const tableSessionRateLimit = build({
  windowMs: 60 * 1000,
  limit: 10,
})

/**
 * Second limiter, keyed on the token itself rather than the IP.
 *
 * The IP limiter alone is defeated by a botnet; this one caps attempts against
 * any single table however they are distributed. The key is the token's hash,
 * so the raw token never reaches the limiter's memory store.
 */
export const perTableRateLimit = build({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => {
    const token = (req.body as { tableToken?: unknown } | undefined)?.tableToken
    if (typeof token !== 'string') return 'no-token'
    return sha256(token)
  },
})
