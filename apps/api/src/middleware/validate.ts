/**
 * Zod request validation.
 *
 * Every route validates its input through this. Beyond catching bad data, it is
 * the primary defence against NoSQL operator injection: a schema that expects a
 * string rejects `{ "$ne": null }` outright, so an object shaped like a MongoDB
 * operator can never reach a query.
 *
 * The parsed (and therefore coerced and stripped) result replaces the raw
 * input, so handlers only ever see validated data.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodType } from 'zod'

export interface ValidationSchemas {
  body?: ZodType
  params?: ZodType
  query?: ZodType
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params))
      }
      if (schemas.query) {
        // Express 5 makes req.query a getter, so it cannot be reassigned.
        // The validated value is attached instead; handlers read req.validatedQuery.
        ;(req as Request & { validatedQuery?: unknown }).validatedQuery = schemas.query.parse(
          req.query,
        )
      }
      next()
    } catch (error) {
      next(error) // ZodError is translated to a 422 by the error handler
    }
  }
}
