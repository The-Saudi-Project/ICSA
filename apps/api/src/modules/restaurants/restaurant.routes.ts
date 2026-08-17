/**
 * A restaurant's own record — `/api/v1/app/restaurant`.
 *
 * Note the path: singular, and with no `:id`. There is nothing to put an id
 * into, because the tenant comes from the verified token. A route shaped
 * `/app/restaurants/:id` would invite exactly the mistake this product spends
 * four layers preventing.
 *
 * Owner and manager only — the same bar as changing a menu price, which is the
 * closest existing analogue for "can move money".
 */

import { updateRestaurantSettingsSchema } from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRestaurantAdmin } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import * as restaurantService from './restaurant.service.js'

export const restaurantRouter: Router = Router()

restaurantRouter.use(requireAuth, requireRestaurantAdmin)

restaurantRouter.get('/', async (_req: Request, res: Response) => {
  res.status(200).json({ restaurant: await restaurantService.getOwnRestaurant() })
})

restaurantRouter.patch(
  '/',
  validate({ body: updateRestaurantSettingsSchema }),
  async (req: Request, res: Response) => {
    const restaurant = await restaurantService.updateOwnRestaurant(req.body)
    res.status(200).json({ restaurant })
  },
)
