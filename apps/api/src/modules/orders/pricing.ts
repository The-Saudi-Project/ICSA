/**
 * Order pricing.
 *
 * The single most security-relevant piece of arithmetic in the product, and the
 * rule is one sentence: **the client sends what it wants, the server decides
 * what it costs.**
 *
 * The request contains item ids, quantities and modifier keys. Nothing else.
 * Every price, every VAT figure and every total is looked up fresh from the
 * database here, and any price a client tried to send has already been stripped
 * by the Zod schema — it is not in the input type at all.
 *
 * All arithmetic goes through `@rw/shared/money`, which works in integer
 * halalas. No float ever touches a price.
 */

import {
  multiplyHalalas,
  splitVatInclusive,
  addVat,
  sumHalalas,
  type CreateOrderInput,
} from '@rw/shared'
import { trusted } from 'mongoose'
import { badRequest } from '../../core/errors.js'
import { tenantRepo } from '../../core/tenant.js'
import { MenuItemModel, type MenuItemDoc } from '../menu/menuItem.model.js'

export interface PricedModifier {
  groupKey: string
  optionKey: string
  // Mongoose returns an unset optional string as `null`, so the snapshot types
  // have to admit it rather than pretend it is always absent.
  nameSnapshot: { en: string; ar?: string | null }
  groupNameSnapshot: { en: string; ar?: string | null }
  priceDeltaHalalas: number
}

export interface PricedItem {
  menuItemId: string
  // Mongoose returns an unset optional string as `null`, so the snapshot types
  // have to admit it rather than pretend it is always absent.
  nameSnapshot: { en: string; ar?: string | null }
  unitPriceHalalas: number
  vatRatePercentSnapshot: number
  quantity: number
  modifiers: PricedModifier[]
  lineSubtotalHalalas: number
  lineVatHalalas: number
  lineTotalHalalas: number
  prepTimeMinutes?: number
  note?: string
}

export interface PricedOrder {
  items: PricedItem[]
  totals: {
    subtotalHalalas: number
    vatHalalas: number
    serviceChargeHalalas: number
    grandTotalHalalas: number
  }
}

export interface RestaurantPricingSettings {
  vatRatePercent: number
  pricesIncludeVat: boolean
  serviceChargePercent: number
  currency: string
}

/**
 * Validates a customer's modifier choices against the item's actual groups.
 *
 * Three things are checked, and all three matter:
 *  - the group and option exist on *this* item (not on some other item);
 *  - the option is currently available (a sold-out extra cannot be ordered);
 *  - the group's min/max selection rules are satisfied.
 *
 * A client that skips the UI and posts raw JSON gets the same treatment.
 */
function priceModifiers(
  item: MenuItemDoc,
  selections: ReadonlyArray<{ groupKey: string; optionKey: string }>,
): PricedModifier[] {
  const priced: PricedModifier[] = []
  const countPerGroup = new Map<string, number>()

  for (const selection of selections) {
    const group = item.modifierGroups.find((g) => g.key === selection.groupKey)
    if (!group) {
      throw badRequest(`Unknown option group "${selection.groupKey}" for ${item.name.en}`)
    }

    const option = group.options.find((o) => o.key === selection.optionKey)
    if (!option) {
      throw badRequest(`Unknown option "${selection.optionKey}" for ${item.name.en}`)
    }
    if (!option.isAvailable) {
      throw badRequest(`"${option.name.en}" is not available right now`)
    }

    const used = (countPerGroup.get(group.key) ?? 0) + 1
    countPerGroup.set(group.key, used)
    if (used > group.maxSelect) {
      throw badRequest(`Choose at most ${group.maxSelect} from "${group.name.en}"`)
    }

    priced.push({
      groupKey: group.key,
      optionKey: option.key,
      nameSnapshot: { en: option.name.en, ar: option.name.ar },
      groupNameSnapshot: { en: group.name.en, ar: group.name.ar },
      priceDeltaHalalas: option.priceDeltaHalalas,
    })
  }

  // Required groups, and minimums, are checked after the loop so that omitting
  // a group entirely is caught as well as under-selecting one.
  for (const group of item.modifierGroups) {
    const chosen = countPerGroup.get(group.key) ?? 0
    if (group.required && chosen < Math.max(1, group.minSelect)) {
      throw badRequest(`"${group.name.en}" is required for ${item.name.en}`)
    }
    if (chosen > 0 && chosen < group.minSelect) {
      throw badRequest(`Choose at least ${group.minSelect} from "${group.name.en}"`)
    }
  }

  return priced
}

