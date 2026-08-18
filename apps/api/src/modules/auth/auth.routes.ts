/**
 * Authentication routes.
 *
 * The refresh token travels only as an httpOnly cookie scoped to this router's
 * path. It is never in a response body, so no amount of JavaScript on the page
 * can read it, and it is never sent on ordinary API calls.
 */

import { changePasswordSchema, loginSchema } from '@rw/shared'
import { Router, type CookieOptions, type Request, type Response, type NextFunction } from 'express'
import { env } from '../../config/env.js'
import { getContext } from '../../core/context.js'
import { unauthenticated } from '../../core/errors.js'
import { requireAuth } from '../../middleware/auth.js'
import { loginRateLimit, refreshRateLimit } from '../../middleware/rateLimit.js'
import { validate } from '../../middleware/validate.js'
import { toPublicUser, UserModel } from '../users/user.model.js'
import * as authService from './auth.service.js'

export const REFRESH_COOKIE = 'rw_rt'
const REFRESH_COOKIE_PATH = '/api/v1/auth'

function refreshCookieOptions(expires: Date): CookieOptions {
  return {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate it
    secure: env.isProduction, // HTTPS only in production
    sameSite: env.isProduction ? 'none' : 'lax', // 'none' required for cross-domain (Vercel/Cloudflare -> Render)
    path: REFRESH_COOKIE_PATH, // never sent to ordinary API routes
    expires,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  }
}

function fingerprint(req: Request) {
  return { ip: req.ip, userAgent: req.header('user-agent') }
}

export const authRouter: Router = Router()

/**
 * CSRF Protection Middleware.
 * Enforces that state-changing requests originate from our own application by
 * verifying the Origin or Referer header matches expected values.
 */
function requireValidOrigin(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || env.isTest) {
    return next()
  }
  
  const origin = req.headers.origin
  const referer = req.headers.referer

  // If both are completely missing, reject. Browsers send at least one for POST.
  if (!origin && !referer) {
    throw unauthenticated('Missing origin verification')
  }

  // Ensure origin is in the allowed CORS list
  
  if (origin && !env.corsOrigins.includes(origin)) {
    throw unauthenticated('Invalid origin')
  }
  
  if (!origin && referer && !env.corsOrigins.some(o => referer.startsWith(o))) {
    throw unauthenticated('Invalid referer')
  }

  next()
}

authRouter.use(requireValidOrigin)

authRouter.post(
  '/login',
  loginRateLimit,
  validate({ body: loginSchema }),
  async (req: Request, res: Response) => {
    const { email, password } = req.body as { email: string; password: string }

    const result = await authService.login(email, password, fingerprint(req))

    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiresAt))
    res.status(200).json({
      user: result.user,
      accessToken: result.accessToken,
      expiresInSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    })
  },
)

authRouter.post('/refresh', refreshRateLimit, async (req: Request, res: Response) => {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]
  if (!raw) throw unauthenticated('Session expired')

  const result = await authService.refresh(raw, fingerprint(req))

  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiresAt))
  res.status(200).json({
    user: result.user,
    accessToken: result.accessToken,
    expiresInSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  })
})

authRouter.post('/logout', async (req: Request, res: Response) => {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]

  await authService.logout(raw)

  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH })
  res.status(204).end()
})

authRouter.get('/me', requireAuth, async (_req: Request, res: Response) => {
  const userId = getContext()?.actorUserId
  const user = await UserModel.findById(userId)
  if (!user) throw unauthenticated()

  res.status(200).json({ user: toPublicUser(user) })
})

authRouter.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string
      newPassword: string
    }
    const userId = getContext()?.actorUserId
    if (!userId) throw unauthenticated()

    await authService.changePassword(userId, currentPassword, newPassword)

    // Every session was just revoked, including this one. Clear the cookie so
    // the client is not left holding a token that will only ever fail.
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH })
    res.status(200).json({ message: 'Password changed. Please sign in again.' })
  },
)
