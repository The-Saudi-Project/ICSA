/**
 * Authentication service.
 *
 * Two token types, on purpose:
 *
 *  - Access token: a short-lived signed JWT the client holds in memory. It is
 *    self-describing, so ordinary requests need no session lookup beyond the
 *    revocation check.
 *  - Refresh token: a long-lived opaque random string in an httpOnly cookie,
 *    stored only as a hash, rotated on every use. JavaScript cannot read it, so
 *    an XSS bug cannot steal a long-lived credential.
 *
 * Every failure path returns the same message. "No such account", "wrong
 * password", "account disabled", and "restaurant suspended" must be
 * indistinguishable, or the login form becomes a tool for discovering which
 * email addresses exist.
 */

import { RestaurantStatus, UserStatus } from '@rw/shared'
import { env } from '../../config/env.js'
import { hashIp, writeAudit } from '../../core/audit.js'
import {
  generateToken,
  getDummyHash,
  hashPassword,
  sha256,
  verifyPassword,
} from '../../core/crypto.js'
import { badRequest, unauthenticated } from '../../core/errors.js'
import { signAccessToken } from '../../core/jwt.js'
import { logger } from '../../core/logger.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { RestaurantModel } from '../restaurants/restaurant.model.js'
import { toPublicUser, UserModel, type PublicUser, type UserDoc } from '../users/user.model.js'
import { RefreshTokenModel } from './refreshToken.model.js'

/** The single message every authentication failure returns. */
const GENERIC_AUTH_FAILURE = 'Invalid email or password'

export interface RequestFingerprint {
  ip?: string
  userAgent?: string
}

export interface AuthResult {
  user: PublicUser
  accessToken: string
  /** Raw refresh token — set as a cookie by the route, never returned in a body. */
  refreshToken: string
  refreshExpiresAt: Date
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

async function issueTokens(
  user: UserDoc,
  familyId: string,
  fingerprint: RequestFingerprint,
): Promise<AuthResult> {
  const accessToken = await signAccessToken({
    sub: user._id.toString(),
    rid: user.restaurantId ? user.restaurantId.toString() : null,
    role: user.role,
    tv: user.tokenVersion,
  })

  const refreshToken = generateToken()
  const refreshExpiresAt = refreshExpiry()

  await RefreshTokenModel.create({
    tokenHash: sha256(refreshToken),
    userId: user._id,
    restaurantId: user.restaurantId ?? null,
    familyId,
    expiresAt: refreshExpiresAt,
    userAgent: fingerprint.userAgent?.slice(0, 300),
    ipHash: hashIp(fingerprint.ip),
  })

  return { user: toPublicUser(user), accessToken, refreshToken, refreshExpiresAt }
}

export async function login(
  email: string,
  password: string,
  fingerprint: RequestFingerprint,
): Promise<AuthResult> {
  // Cross-tenant by necessity: the tenant is unknown until the account is found.
  // Email is globally unique, so this cannot return another tenant's data to a
  // caller who does not already know the password.
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash')

  if (!user) {
    // Verify against a throwaway hash so a missing account costs the same time
    // as a wrong password. Skipping this leaks account existence via latency.
    await verifyPassword(await getDummyHash(), password)
    await writeAudit({
      action: AuditAction.USER_LOGIN_FAILED,
      actorType: 'SYSTEM',
      metadata: { reason: 'unknown-email' },
      ip: fingerprint.ip,
      restaurantId: null,
    })
    throw unauthenticated(GENERIC_AUTH_FAILURE)
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await writeAudit({
      action: AuditAction.USER_LOGIN_FAILED,
      actorType: 'SYSTEM',
      targetType: 'User',
      targetId: user._id.toString(),
      metadata: { reason: 'locked' },
      ip: fingerprint.ip,
      restaurantId: user.restaurantId?.toString() ?? null,
    })
    throw unauthenticated(GENERIC_AUTH_FAILURE)
  }

  const passwordOk = await verifyPassword(user.passwordHash, password)

  if (!passwordOk) {
    const attempts = (user.failedLoginCount ?? 0) + 1
    const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginCount: shouldLock ? 0 : attempts,
          ...(shouldLock
            ? { lockedUntil: new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60 * 1000) }
            : {}),
        },
      },
    )

    await writeAudit({
      action: shouldLock ? AuditAction.USER_LOCKED : AuditAction.USER_LOGIN_FAILED,
      actorType: 'SYSTEM',
      targetType: 'User',
      targetId: user._id.toString(),
      metadata: { reason: 'bad-password', attempts },
      ip: fingerprint.ip,
      restaurantId: user.restaurantId?.toString() ?? null,
    })

    throw unauthenticated(GENERIC_AUTH_FAILURE)
  }

  if (user.status !== UserStatus.ACTIVE) {
    await writeAudit({
      action: AuditAction.USER_LOGIN_FAILED,
      actorType: 'SYSTEM',
      targetType: 'User',
      targetId: user._id.toString(),
      metadata: { reason: 'user-disabled' },
      ip: fingerprint.ip,
      restaurantId: user.restaurantId?.toString() ?? null,
    })
    throw unauthenticated(GENERIC_AUTH_FAILURE)
  }

  // A suspended restaurant must not be able to trade. Checked at login and at
  // every refresh, so suspension takes effect within one access-token lifetime.
  if (user.restaurantId) {
    const restaurant = await RestaurantModel.findById(user.restaurantId).select('status')
    if (!restaurant || restaurant.status !== RestaurantStatus.ACTIVE) {
      await writeAudit({
        action: AuditAction.USER_LOGIN_FAILED,
        actorType: 'SYSTEM',
        targetType: 'User',
        targetId: user._id.toString(),
        metadata: { reason: 'restaurant-not-active' },
        ip: fingerprint.ip,
        restaurantId: user.restaurantId.toString(),
      })
      throw unauthenticated(GENERIC_AUTH_FAILURE)
    }
  }

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } },
  )

  const result = await issueTokens(user, generateToken(16), fingerprint)

  await writeAudit({
    action: AuditAction.USER_LOGIN,
    actorType: 'USER',
    targetType: 'User',
    targetId: user._id.toString(),
    ip: fingerprint.ip,
    restaurantId: user.restaurantId?.toString() ?? null,
  })

  return result
}

