/**
 * Platform admin routes.
 *
 * Every route here is gated twice: `requireAuth` establishes identity, and
 * `requirePlatformAdmin` restricts it to us. A restaurant owner reaching any of
 * these receives 403.
 */

import {
  createRestaurantSchema,
  objectIdSchema,
  RestaurantStatus,
  updateRestaurantStatusSchema,
  TENANT_ROLES,
  UserStatus,
} from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requirePlatformAdmin } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import * as platformService from './platform.service.js'

export const platformRouter: Router = Router()

platformRouter.use(requireAuth, requirePlatformAdmin)

const listQuerySchema = z.object({
  status: z.enum([RestaurantStatus.ACTIVE, RestaurantStatus.SUSPENDED]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
})

const idParamsSchema = z.object({ id: objectIdSchema })

const staffIdParamsSchema = z.object({
  id: objectIdSchema,
  staffId: objectIdSchema,
})

const auditQuerySchema = z.object({
  restaurantId: objectIdSchema.optional(),
  action: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  skip: z.coerce.number().int().min(0).default(0),
})

const updateRestaurantSchema = z.object({
  name: z.object({ en: z.string().trim().min(1), ar: z.string().trim().optional() }).optional(),
  slug: z.string().trim().min(1).optional(),
  city: z.string().trim().optional(),
  vatNumber: z.string().trim().optional(),
  crNumber: z.string().trim().optional(),
})

/**
 * `TENANT_ROLES`, never `Role`. PLATFORM_ADMIN must not be reachable here.
 *
 * A platform admin has no `restaurantId` — that is the invariant the whole
 * tenancy model rests on, and the User model enforces it in a `pre('validate')`
 * hook. But a document hook does not run on `findOneAndUpdate`, so the update
 * route below would have written `role: PLATFORM_ADMIN` onto a user that still
 * belongs to a restaurant, producing exactly the malformed account the hook
 * exists to prevent. Rejecting the role at the edge is the fix; the hook stays
 * as the second layer.
 */
const tenantRoleSchema = z.enum(TENANT_ROLES)

const createStaffSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().trim().toLowerCase(),
  role: tenantRoleSchema,
})

const updateStaffSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: tenantRoleSchema.optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.DISABLED]).optional(),
})

type Validated<T> = Request & { validatedQuery?: T }

platformRouter.post(
  '/restaurants',
  validate({ body: createRestaurantSchema }),
  async (req: Request, res: Response) => {
    const result = await platformService.createRestaurantWithOwner(req.body)

    res.status(201).json({
      restaurant: {
        id: result.restaurant._id.toString(),
        publicId: result.restaurant.publicId,
        name: result.restaurant.name,
        slug: result.restaurant.slug,
        status: result.restaurant.status,
      },
      owner: {
        id: result.owner._id.toString(),
        email: result.owner.email,
        name: result.owner.name,
        role: result.owner.role,
      },
      // Returned once, at creation, and never retrievable afterwards. The
      // owner is forced to replace it on first login.
      temporaryPassword: result.temporaryPassword,
      note: 'Give this password to the owner through a secure channel. It cannot be shown again, and they must change it on first login.',
    })
  },
)

platformRouter.get(
  '/restaurants',
  validate({ query: listQuerySchema }),
  async (req: Validated<z.infer<typeof listQuerySchema>>, res: Response) => {
    const query = req.validatedQuery!
    const restaurants = await platformService.listRestaurants(query)
    res.status(200).json({ restaurants, count: restaurants.length })
  },
)

platformRouter.get(
  '/restaurants/:id',
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    const restaurant = await platformService.getRestaurant(String(req.params.id))
    res.status(200).json({
      restaurant: {
        id: restaurant._id.toString(),
        publicId: restaurant.publicId,
        name: restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
        city: restaurant.city,
        vatNumber: restaurant.vatNumber,
        crNumber: restaurant.crNumber,
        settings: restaurant.settings,
        subscription: restaurant.subscription,
        features: restaurant.features,
        createdAt: restaurant.createdAt,
      },
    })
  },
)

