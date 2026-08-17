/**
 * Menu management and the customer-facing menu.
 *
 * Everything here goes through `tenantRepo`, so a restaurant can only ever see
 * and change its own menu. The customer view additionally hides anything
 * inactive or unavailable — a customer must not be able to order a retired item
 * by guessing its id.
 */

import type { CreateCategoryInput, CreateMenuItemInput } from '@rw/shared'
import { writeAudit } from '../../core/audit.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { tenantRepo } from '../../core/tenant.js'
import { AuditAction } from '../audit/auditLog.model.js'
// Shared with the restaurant logo, so "is this URL ours" has one definition.
import { assertOwnedImageUrl } from '../images/index.js'
import { MenuCategoryModel, type MenuCategoryDoc } from './menuCategory.model.js'
import { MenuItemModel, type MenuItemDoc } from './menuItem.model.js'

/* ── categories ───────────────────────────────────────────────────────────── */

export interface CategoryView {
  id: string
  name: unknown
  description?: unknown
  sortOrder: number
  isActive: boolean
  itemCount?: number
}

function toCategoryView(category: MenuCategoryDoc): CategoryView {
  return {
    id: category._id.toString(),
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  }
}

export async function listCategories(): Promise<CategoryView[]> {
  const repo = tenantRepo(MenuCategoryModel)
  const categories = await repo.find({}, { sort: { sortOrder: 1 } })

  const itemRepo = tenantRepo(MenuItemModel)
  return Promise.all(
    categories.map(async (c) => ({
      ...toCategoryView(c),
      itemCount: await itemRepo.countDocuments({ categoryId: c._id }),
    })),
  )
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryView> {
  const repo = tenantRepo(MenuCategoryModel)

  if (await repo.exists({ 'name.en': input.name.en })) {
    throw conflict('A category with that name already exists')
  }

  const category = await repo.create(input)

  await writeAudit({
    action: AuditAction.MENU_CATEGORY_CREATED,
    targetType: 'MenuCategory',
    targetId: category._id.toString(),
    metadata: { name: input.name.en },
  })

  return toCategoryView(category)
}

export async function updateCategory(
  id: string,
  input: Partial<CreateCategoryInput>,
): Promise<CategoryView> {
  const repo = tenantRepo(MenuCategoryModel)

  const existing = await repo.findById(id)
  if (!existing) throw notFound('Category not found')

  if (input.name?.en && input.name.en !== existing.name.en) {
    if (await repo.exists({ 'name.en': input.name.en })) {
      throw conflict('A category with that name already exists')
    }
  }

  const updated = await repo.findByIdAndUpdate(id, { $set: input })
  if (!updated) throw notFound('Category not found')

  await writeAudit({
    action: AuditAction.MENU_CATEGORY_UPDATED,
    targetType: 'MenuCategory',
    targetId: id,
    metadata: { changes: Object.keys(input) },
  })

  return toCategoryView(updated)
}

/**
 * Deleting a category with items in it would orphan them, so it is refused.
 * The owner deactivates it instead, or moves the items first.
 */
export async function deleteCategory(id: string): Promise<void> {
  const repo = tenantRepo(MenuCategoryModel)

  const category = await repo.findById(id)
  if (!category) throw notFound('Category not found')

  const itemCount = await tenantRepo(MenuItemModel).countDocuments({ categoryId: category._id })
  if (itemCount > 0) {
    throw conflict(
      `This category still contains ${itemCount} item(s). Move or delete them first, or deactivate the category instead.`,
    )
  }

  await repo.deleteById(id)

  await writeAudit({
    action: AuditAction.MENU_CATEGORY_DELETED,
    targetType: 'MenuCategory',
    targetId: id,
    metadata: { name: category.name.en },
  })
}

/* ── items ────────────────────────────────────────────────────────────────── */

export interface MenuItemView {
  id: string
  categoryId: string
  name: unknown
  description?: unknown
  priceHalalas: number
  vatRatePercent?: number | null
  imageUrl?: string | null
  isAvailable: boolean
  isActive: boolean
  prepTimeMinutes?: number | null
  calories?: number | null
  ingredients: string[]
  allergens: string[]
  /** Staff-only. `null` means this dish is not counted. */
  stockRemaining?: number | null
  sortOrder: number
  modifierGroups: unknown[]
}

function toItemView(item: MenuItemDoc): MenuItemView {
  return {
    id: item._id.toString(),
    categoryId: item.categoryId.toString(),
    name: item.name,
    description: item.description,
    priceHalalas: item.priceHalalas,
    vatRatePercent: item.vatRatePercent,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    isActive: item.isActive,
    prepTimeMinutes: item.prepTimeMinutes,
    calories: item.calories,
    ingredients: item.ingredients,
    allergens: item.allergens,
    stockRemaining: item.stockRemaining,
    sortOrder: item.sortOrder,
    modifierGroups: item.modifierGroups,
  }
}

export async function listItems(filter: { categoryId?: string } = {}): Promise<MenuItemView[]> {
  const query: Record<string, unknown> = {}
  if (filter.categoryId) query.categoryId = filter.categoryId

  const items = await tenantRepo(MenuItemModel).find(query, { sort: { sortOrder: 1 } })
  return items.map(toItemView)
}

export async function createItem(input: CreateMenuItemInput): Promise<MenuItemView> {
  const repo = tenantRepo(MenuItemModel)

  // The category must belong to this tenant. tenantRepo makes that automatic:
  // another restaurant's category id simply resolves to null.
  const category = await tenantRepo(MenuCategoryModel).findById(input.categoryId)
  if (!category) throw badRequest('Unknown category')

  assertOwnedImageUrl(input.imageUrl, repo.restaurantId)

  const item = await repo.create(input)

  await writeAudit({
    action: AuditAction.MENU_ITEM_CREATED,
    targetType: 'MenuItem',
    targetId: item._id.toString(),
    metadata: { name: input.name.en, priceHalalas: input.priceHalalas },
  })

  return toItemView(item)
}

export async function updateItem(
  id: string,
  input: Partial<CreateMenuItemInput>,
): Promise<MenuItemView> {
  const repo = tenantRepo(MenuItemModel)

  const existing = await repo.findById(id)
  if (!existing) throw notFound('Item not found')

  if (input.categoryId) {
    const category = await tenantRepo(MenuCategoryModel).findById(input.categoryId)
    if (!category) throw badRequest('Unknown category')
  }

  assertOwnedImageUrl(input.imageUrl, repo.restaurantId)

  const updated = await repo.findByIdAndUpdate(id, { $set: input })
  if (!updated) throw notFound('Item not found')

  // A price change is money-relevant, so it gets its own audit action with the
  // before and after values rather than being lost inside a generic update.
  if (input.priceHalalas !== undefined && input.priceHalalas !== existing.priceHalalas) {
    await writeAudit({
      action: AuditAction.MENU_PRICE_CHANGED,
      targetType: 'MenuItem',
      targetId: id,
      metadata: {
        name: existing.name.en,
        fromHalalas: existing.priceHalalas,
        toHalalas: input.priceHalalas,
      },
    })
  }

  await writeAudit({
    action: AuditAction.MENU_ITEM_UPDATED,
    targetType: 'MenuItem',
    targetId: id,
    metadata: { changes: Object.keys(input) },
  })

  return toItemView(updated)
}

/** The one field a cashier may change — for an item that runs out mid-service. */
export async function setItemAvailability(
  id: string,
  isAvailable: boolean,
): Promise<MenuItemView> {
  const updated = await tenantRepo(MenuItemModel).findByIdAndUpdate(id, { $set: { isAvailable } })
  if (!updated) throw notFound('Item not found')

  await writeAudit({
    action: AuditAction.MENU_ITEM_AVAILABILITY_CHANGED,
    targetType: 'MenuItem',
    targetId: id,
    metadata: { name: updated.name.en, isAvailable },
  })

  return toItemView(updated)
}

export async function deleteItem(id: string): Promise<void> {
  const repo = tenantRepo(MenuItemModel)

  const item = await repo.findById(id)
  if (!item) throw notFound('Item not found')

  await repo.deleteById(id)

  await writeAudit({
    action: AuditAction.MENU_ITEM_DELETED,
    targetType: 'MenuItem',
    targetId: id,
    metadata: { name: item.name.en },
  })
}

/* ── customer view ────────────────────────────────────────────────────────── */

export interface PublicMenuCategory {
  id: string
  name: unknown
  description?: unknown
  items: Array<{
    id: string
    name: unknown
    description?: unknown
    priceHalalas: number
    imageUrl?: string | null
    prepTimeMinutes?: number | null
    /** Restaurant-supplied. The UI must label it as the restaurant's own claim. */
    calories?: number | null
    allergens: string[]
    /**
     * Whether the dish can be ordered right now — because staff marked it sold
     * out, or because the portion count reached zero.
     *
     * A boolean, never a number. How many portions remain is the restaurant's
     * business and is deliberately not on this surface: it tells a customer how
     * well a dish is selling and invites "only 2 left" pressure we have not
     * chosen to create.
     */
    isSoldOut: boolean
    modifierGroups: unknown[]
  }>
}

export interface PublicMenu {
  categories: PublicMenuCategory[]
  /** Changes whenever anything in the menu changes — used for the ETag. */
  version: string
}

/**
 * The customer menu.
 *
 * Two loads, not one per category: MongoDB has no joins worth using here, and
 * fetching every active item for the tenant in a single indexed query and
 * grouping in memory is faster than N queries. A menu is tens of items, not
 * thousands.
 */
export async function getPublicMenu(): Promise<PublicMenu> {
  const [categories, items] = await Promise.all([
    tenantRepo(MenuCategoryModel).find({ isActive: true }, { sort: { sortOrder: 1 } }),
    // Sold-out dishes stay on the menu, marked, rather than vanishing — a
    // customer who cannot find yesterday's favourite assumes the page is broken.
    // Retired items (`isActive: false`) are still gone entirely; retired and
    // sold out are different things.
    tenantRepo(MenuItemModel).find({ isActive: true }, { sort: { sortOrder: 1 } }),
  ])

  const byCategory = new Map<string, MenuItemDoc[]>()
  for (const item of items) {
    const key = item.categoryId.toString()
    const bucket = byCategory.get(key)
    if (bucket) bucket.push(item)
    else byCategory.set(key, [item])
  }

  let newestChange = 0
  const check = (d: { updatedAt?: Date }) => {
    const t = d.updatedAt?.getTime() ?? 0
    if (t > newestChange) newestChange = t
  }
  categories.forEach(check)
  items.forEach(check)

  return {
    categories: categories
      // An empty category is noise on a phone screen.
      .filter((c) => (byCategory.get(c._id.toString()) ?? []).length > 0)
      .map((c) => ({
        id: c._id.toString(),
        name: c.name,
        description: c.description,
        items: (byCategory.get(c._id.toString()) ?? []).map((i) => ({
          id: i._id.toString(),
          name: i.name,
          description: i.description,
          priceHalalas: i.priceHalalas,
          imageUrl: i.imageUrl,
          prepTimeMinutes: i.prepTimeMinutes,
          calories: i.calories,
          allergens: i.allergens,
          isSoldOut: !i.isAvailable || i.stockRemaining === 0,
          // Unavailable options are hidden, so a customer cannot pick one.
          modifierGroups: i.modifierGroups.map((g) => ({
            key: g.key,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            required: g.required,
            options: g.options
              .filter((o) => o.isAvailable)
              .map((o) => ({
                key: o.key,
                name: o.name,
                priceDeltaHalalas: o.priceDeltaHalalas,
              })),
          })),
        })),
      })),
    version: `${items.length}-${categories.length}-${newestChange}`,
  }
}
