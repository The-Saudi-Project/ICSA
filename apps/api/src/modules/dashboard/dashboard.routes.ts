import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requirePlatformAdmin, requireRestaurantAdmin } from '../../middleware/rbac.js'
import * as dashboardService from './dashboard.service.js'

export const appDashboardRouter: Router = Router()
export const platformDashboardRouter: Router = Router()

// App dashboard (Restaurant Owner / Manager)
appDashboardRouter.use(requireAuth, requireRestaurantAdmin)
appDashboardRouter.get('/stats', async (_req: Request, res: Response, next) => {
  try {
    const stats = await dashboardService.getRestaurantStats()
    res.status(200).json(stats)
  } catch (error) {
    next(error)
  }
})

// Platform dashboard (Super Admin)
platformDashboardRouter.use(requireAuth, requirePlatformAdmin)
platformDashboardRouter.get('/stats', async (_req: Request, res: Response, next) => {
  try {
    const stats = await dashboardService.getPlatformStats()
    res.status(200).json(stats)
  } catch (error) {
    next(error)
  }
})
