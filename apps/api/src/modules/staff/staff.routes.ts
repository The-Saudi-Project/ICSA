/**
 * Staff routes. Owner and manager only; the finer privilege rules live in the
 * service, because they depend on the target's role as well as the caller's.
 */

import { emailSchema, objectIdSchema, Role, UserStatus } from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireRestaurantAdmin } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import * as staffService from './staff.service.js'

export const staffRouter: Router = Router()

staffRouter.use(requireAuth, requireRestaurantAdmin)

const idParams = z.object({ id: objectIdSchema })

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+9665\d{8}$/, 'must be a Saudi mobile number in +9665XXXXXXXX form')

/** PLATFORM_ADMIN is deliberately not in this list. */
const assignableRole = z.enum([Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN, Role.WAITER])

const createSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(120),
  role: assignableRole,
  phone: phoneSchema.optional(),
})

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: assignableRole.optional(),
    status: z.enum([UserStatus.ACTIVE, UserStatus.DISABLED]).optional(),
    phone: phoneSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'no fields to update')

staffRouter.get('/', async (_req: Request, res: Response) => {
  const staff = await staffService.listStaff()
  res.status(200).json({ staff, count: staff.length })
})

staffRouter.post('/', validate({ body: createSchema }), async (req: Request, res: Response) => {
  const created = await staffService.createStaff(req.body)

  res.setHeader('Cache-Control', 'no-store')
  res.status(201).json({
    ...created,
    note: 'Give this password to them directly. It cannot be shown again, and they must change it on first sign in.',
  })
})

staffRouter.patch(
  '/:id',
  validate({ params: idParams, body: updateSchema }),
  async (req: Request, res: Response) => {
    res.status(200).json({ user: await staffService.updateStaff(String(req.params.id), req.body) })
  },
)

staffRouter.post(
  '/:id/reset-password',
  validate({ params: idParams }),
  async (req: Request, res: Response) => {
    const result = await staffService.resetStaffPassword(String(req.params.id))
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(result)
  },
)
