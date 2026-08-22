/**
 * Express application assembly.
 *
 * Exported separately from the server bootstrap so tests can mount the app
 * with supertest without opening a port.
 *
 * Middleware order matters and is not arbitrary:
 *   1. trust proxy      — so client IPs are real behind a hosting proxy
 *   2. request context  — correlation ID must exist before anything logs
 *   3. helmet           — security headers on every response, including errors
 *   4. CORS             — reject disallowed origins before doing any work
 *   5. body parsing     — with a hard size limit
 *   6. routes
 *   7. 404, then the error handler (must be last)
 */

import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
// Named import, not default: pino-http ships CommonJS, and under NodeNext the
// default export of a CJS module is the whole module namespace, not the function.
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { getContext } from './core/context.js'
import { logger } from './core/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { apiRateLimit, menuRateLimit, orderRateLimit, staffRateLimit } from './middleware/rateLimit.js'
import { requestContext } from './middleware/requestContext.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { menuRouter } from './modules/menu/menu.routes.js'
import { orderRouter } from './modules/orders/order.routes.js'
import { staffRouter } from './modules/staff/staff.routes.js'
import { platformRouter } from './modules/platform/platform.routes.js'
import { publicRouter } from './modules/public/public.routes.js'
import { tablePickerRouter, tableRouter } from './modules/tables/table.routes.js'
import { appDashboardRouter, platformDashboardRouter } from './modules/dashboard/dashboard.routes.js'
import { restaurantRouter } from './modules/restaurants/restaurant.routes.js'
import { customerRouter } from './modules/customers/customer.routes.js'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')

  // Render/Vercel/Cloudflare put exactly one proxy in front of us. Trusting a
  // fixed hop count — rather than `true` — stops a client from spoofing its IP
  // with a forged X-Forwarded-For, which would defeat IP rate limiting.
  app.set('trust proxy', env.isProduction ? 1 : false)

  app.use(requestContext)

  app.use(
    helmet({
      // The API returns JSON only; a restrictive CSP costs nothing here.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  )

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: same-origin, curl, or a health probe. Allowed —
        // browsers always send Origin for cross-site requests, so this cannot
        // be used to bypass the allowlist from a page.
        if (!origin) return callback(null, true)
        if (env.corsOrigins.includes(origin)) return callback(null, true)
        logger.warn({ origin }, 'blocked cors origin')
        return callback(null, false)
      },
      credentials: true, // required for the refresh-token cookie in Step 2
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Tab-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  )

  app.use(express.json({ limit: env.BODY_LIMIT }))
  app.use(express.urlencoded({ extended: false, limit: env.BODY_LIMIT }))
  app.use(cookieParser())

  app.use(
    pinoHttp({
      logger,
      genReqId: () => getContext()?.requestId ?? 'unknown',
      autoLogging: {
        // Health probes fire constantly; logging them buries real traffic.
        ignore: (req) => req.url === '/health' || req.url === '/readyz',
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
    }),
  )

  app.use(healthRouter)

  // Versioned API surface.
  const v1 = express.Router()
  // Specific rate limiters for specific routes
  v1.use('/app/menu', menuRateLimit, menuRouter)
  v1.use('/app/orders', orderRateLimit, orderRouter)
  v1.use('/app/staff', staffRateLimit, staffRouter)
  // Order of these two matters: the picker router holds one non-admin route and
  // falls through to the admin router for everything else.
  v1.use('/app/tables', staffRateLimit, tablePickerRouter)
  v1.use('/app/tables', staffRateLimit, tableRouter)
  v1.use('/app/dashboard', staffRateLimit, appDashboardRouter) // restaurant dashboard
  v1.use('/app/restaurants', staffRateLimit, restaurantRouter)
  
  // Default fallback limiter for the rest
  v1.use(apiRateLimit)
  v1.use('/auth', authRouter)
  v1.use('/customers', customerRouter)
  v1.use('/public', publicRouter) // customers: table session only, no login
  v1.use('/platform/dashboard', platformDashboardRouter) // platform dashboard
  v1.use('/platform', platformRouter) // us
  app.use('/api/v1', v1)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
