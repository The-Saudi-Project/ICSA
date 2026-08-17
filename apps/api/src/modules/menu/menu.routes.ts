/**
 * Menu management — restaurant side.
 *
 * Owner and manager for everything, with one deliberate exception: a cashier
 * may toggle availability. When the kitchen runs out of a dish mid-service,
 * whoever is at the till needs to take it off the menu immediately, and making
 * them find a manager first means customers keep ordering something that does
 * not exist.
 */

import {
  createCategorySchema,
  createMenuItemSchema,
  objectIdSchema,
  Role,
  setAvailabilitySchema,
  updateCategorySchema,
  updateMenuItemSchema,
} from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { writeAudit } from '../../core/audit.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireRestaurantAdmin, requireRole } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { imageProvider } from '../images/index.js'
import { tenantRepo } from '../../core/tenant.js'
import { MenuItemModel } from './menuItem.model.js'
import * as menuService from './menu.service.js'

export const menuRouter: Router = Router()

menuRouter.use(requireAuth)

const idParamsSchema = z.object({ id: objectIdSchema })
const listItemsQuerySchema = z.object({ categoryId: objectIdSchema.optional() })

/* ── categories ───────────────────────────────────────────────────────────── */

menuRouter.get('/categories', requireRestaurantAdmin, async (_req, res: Response) => {
  const categories = await menuService.listCategories()
  res.status(200).json({ categories, count: categories.length })
})

menuRouter.post(
  '/categories',
  requireRestaurantAdmin,
  validate({ body: createCategorySchema }),
  async (req: Request, res: Response) => {
    res.status(201).json({ category: await menuService.createCategory(req.body) })
  },
)

menuRouter.patch(
  '/categories/:id',
  requireRestaurantAdmin,
  validate({ params: idParamsSchema, body: updateCategorySchema }),
  async (req: Request, res: Response) => {
    res
      .status(200)
      .json({ category: await menuService.updateCategory(String(req.params.id), req.body) })
  },
)

menuRouter.delete(
  '/categories/:id',
  requireRestaurantAdmin,
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    await menuService.deleteCategory(String(req.params.id))
    res.status(204).end()
  },
)

/* ── items ────────────────────────────────────────────────────────────────── */

menuRouter.get(
  '/items',
  // Kitchen and waiting staff legitimately need to see the menu; only owners
  // and managers may change it.
  requireRole(Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN, Role.WAITER),
  validate({ query: listItemsQuerySchema }),
  async (req: Request & { validatedQuery?: { categoryId?: string } }, res: Response) => {
    const items = await menuService.listItems(req.validatedQuery ?? {})
    res.status(200).json({ items, count: items.length })
  },
)

const searchSchema = z.object({ q: z.string().min(1) })

menuRouter.get(
  '/items/search',
  requireRole(Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN, Role.WAITER),
  validate({ query: searchSchema }),
  async (req: Request & { validatedQuery?: { q: string } }, res: Response) => {
    if (!req.validatedQuery?.q) {
      res.status(200).json({ items: [], count: 0 })
      return
    }
    const items = await menuService.searchItems(req.validatedQuery.q)
    res.status(200).json({ items, count: items.length })
  },
)

menuRouter.post(
  '/items',
  requireRestaurantAdmin,
  validate({ body: createMenuItemSchema }),
  async (req: Request, res: Response) => {
    res.status(201).json({ item: await menuService.createItem(req.body) })
  },
)

menuRouter.patch(
  '/items/:id',
  requireRestaurantAdmin,
  validate({ params: idParamsSchema, body: updateMenuItemSchema }),
  async (req: Request, res: Response) => {
    res.status(200).json({ item: await menuService.updateItem(String(req.params.id), req.body) })
  },
)

menuRouter.patch(
  '/items/:id/availability',
  requireRole(Role.OWNER, Role.MANAGER, Role.CASHIER),
  validate({ params: idParamsSchema, body: setAvailabilitySchema }),
  async (req: Request, res: Response) => {
    const { isAvailable } = req.body as { isAvailable: boolean }
    res
      .status(200)
      .json({ item: await menuService.setItemAvailability(String(req.params.id), isAvailable) })
  },
)

menuRouter.delete(
  '/items/:id',
  requireRestaurantAdmin,
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    await menuService.deleteItem(String(req.params.id))
    res.status(204).end()
  },
)

/* ── image uploads ────────────────────────────────────────────────────────── */

const uploadCredentialsSchema = z.object({
  kind: z.enum(['menu-item', 'menu-category', 'restaurant-logo']).default('menu-item'),
})

/**
 * Signs a direct browser upload.
 *
 * The file never passes through this server: we return short-lived credentials
 * scoped to this tenant's folder, and the browser POSTs straight to the
 * provider. The tenant comes from the token, so a client cannot aim the upload
 * at another restaurant's folder.
 */
menuRouter.post(
  '/images/upload-credentials',
  requireRestaurantAdmin,
  validate({ body: uploadCredentialsSchema }),
  async (req: Request, res: Response) => {
    const { kind } = req.body as { kind: 'menu-item' | 'menu-category' | 'restaurant-logo' }
    const restaurantId = tenantRepo(MenuItemModel).restaurantId

    const credentials = await imageProvider().createUploadCredentials({ restaurantId, kind })

    await writeAudit({
      action: AuditAction.IMAGE_UPLOAD_REQUESTED,
      targetType: 'Image',
      metadata: { kind, provider: imageProvider().name },
    })

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(credentials)
  },
)
