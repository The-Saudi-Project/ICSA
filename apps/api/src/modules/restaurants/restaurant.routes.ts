import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireStaff } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { requireTenantId } from '../../core/tenant.js'
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

restaurantRouter.patch(
  '/settings',
  validate({
    body: z.object({
      vatRatePercent: z.number().min(0).max(100).optional(),
      serviceChargePercent: z.number().min(0).max(100).optional(),
      pricesIncludeVat: z.boolean().optional(),
      kitchenStartsBeforePayment: z.boolean().optional(),
    }),
  }),
  async (_req: Request, res: Response) => {
    const restaurantId = requireTenantId()
    
    const updatePayload: Record<string, unknown> = {}
    if (_req.body.vatRatePercent !== undefined) updatePayload['settings.vatRatePercent'] = _req.body.vatRatePercent
    if (_req.body.serviceChargePercent !== undefined) updatePayload['settings.serviceChargePercent'] = _req.body.serviceChargePercent
    if (_req.body.pricesIncludeVat !== undefined) updatePayload['settings.pricesIncludeVat'] = _req.body.pricesIncludeVat
    if (_req.body.kitchenStartsBeforePayment !== undefined) updatePayload['settings.kitchenStartsBeforePayment'] = _req.body.kitchenStartsBeforePayment

    const restaurant = await RestaurantModel.findByIdAndUpdate(
      restaurantId,
      { $set: updatePayload },
      { new: true }
    ).select('settings')

    res.status(200).json({ settings: restaurant?.settings })
  }
)

restaurantRouter.get('/settings', async (_req: Request, res: Response) => {
  const restaurantId = requireTenantId()
  const restaurant = await RestaurantModel.findById(restaurantId).select('settings')
  res.status(200).json({ settings: restaurant?.settings })
})
