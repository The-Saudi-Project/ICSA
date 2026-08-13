/**
 * Access-token signing and verification.
 *
 * Access tokens are short-lived (15 minutes) and carry the identity the whole
 * request is authorised against — including `rid`, the tenant. Nothing in a
 * request body is ever allowed to override these claims.
 *
 * `tv` (tokenVersion) is the revocation mechanism: it is compared against the
 * user's current value on every request, so disabling a staff member takes
 * effect immediately rather than after the token expires.
 */

import { randomBytes } from 'node:crypto'
import { jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { env } from '../config/env.js'
import { logger } from './logger.js'

const ISSUER = 'rw-api'
const AUDIENCE_STAFF = 'rw-staff'

/**
 * In development and test the secret may be absent, so an ephemeral one is
 * generated per process. Tokens then stop working across restarts, which is
 * mildly annoying and much safer than shipping a default secret that could
 * reach production. Production requires a real secret — enforced in env.ts.
 */
function resolveSecret(): Uint8Array {
  if (env.JWT_ACCESS_SECRET) {
    return new TextEncoder().encode(env.JWT_ACCESS_SECRET)
  }
  logger.warn(
    'JWT_ACCESS_SECRET is not set — using a random per-process secret. ' +
      'Sessions will not survive a restart. Set it in apps/api/.env.',
  )
  return new Uint8Array(randomBytes(48))
}

const secret = resolveSecret()

export interface StaffTokenClaims extends JWTPayload {
  /** User id. */
  sub: string
  /** Tenant. Null for a platform admin, who belongs to no restaurant. */
  rid: string | null
  role: string
  /** Token version, compared against the user record to allow instant revocation. */
  tv: number
}

export async function signAccessToken(
  claims: Omit<StaffTokenClaims, 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE_STAFF)
    .setJti(randomBytes(12).toString('base64url'))
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret)
}

/** Returns the claims, or null for any invalid, expired, or foreign token. */
export async function verifyAccessToken(token: string): Promise<StaffTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE_STAFF,
      algorithms: ['HS256'], // pinned: never let the token's own header choose
    })

    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null
    if (typeof payload.tv !== 'number') return null

    return payload as StaffTokenClaims
  } catch {
    // Expired, tampered, wrong audience, wrong algorithm — all indistinguishable
    // to the caller on purpose.
    return null
  }
}
