/**
 * Table-session tokens — the customer equivalent of a staff access token.
 *
 * Signed with a *different* secret and a different audience from staff tokens.
 * That separation is deliberate: even if one signing key were somehow exposed,
 * it could not be used to mint the other kind of token. A customer token must
 * never be able to masquerade as a cashier.
 *
 * The claims carry the tenant and the table. Nothing else in the system asks a
 * customer which table they are at.
 */

import { randomBytes } from 'node:crypto'
import { jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { env } from '../config/env.js'
import { logger } from './logger.js'

const ISSUER = 'rw-api'
const AUDIENCE_TABLE = 'rw-table'

function resolveSecret(): Uint8Array {
  if (env.TABLE_SESSION_SECRET) {
    return new TextEncoder().encode(env.TABLE_SESSION_SECRET)
  }
  logger.warn(
    'TABLE_SESSION_SECRET is not set - using a random per-process secret. ' +
      'Customer sessions will not survive a restart. Set it in apps/api/.env.',
  )
  return new Uint8Array(randomBytes(48))
}

const secret = resolveSecret()

export interface TableSessionClaims extends JWTPayload {
  /** TableSession document id. */
  sid: string
  /** Tenant. */
  rid: string
  /** Table. */
  tid: string
}

export async function signTableSessionToken(claims: {
  sid: string
  rid: string
  tid: string
}): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE_TABLE)
    .setJti(randomBytes(12).toString('base64url'))
    .setExpirationTime(`${env.TABLE_SESSION_TOKEN_TTL_MINUTES}m`)
    .sign(secret)
}

export async function verifyTableSessionToken(token: string): Promise<TableSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE_TABLE, // a staff token presented here fails on audience
      algorithms: ['HS256'],
    })

    if (
      typeof payload.sid !== 'string' ||
      typeof payload.rid !== 'string' ||
      typeof payload.tid !== 'string'
    ) {
      return null
    }

    return payload as TableSessionClaims
  } catch {
    return null
  }
}
