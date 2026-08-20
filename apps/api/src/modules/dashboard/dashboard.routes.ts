import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requirePlatformAdmin, requireRestaurantAdmin } from '../../middleware/rbac.js'
import { ZipArchive } from 'archiver'
import * as dashboardService from './dashboard.service.js'

export const appDashboardRouter: Router = Router()
export const platformDashboardRouter: Router = Router()

// App dashboard (Restaurant Owner / Manager)
appDashboardRouter.use(requireAuth, requireRestaurantAdmin)
appDashboardRouter.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const period = req.query.period as string | undefined;
    const stats = await dashboardService.getRestaurantStats(period)
    res.status(200).json(stats)
  } catch (error) {
    console.error("Dashboard error:", error);
    next(error)
  }
})

appDashboardRouter.get('/backup', async (_req: Request, res: Response, next) => {
  try {

    const data = await dashboardService.getRestaurantBackupData()
    
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="restaurant_backup.zip"')
    
    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.pipe(res)
    
    archive.append(JSON.stringify(data.orders, null, 2), { name: 'orders.json' })
    archive.append(JSON.stringify(data.categories, null, 2), { name: 'categories.json' })
    archive.append(JSON.stringify(data.menuItems, null, 2), { name: 'menuItems.json' })
    archive.append(JSON.stringify(data.staff, null, 2), { name: 'staff.json' })
    
    await archive.finalize()
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
