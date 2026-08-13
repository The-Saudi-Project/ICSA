/**
 * Error taxonomy.
 *
 * Two categories:
 *  - Operational: expected and handled (bad input, missing record, wrong role).
 *    Safe to describe to the client.
 *  - Programmer errors: bugs. The client gets a generic 500 and a request ID;
 *    the detail goes to the logs only.
 *
 * Security note: `notFound()` is used deliberately in place of `forbidden()`
 * for cross-tenant access. Telling an attacker "403 — exists but not yours"
 * confirms the record exists. 404 tells them nothing.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNPROCESSABLE'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  /** Safe to serialise to the client. Never put secrets here. */
  readonly details?: unknown
  /** true = expected condition; false = bug. */
  readonly isOperational: boolean

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; isOperational?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = options.details
    this.isOperational = options.isOperational ?? true
    Error.captureStackTrace?.(this, AppError)
  }
}

export const badRequest = (message = 'Bad request', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, { details })

export const validationError = (message = 'Validation failed', details?: unknown) =>
  new AppError(422, 'VALIDATION_ERROR', message, { details })

export const unauthenticated = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message)

export const forbidden = (message = 'Not permitted') => new AppError(403, 'FORBIDDEN', message)

/** Also the correct response for cross-tenant access — see the note above. */
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message)

export const conflict = (message = 'Conflict', details?: unknown) =>
  new AppError(409, 'CONFLICT', message, { details })

export const rateLimited = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message)

export const serviceUnavailable = (message = 'Service unavailable') =>
  new AppError(503, 'SERVICE_UNAVAILABLE', message)

export const internal = (message = 'Internal server error', cause?: unknown) =>
  new AppError(500, 'INTERNAL', message, { isOperational: false, cause })

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