/**
 * Prices a whole order from the database.
 *
 * Items are fetched through `tenantRepo`, so an id belonging to another
 * restaurant simply does not resolve — a customer cannot order a competitor's
 * cheaper item into this restaurant's bill.
 */
export async function priceOrder(
  input: CreateOrderInput,
  settings: RestaurantPricingSettings,
): Promise<PricedOrder> {
  const repo = tenantRepo(MenuItemModel)

  // One query for the whole order rather than one per line.
  //
  // `mongoose.trusted()` is required because `sanitizeFilter` is on globally:
  // it wraps any operator-shaped object in `$eq` so that a `{"$ne": null}`
  // arriving from a client cannot become a query operator. That protection
  // applies to our own operators too, so a deliberate `$in` must say so.
  const requestedIds = [...new Set(input.items.map((i) => i.menuItemId))]
  const found = await repo.find({ _id: trusted({ $in: requestedIds }) })
  const byId = new Map(found.map((item) => [item._id.toString(), item]))

  const pricedItems: PricedItem[] = input.items.map((line) => {
    const item = byId.get(line.menuItemId)

    // Missing, another tenant's, retired or sold out — all the same message.
    // A customer does not need to know which, and an attacker must not learn
    // whether an id exists in another restaurant.
    if (!item || !item.isActive) throw badRequest('One of the items is no longer on the menu')
    if (!item.isAvailable) throw badRequest(`"${item.name.en}" is not available right now`)

    const modifiers = priceModifiers(item, line.modifiers)

    // Unit price = the item plus everything added to it.
    const unitWithModifiers = sumHalalas([
      item.priceHalalas,
      ...modifiers.map((m) => m.priceDeltaHalalas),
    ])
    const lineGross = multiplyHalalas(unitWithModifiers, line.quantity)

    // A per-item VAT rate wins over the restaurant default, so a zero-rated
    // item can sit next to a standard-rated one on the same bill.
    const vatRate = item.vatRatePercent ?? settings.vatRatePercent

    // In KSA the shelf price normally includes VAT, so the line total is known
    // and VAT is extracted from it. If the restaurant prices excluding VAT, it
    // is added on instead. Either way net + vat === gross exactly.
    const breakdown = settings.pricesIncludeVat
      ? splitVatInclusive(lineGross, vatRate)
      : addVat(lineGross, vatRate)

    return {
      menuItemId: item._id.toString(),
      nameSnapshot: { en: item.name.en, ar: item.name.ar },
      unitPriceHalalas: item.priceHalalas,
      vatRatePercentSnapshot: vatRate,
      quantity: line.quantity,
      modifiers,
      lineSubtotalHalalas: breakdown.netHalalas,
      lineVatHalalas: breakdown.vatHalalas,
      lineTotalHalalas: breakdown.grossHalalas,
      ...(item.prepTimeMinutes != null ? { prepTimeMinutes: item.prepTimeMinutes } : {}),
      ...(line.note ? { note: line.note } : {}),
    }
  })

  const subtotalHalalas = sumHalalas(pricedItems.map((i) => i.lineSubtotalHalalas))
  const vatHalalas = sumHalalas(pricedItems.map((i) => i.lineVatHalalas))
  const itemsTotal = sumHalalas(pricedItems.map((i) => i.lineTotalHalalas))

  // Service charge is applied to the whole bill, not per line, so it rounds
  // once instead of once per item.
  const serviceChargeHalalas =
    settings.serviceChargePercent > 0
      ? Math.round((itemsTotal * settings.serviceChargePercent) / 100)
      : 0

  return {
    items: pricedItems,
    totals: {
      subtotalHalalas,
      vatHalalas,
      serviceChargeHalalas,
      grandTotalHalalas: itemsTotal + serviceChargeHalalas,
    },
  }
}