platformRouter.patch(
  '/restaurants/:id',
  validate({ params: idParamsSchema, body: updateRestaurantSchema }),
  async (req: Request, res: Response) => {
    const restaurant = await platformService.updateRestaurant(String(req.params.id), req.body)
    res.status(200).json({
      restaurant: {
        id: restaurant._id.toString(),
        publicId: restaurant.publicId,
        name: restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
        city: restaurant.city,
        vatNumber: restaurant.vatNumber,
        crNumber: restaurant.crNumber,
        settings: restaurant.settings,
        subscription: restaurant.subscription,
        features: restaurant.features,
        createdAt: restaurant.createdAt,
      },
    })
  },
)

platformRouter.patch(
  '/restaurants/:id/status',
  validate({ params: idParamsSchema, body: updateRestaurantStatusSchema }),
  async (req: Request, res: Response) => {
    const { status, reason } = req.body as { status: string; reason?: string }
    const restaurant = await platformService.setRestaurantStatus(String(req.params.id), status, reason)

    res.status(200).json({
      restaurant: {
        id: restaurant._id.toString(),
        slug: restaurant.slug,
        status: restaurant.status,
      },
    })
  },
)

platformRouter.post(
  '/restaurants/:id/reset-password',
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    const result = await platformService.resetOwnerPassword(String(req.params.id))
    res.status(200).json(result)
  },
)

platformRouter.get(
  '/restaurants/:id/staff',
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    const staff = await platformService.listRestaurantStaff(String(req.params.id))
    res.status(200).json({
      staff: staff.map(u => ({
        id: u._id.toString(),
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        mustChangePassword: u.mustChangePassword,
      }))
    })
  },
)

platformRouter.post(
  '/restaurants/:id/staff',
  validate({ params: idParamsSchema, body: createStaffSchema }),
  async (req: Request, res: Response) => {
    const result = await platformService.addRestaurantStaff(String(req.params.id), req.body)
    res.status(201).json({
      user: {
        id: result.user._id.toString(),
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      temporaryPassword: result.temporaryPassword,
    })
  },
)

platformRouter.patch(
  '/restaurants/:id/staff/:staffId',
  validate({ params: staffIdParamsSchema, body: updateStaffSchema }),
  async (req: Request, res: Response) => {
    const user = await platformService.updateRestaurantStaff(String(req.params.id), String(req.params.staffId), req.body)
    res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    })
  },
)

/**
 * Removing someone from a team is a disable, not a row deletion — see
 * `platform.service.ts:deactivateRestaurantStaff`. It therefore returns the
 * updated user rather than 204, so the caller can render the DISABLED state
 * instead of assuming the record is gone. Re-enable through the PATCH above
 * with `{ status: 'ACTIVE' }`.
 */
platformRouter.delete(
  '/restaurants/:id/staff/:staffId',
  validate({ params: staffIdParamsSchema }),
  async (req: Request, res: Response) => {
    const user = await platformService.deactivateRestaurantStaff(
      String(req.params.id),
      String(req.params.staffId),
    )
    res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    })
  },
)

platformRouter.get(
  '/audit',
  validate({ query: auditQuerySchema }),
  async (req: Validated<z.infer<typeof auditQuerySchema>>, res: Response) => {
    const events = await platformService.listPlatformAudit(req.validatedQuery!)
    res.status(200).json({ events, count: events.length })
  },
)

platformRouter.get(
  '/analytics',
  async (_req: Request, res: Response) => {
    const analytics = await platformService.getPlatformAnalytics()
    res.status(200).json(analytics)
  }
)

const subscriptionSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  status: z.enum(['ACTIVE', 'PAST_DUE', 'CANCELED']),
})

platformRouter.patch(
  '/restaurants/:id/subscription',
  validate({ params: idParamsSchema, body: subscriptionSchema }),
  async (req: Request, res: Response) => {
    const restaurant = await platformService.updateSubscription(String(req.params.id), req.body)
    res.status(200).json({
      subscription: restaurant.subscription
    })
  }
)

const featuresSchema = z.object({
  features: z.array(z.string()),
})

platformRouter.patch(
  '/restaurants/:id/features',
  validate({ params: idParamsSchema, body: featuresSchema }),
  async (req: Request, res: Response) => {
    const restaurant = await platformService.updateFeatures(String(req.params.id), req.body.features)
    res.status(200).json({
      features: restaurant.features
    })
  }
)
