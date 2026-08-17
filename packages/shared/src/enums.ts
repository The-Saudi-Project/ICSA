/**
 * Enums shared by the API and the web app.
 *
 * Kept as `as const` objects (not TS `enum`) so they survive `isolatedModules`,
 * erase cleanly at runtime, and can be handed straight to Zod and Mongoose.
 */

export const Role = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  KITCHEN: 'KITCHEN',
  WAITER: 'WAITER',
} as const
export type Role = (typeof Role)[keyof typeof Role]
export const ROLES = Object.values(Role)

/** Roles that belong to a restaurant tenant. PLATFORM_ADMIN deliberately does not. */
export const TENANT_ROLES = [
  Role.OWNER,
  Role.MANAGER,
  Role.CASHIER,
  Role.KITCHEN,
  Role.WAITER,
] as const

export const RestaurantStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const
export type RestaurantStatus = (typeof RestaurantStatus)[keyof typeof RestaurantStatus]

export const RestaurantType = {
  SINGLE: 'SINGLE',
  CHAIN_MAIN: 'CHAIN_MAIN',
  BRANCH: 'BRANCH',
} as const
export type RestaurantType = (typeof RestaurantType)[keyof typeof RestaurantType]

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]

export const OrderType = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY', // Phase 2
  PICKUP: 'PICKUP', // Phase 2
} as const
export type OrderType = (typeof OrderType)[keyof typeof OrderType]

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD', // Phase 2
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

/** Currency is fixed to SAR for now. Kept as a constant so it is never hard-coded inline. */
export const CURRENCY = 'SAR' as const

/** Default KSA VAT rate. Per-restaurant configurable — never assume this at a call site. */
export const DEFAULT_VAT_RATE_PERCENT = 15

/**
 * Ceiling on a restaurant's service charge, in percent.
 *
 * The database column allows 0–100, which is a storage bound rather than a
 * policy: a mistyped `100` would silently double every customer's bill. No
 * hospitality service charge is anywhere near this, so the API refuses higher.
 *
 * Lives here, beside the other money constants, rather than in
 * `schemas/restaurant.ts` — that file imports Zod, and the customer bundle must
 * never pull Zod in to read a number.
 */
export const MAX_SERVICE_CHARGE_PERCENT = 15

/**
 * Ceiling on a table session, in minutes.
 *
 * The column allows 1440 — a full day — which was never the intent; the default
 * is 180. A session is also how long a *photographed* QR code keeps working, so
 * the practical bound is one long service, not one day.
 */
export const MAX_TABLE_SESSION_TTL_MINUTES = 480
