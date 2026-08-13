/**
 * Structured logging.
 *
 * JSON in production so log aggregators can parse it; pretty-printed locally.
 * Every line carries the request ID from the async context, so one request's
 * lines can be pulled together across the whole stack.
 *
 * The redaction list is a safety net, not a licence to log secrets. Never pass
 * a token, OTP, password, or card detail to the logger in the first place.
 */

import pino from 'pino'
import { env } from '../config/env.js'
import { getContext } from './context.js'

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-webhook-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.tableToken',
  '*.refreshToken',
  '*.accessToken',
  '*.otp',
  '*.secret',
  '*.apiKey',
  '*.cardNumber',
  '*.cvv',
]

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  base: { service: 'api', env: env.NODE_ENV },
  // Attach the correlation ID to every line automatically.
  mixin() {
    const context = getContext()
    return context ? { requestId: context.requestId } : {}
  },
  ...(env.isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
})

export type Logger = typeof logger
