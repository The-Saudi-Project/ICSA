/**
 * A restaurant reading and changing its own record.
 *
 * Two things govern everything here.
 *
 * **The tenant is never a parameter.** There is no `:id` on any of these routes
 * and no restaurant identifier in any body. `requireTenantId()` reads it from
 * the verified access token, so "update my restaurant" cannot be aimed at
 * somebody else's, however the request is crafted. That is why this module
 * cannot use `tenantRepo`: the Restaurant collection *is* the tenant list, so a
 * `restaurantId` filter on it is meaningless — the id is the `_id`.
 *
 * **Not everything here is the restaurant's to change.** The split lives in
 * `updateRestaurantSettingsSchema` (owner) and `updateRestaurantFinanceSchema`
 * (platform), and the reasoning is written there. The short version: a
 * restaurant does not choose its own VAT rate, because in Saudi Arabia that
 * number is set by ZATCA and a wrong one corrupts every invoice.
 */

import type {
  UpdateRestaurantFinanceInput,
  UpdateRestaurantSettingsInput,
} from '@rw/shared'
import { writeAudit } from '../../core/audit.js'
import { notFound } from '../../core/errors.js'
import { requireTenantId } from '../../core/tenant.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { assertOwnedImageUrl } from '../images/index.js'
import { RestaurantModel, type RestaurantDoc } from './restaurant.model.js'

/**
 * What a restaurant sees about itself.
 *
 * The money settings are included even though the owner cannot change them —
 * an owner absolutely needs to know the VAT rate their prices are being taxed
 * at. The screen renders them read-only. Hiding them would be worse than
 * showing them: it would leave the owner unable to reconcile their own totals.
 */
export interface RestaurantSelfView {
  id: string
  publicId: string
  name: unknown
  slug: string
  type: string
  status: string
  addressLine?: string | null
  city?: string | null
  phone?: string | null
  logoUrl?: string | null
  vatNumber?: string | null
  crNumber?: string | null
  settings: {
    currency: string
    vatRatePercent: number
    pricesIncludeVat: boolean
    serviceChargePercent: number
    kitchenStartsBeforePayment: boolean
    tableSessionTtlMinutes: number
    defaultLocale: string
    orderTypes: string[]
  }
  /**
   * Which of the above the caller may actually change, so the interface does not
   * have to hard-code the policy and then drift from it. The server remains the
   * only enforcement — this is for rendering, not for permission.
   */
  editable: {
    settings: readonly string[]
    finance: readonly string[]
  }
}

/** Owner-editable keys, named once so the view and the docs cannot disagree. */
const OWNER_EDITABLE = [
  'name',
  'addressLine',
  'city',
  'phone',
  'logoUrl',
  'vatNumber',
  'crNumber',
  'serviceChargePercent',
  'kitchenStartsBeforePayment',
  'tableSessionTtlMinutes',
  'defaultLocale',
] as const

/** Platform-only keys. Listed so the UI can say *why* a field is disabled. */
const PLATFORM_ONLY = ['vatRatePercent', 'pricesIncludeVat', 'orderTypes'] as const

function toSelfView(restaurant: RestaurantDoc): RestaurantSelfView {
  const settings = restaurant.settings
  return {
    id: restaurant._id.toString(),
    publicId: restaurant.publicId,
    name: restaurant.name,
    slug: restaurant.slug,
    type: restaurant.type,
    status: restaurant.status,
    addressLine: restaurant.addressLine,
    city: restaurant.city,
    phone: restaurant.phone,
    logoUrl: restaurant.logoUrl,
    vatNumber: restaurant.vatNumber,
    crNumber: restaurant.crNumber,
    settings: {
      currency: settings.currency,
      vatRatePercent: settings.vatRatePercent,
      pricesIncludeVat: settings.pricesIncludeVat,
      serviceChargePercent: settings.serviceChargePercent,
      kitchenStartsBeforePayment: settings.kitchenStartsBeforePayment,
      tableSessionTtlMinutes: settings.tableSessionTtlMinutes,
      defaultLocale: settings.defaultLocale,
      orderTypes: [...settings.orderTypes],
    },
    editable: { settings: OWNER_EDITABLE, finance: PLATFORM_ONLY },
  }
}

/** The caller's own restaurant. The id comes from the token. */
export async function getOwnRestaurant(): Promise<RestaurantSelfView> {
  const restaurant = await RestaurantModel.findById(requireTenantId())
  if (!restaurant) throw notFound('Restaurant not found')
  return toSelfView(restaurant)
}

/**
 * Fields that live at the top level of the document rather than under
 * `settings`, so the update can be assembled with dotted paths and a document
 * that predates a setting still gets it written.
 */
const PROFILE_KEYS = [
  'name',
  'addressLine',
  'city',
  'phone',
  'logoUrl',
  'vatNumber',
  'crNumber',
] as const

