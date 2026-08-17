import { z } from 'zod'
import {
  MAX_SERVICE_CHARGE_PERCENT,
  MAX_TABLE_SESSION_TTL_MINUTES,
  RestaurantStatus,
  RestaurantType,
} from '../enums.js'
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

/* ── restaurant self-service settings ─────────────────────────────────────────
 *
 * The split below is the whole design, and it is a policy decision rather than a
 * technical one (product owner, 2026-08-15):
 *
 *   Owner-editable   things a restaurant genuinely chooses — how it presents
 *                    itself, whether it takes a service charge, whether the
 *                    kitchen starts before the cash is confirmed.
 *   Platform-only    things that are law or that decide what a bill comes to.
 *                    A restaurant does not get to pick its own VAT rate.
 *
 * Anything money-relevant that an owner *can* change is capped here rather than
 * only in the UI, because the UI is not a security boundary.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * What a restaurant owner or manager may change about their own restaurant.
 *
 * Deliberately absent, and each for a reason:
 *
 *  - `vatRatePercent` — the rate is set by ZATCA, not by a restaurant. A wrong
 *    value under-collects tax and corrupts every invoice and every future
 *    accounting sync. Genuinely zero-rated dishes are already handled by the
 *    per-item `vatRatePercent` override on the menu item itself.
 *  - `pricesIncludeVat` — same reasoning. KSA consumer price display is
 *    VAT-inclusive, and this is a silent boolean that moves every bill by the
 *    whole VAT rate. It is not a preference to toggle mid-service.
 *  - `currency` — SAR only, enforced by the model's enum.
 *  - `orderTypes` — gates features (takeaway, pickup) that the platform sells,
 *    so the platform decides which a tenant has.
 *  - `slug`, `status`, `type`, `parentId` — identity and commercial state.
 */
export const updateRestaurantSettingsSchema = z
  .object({
    /** Shown to customers, so both scripts are accepted. */
    name: localizedTextSchema.optional(),
    addressLine: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    /**
     * Must be a URL this tenant uploaded. Validated against the image provider
     * server-side — never trusted from the client — for the same reason menu
     * images are: an arbitrary URL here would make our customer-facing page
     * load content from a host we do not control. An empty string clears it.
     */
    logoUrl: z.string().trim().max(500).optional(),

    /** 15 digits in KSA. Appears on invoices from Phase 2 onward. */
    vatNumber: z
      .string()
      .trim()
      .regex(/^\d{15}$/, 'a Saudi VAT number is 15 digits')
      .optional()
      .or(z.literal('')),
    /** Commercial registration, 10 digits. */
    crNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'a commercial registration number is 10 digits')
      .optional()
      .or(z.literal('')),

    serviceChargePercent: z
      .number()
      .int('a service charge must be a whole percentage')
      .min(0)
      .max(
        MAX_SERVICE_CHARGE_PERCENT,
        `a service charge cannot exceed ${MAX_SERVICE_CHARGE_PERCENT}%`,
      )
      .optional(),

    /**
     * true means the kitchen starts before a cashier has confirmed the cash.
     * The restaurant may choose that; it is their food being cooked on trust.
     */
    kitchenStartsBeforePayment: z.boolean().optional(),

    tableSessionTtlMinutes: z
      .number()
      .int()
      .min(5)
      .max(
        MAX_TABLE_SESSION_TTL_MINUTES,
        `a table session cannot last longer than ${MAX_TABLE_SESSION_TTL_MINUTES} minutes`,
      )
      .optional(),

    defaultLocale: z.enum(['en', 'ar']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'no fields to update')
export type UpdateRestaurantSettingsInput = z.infer<typeof updateRestaurantSettingsSchema>

/**
 * The money settings, which only a platform admin may set.
 *
 * Separate from `updateRestaurantSettingsSchema` so the two can never be
 * confused at a call site: this one is reachable only from the platform router,
 * behind `requirePlatformAdmin`.
 */
export const updateRestaurantFinanceSchema = z
  .object({
    vatRatePercent: z.number().min(0).max(100).optional(),
    pricesIncludeVat: z.boolean().optional(),
    orderTypes: z.array(z.string()).min(1).max(4).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'no fields to update')
export type UpdateRestaurantFinanceInput = z.infer<typeof updateRestaurantFinanceSchema>
