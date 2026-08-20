import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireRestaurantAdmin, requireStaff } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { requireTenantId } from '../../core/tenant.js'
import { writeAudit } from '../../core/audit.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { RestaurantModel } from './restaurant.model.js'
import { getIO } from '../../core/socket.js'

export const restaurantRouter: Router = Router()

restaurantRouter.use(requireAuth, requireStaff)

restaurantRouter.patch(
  '/wait-time',
  validate({
    body: z.object({
      estimatedWaitMinutes: z.number().int().min(0).max(120),
    }),
  }),
  async (req: Request, res: Response) => {
    const restaurantId = requireTenantId()
    const { estimatedWaitMinutes } = req.body

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $set: { 'settings.estimatedWaitMinutes': estimatedWaitMinutes } },
      { new: true }
    )

    if (restaurant) {
      getIO().to(`restaurant_${restaurantId}`).emit('wait_time_updated', { estimatedWaitMinutes })
    }

    res.status(200).json({ estimatedWaitMinutes })
  }
)

/**
 * Owner/manager only. These are money-relevant (VAT rate, service charge, VAT-
 * inclusive pricing) and payment-posture-relevant (kitchen-before-payment) —
 * a cashier, waiter or kitchen screen must not be able to change them. The
 * change is audited with before/after values, like MENU_PRICE_CHANGED.
 */
const SETTINGS_KEYS = [
  'vatRatePercent',
  'serviceChargePercent',
  'pricesIncludeVat',
  'kitchenStartsBeforePayment',
] as const

restaurantRouter.patch(
  '/settings',
  requireRestaurantAdmin,
  validate({
    body: z.object({
      vatRatePercent: z.number().min(0).max(100).optional(),
      serviceChargePercent: z.number().min(0).max(100).optional(),
      pricesIncludeVat: z.boolean().optional(),
      kitchenStartsBeforePayment: z.boolean().optional(),
      vatNumber: z.string().trim().optional(),
    }),
  }),
  async (req: Request, res: Response) => {
    const restaurantId = requireTenantId()

    const existing = await RestaurantModel.findById(restaurantId).select('settings')
    const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>

    const body = req.body as Record<string, unknown>
    const updatePayload: Record<string, unknown> = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const key of SETTINGS_KEYS) {
      if (body[key] !== undefined) {
        updatePayload[`settings.${key}`] = body[key]
        before[key] = existingSettings[key]
        after[key] = body[key]
      }
    }
    if (body.vatNumber !== undefined) {
      updatePayload['vatNumber'] = body.vatNumber
      before['vatNumber'] = existing?.vatNumber
      after['vatNumber'] = body.vatNumber
    }

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $set: updatePayload },
      { new: true }
    ).select('settings')

    if (Object.keys(after).length > 0) {
      await writeAudit({
        action: AuditAction.RESTAURANT_SETTINGS_CHANGED,
        targetType: 'Restaurant',
        targetId: restaurantId,
        metadata: { before, after },
      })
    }

    res.status(200).json({ settings: { ...restaurant?.settings, vatNumber: restaurant?.vatNumber } })
  }
)

restaurantRouter.get('/settings', async (_req: Request, res: Response) => {
  const restaurantId = requireTenantId()
  const restaurant = await RestaurantModel.findById(restaurantId).select('settings vatNumber')
  res.status(200).json({ settings: { ...restaurant?.settings, vatNumber: restaurant?.vatNumber } })
})