export async function updateOwnRestaurant(
  input: UpdateRestaurantSettingsInput,
): Promise<RestaurantSelfView> {
  const restaurantId = requireTenantId()

  const existing = await RestaurantModel.findById(restaurantId)
  if (!existing) throw notFound('Restaurant not found')

  // The same rule menu images obey. A logo is rendered on the customer's phone,
  // so an arbitrary URL here is an arbitrary host on our page.
  if (input.logoUrl !== undefined) assertOwnedImageUrl(input.logoUrl, restaurantId)

  // Dotted paths, so writing `settings.serviceChargePercent` cannot replace the
  // whole `settings` subdocument and silently reset every other value in it.
  const set: Record<string, unknown> = {}
  for (const key of PROFILE_KEYS) {
    if (input[key] !== undefined) set[key] = input[key]
  }
  for (const key of ['serviceChargePercent', 'kitchenStartsBeforePayment', 'tableSessionTtlMinutes', 'defaultLocale'] as const) {
    if (input[key] !== undefined) set[`settings.${key}`] = input[key]
  }

  const updated = await RestaurantModel.findOneAndUpdate(
    { _id: restaurantId },
    { $set: set },
    { new: true, runValidators: true },
  )
  if (!updated) throw notFound('Restaurant not found')

  await writeSettingsAudit(existing, updated, Object.keys(set))

  return toSelfView(updated)
}

/**
 * Platform-only money settings.
 *
 * Reached from `/platform/restaurants/:id`, behind `requirePlatformAdmin`, so
 * the tenant here legitimately *is* a parameter — that is the difference between
 * this function and every other one in the file, and it is why they are separate
 * functions rather than one with a flag.
 */
export async function updateRestaurantFinance(
  restaurantId: string,
  input: UpdateRestaurantFinanceInput,
): Promise<RestaurantDoc> {
  const existing = await RestaurantModel.findById(restaurantId)
  if (!existing) throw notFound('Restaurant not found')

  const set: Record<string, unknown> = {}
  for (const key of ['vatRatePercent', 'pricesIncludeVat', 'orderTypes'] as const) {
    if (input[key] !== undefined) set[`settings.${key}`] = input[key]
  }

  // No `unscoped: true` here, and none is needed: Restaurant carries no tenant
  // guard because this collection *is* the tenant list. Adding the option would
  // imply a guard exists and quietly mislead the next reader.
  const updated = await RestaurantModel.findOneAndUpdate(
    { _id: restaurantId },
    { $set: set },
    { new: true, runValidators: true },
  )
  if (!updated) throw notFound('Restaurant not found')

  // The rate itself gets its own event with before and after, because it is the
  // single most consequential number in the product and "someone changed the
  // settings" is not an answer anybody can act on six months later.
  if (
    input.vatRatePercent !== undefined &&
    input.vatRatePercent !== existing.settings.vatRatePercent
  ) {
    await writeAudit({
      action: AuditAction.RESTAURANT_VAT_CHANGED,
      targetType: 'Restaurant',
      targetId: restaurantId,
      restaurantId,
      metadata: {
        from: existing.settings.vatRatePercent,
        to: input.vatRatePercent,
        slug: existing.slug,
      },
    })
  }

  if (
    input.pricesIncludeVat !== undefined &&
    input.pricesIncludeVat !== existing.settings.pricesIncludeVat
  ) {
    await writeAudit({
      action: AuditAction.RESTAURANT_VAT_CHANGED,
      targetType: 'Restaurant',
      targetId: restaurantId,
      restaurantId,
      metadata: {
        field: 'pricesIncludeVat',
        from: existing.settings.pricesIncludeVat,
        to: input.pricesIncludeVat,
        slug: existing.slug,
      },
    })
  }

  await writeAudit({
    action: AuditAction.RESTAURANT_SETTINGS_UPDATED,
    targetType: 'Restaurant',
    targetId: restaurantId,
    restaurantId,
    metadata: { changed: Object.keys(set), by: 'platform' },
  })

  return updated
}

/**
 * One generic event plus a dedicated one for each consequential change.
 *
 * The generic event alone would satisfy "something was audited" while failing
 * the thing an audit trail is for: being able to answer, later, *what the number
 * was before*.
 */
async function writeSettingsAudit(
  before: RestaurantDoc,
  after: RestaurantDoc,
  changedKeys: string[],
): Promise<void> {
  if (before.settings.serviceChargePercent !== after.settings.serviceChargePercent) {
    await writeAudit({
      action: AuditAction.RESTAURANT_SERVICE_CHARGE_CHANGED,
      targetType: 'Restaurant',
      targetId: after._id.toString(),
      metadata: {
        fromPercent: before.settings.serviceChargePercent,
        toPercent: after.settings.serviceChargePercent,
      },
    })
  }

  if (
    before.settings.kitchenStartsBeforePayment !== after.settings.kitchenStartsBeforePayment
  ) {
    await writeAudit({
      action: AuditAction.RESTAURANT_PAYMENT_POLICY_CHANGED,
      targetType: 'Restaurant',
      targetId: after._id.toString(),
      metadata: {
        from: before.settings.kitchenStartsBeforePayment,
        to: after.settings.kitchenStartsBeforePayment,
        meaning: after.settings.kitchenStartsBeforePayment
          ? 'kitchen now starts before cash is confirmed'
          : 'cash must be confirmed before the kitchen starts',
      },
    })
  }

  await writeAudit({
    action: AuditAction.RESTAURANT_SETTINGS_UPDATED,
    targetType: 'Restaurant',
    targetId: after._id.toString(),
    metadata: { changed: changedKeys },
  })
}
