import { z } from 'zod'
import { RestaurantStatus, RestaurantType } from '../enums.js'
import { emailSchema, localizedTextSchema } from './common.js'

/**
 * Slug rules.
 *
 * The slug appears in customer-facing URLs, so it must be lowercase, hyphenated
 * and stable. A reserved list keeps it from colliding with real API paths — a
 * restaurant called "api" or "admin" would be a routing bug waiting to happen.
 */
const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'platform',
  'auth',
  'app',
  'www',
  'health',
  'readyz',
  'static',
  'assets',
  't', // the table-entry route, /t/<token>
])

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'use lowercase letters, numbers and hyphens')
  .refine((s) => !s.includes('--'), 'must not contain consecutive hyphens')
  .refine((s) => !RESERVED_SLUGS.has(s), 'that name is reserved')

export const createRestaurantSchema = z.object({
  name: localizedTextSchema,
  slug: slugSchema,
  type: z.enum([RestaurantType.SINGLE, RestaurantType.CHAIN_MAIN, RestaurantType.BRANCH]).default(RestaurantType.SINGLE),
  parentId: z.string().optional(),
  owner: z.object({
    email: emailSchema,
    name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+9665\d{8}$/, 'must be a Saudi mobile number in +9665XXXXXXXX form')
      .optional(),
  }),
  vatNumber: z.string().trim().max(30).optional(),
  crNumber: z.string().trim().max(30).optional(),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
})
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>

export const updateRestaurantStatusSchema = z.object({
  status: z.enum([RestaurantStatus.ACTIVE, RestaurantStatus.SUSPENDED]),
  /** Recorded in the audit log. Suspension is a commercial act; say why. */
  reason: z.string().trim().max(300).optional(),
})
export type UpdateRestaurantStatusInput = z.infer<typeof updateRestaurantStatusSchema>
