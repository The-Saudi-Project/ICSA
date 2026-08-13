/**
 * Final error handler. Every error in the app ends up here.
 *
 * Rules:
 *  - Operational errors are described to the client.
 *  - Anything else becomes a generic 500 carrying only a request ID.
 *  - Stack traces and internal messages never reach the client in production.
 */

import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { getContext } from '../core/context.js'
import { AppError, isAppError } from '../core/errors.js'
import { logger } from '../core/logger.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    requestId?: string
    details?: unknown
  }
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error

  if (error instanceof ZodError) {
    return new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
      details: error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        message: i.message,
      })),
    })
  }

  // express.json() rejects oversized or malformed bodies with a `type` property.
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type?: string }).type
    if (type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large')
    }
    if (type === 'entity.parse.failed') {
      return new AppError(400, 'BAD_REQUEST', 'Malformed JSON body')
    }
  }

  return new AppError(500, 'INTERNAL', 'Internal server error', {
    isOperational: false,
    cause: error,
  })
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error)
    return
  }

  const appError = toAppError(error)
  const requestId = getContext()?.requestId

  if (appError.isOperational) {
    // Not `msg:` — pino uses that key for the log message itself, and passing
    // both produces a line with two "msg" fields.
    logger.warn(
      { code: appError.code, statusCode: appError.statusCode, reason: appError.message },
      'request failed',
    )
  } else {
    // Full detail goes to the logs, never to the client.
    logger.error({ err: appError.cause ?? appError, code: appError.code }, 'unhandled error')
  }

  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: appError.isOperational ? appError.message : 'Internal server error',
      ...(requestId ? { requestId } : {}),
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  }

  res.status(appError.statusCode).json(body)
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
      ...(getContext()?.requestId ? { requestId: getContext()?.requestId } : {}),
    },
  })
}