export async function refresh(
  rawToken: string,
  fingerprint: RequestFingerprint,
): Promise<AuthResult> {
  const stored = await RefreshTokenModel.findOne({ tokenHash: sha256(rawToken) })

  if (!stored) throw unauthenticated('Session expired')

  // A token that was already revoked is being presented again. Either it was
  // stolen, or the legitimate client is replaying an old one. Both mean the
  // family can no longer be trusted, so every token in it dies.
  if (stored.revokedAt) {
    await RefreshTokenModel.updateMany(
      { familyId: stored.familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'reuse-detected' } },
    )
    logger.warn({ familyId: stored.familyId }, 'refresh token reuse detected — family revoked')
    await writeAudit({
      action: AuditAction.TOKEN_REUSE_DETECTED,
      actorType: 'SYSTEM',
      targetType: 'User',
      targetId: stored.userId.toString(),
      ip: fingerprint.ip,
      restaurantId: stored.restaurantId?.toString() ?? null,
    })
    throw unauthenticated('Session expired')
  }

  if (stored.expiresAt <= new Date()) throw unauthenticated('Session expired')

  const user = await UserModel.findById(stored.userId)
  if (!user || user.status !== UserStatus.ACTIVE) throw unauthenticated('Session expired')

  if (user.restaurantId) {
    const restaurant = await RestaurantModel.findById(user.restaurantId).select('status')
    if (!restaurant || restaurant.status !== RestaurantStatus.ACTIVE) {
      throw unauthenticated('Session expired')
    }
  }

  // Rotate: the presented token is spent, and a successor joins the same family.
  stored.revokedAt = new Date()
  stored.revokedReason = 'rotated'
  await stored.save()

  const result = await issueTokens(user, stored.familyId, fingerprint)

  await writeAudit({
    action: AuditAction.TOKEN_REFRESHED,
    actorType: 'USER',
    targetType: 'User',
    targetId: user._id.toString(),
    ip: fingerprint.ip,
    restaurantId: user.restaurantId?.toString() ?? null,
  })

  return result
}

/**
 * Password change for the signed-in user.
 *
 * The current password is required even though the caller is already
 * authenticated: a stolen access token must not be enough to lock the real
 * owner out of their own account.
 *
 * Every session is revoked afterwards, including the caller's. That is
 * deliberate — if the change was prompted by a suspected compromise, leaving
 * other sessions alive would defeat the point.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash')
  if (!user) throw unauthenticated()

  const ok = await verifyPassword(user.passwordHash, currentPassword)
  if (!ok) throw unauthenticated('Current password is incorrect')

  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw badRequest('The new password must be different from the current one')
  }

  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
      $inc: { tokenVersion: 1 },
    },
  )

  await RefreshTokenModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'password-change' } },
  )

  await writeAudit({
    action: AuditAction.PASSWORD_CHANGED,
    actorType: 'USER',
    targetType: 'User',
    targetId: user._id.toString(),
    restaurantId: user.restaurantId?.toString() ?? null,
  })
}

/** Revokes the whole family, so logging out on one device ends that session everywhere it was rotated. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return

  const stored = await RefreshTokenModel.findOne({ tokenHash: sha256(rawToken) })
  if (!stored) return

  await RefreshTokenModel.updateMany(
    { familyId: stored.familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
  )

  await writeAudit({
    action: AuditAction.USER_LOGOUT,
    actorType: 'USER',
    targetType: 'User',
    targetId: stored.userId.toString(),
    restaurantId: stored.restaurantId?.toString() ?? null,
  })
}

/**
 * Instant revocation of every access token for a user, plus every refresh
 * token. Used when disabling staff or changing a password.
 */
export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } })
  await RefreshTokenModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  )
}

/** Exported for seeding and staff creation in later steps. */
export { hashPassword }
