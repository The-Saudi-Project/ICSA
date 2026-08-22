import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { CustomerModel } from './customer.model.js'
import { OrderModel } from '../orders/order.model.js'
import { unauthenticated } from '../../core/errors.js'
import { validate } from '../../middleware/validate.js'
import * as customerService from './customer.service.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/rbac.js'
import { Role } from '@rw/shared'

export const customerRouter: Router = Router()

const requestOtpSchema = z.object({
  phone: z.string().min(5).max(20).trim()
})

const verifyOtpSchema = z.object({
  phone: z.string().min(5).max(20).trim(),
  code: z.string().length(6)
})

customerRouter.post(
  '/request-otp',
  validate({ body: requestOtpSchema }),
  async (req: Request, res: Response) => {
    const { phone } = req.body
    await customerService.generateOtp(phone)
    res.status(200).json({ success: true })
  }
)

customerRouter.post(
  '/verify-otp',
  validate({ body: verifyOtpSchema }),
  async (req: Request, res: Response) => {
    const { phone, code } = req.body
    const result = await customerService.verifyOtp(phone, code)
    
    // In this MVP, we just return the customer token/ID and the frontend stores it
    // and sends it as `X-Customer-Token` header or something.
    res.status(200).json(result)
  }
)

customerRouter.get(
  '/mock-otps',
  requireAuth,
  requireRole(Role.OWNER, Role.PLATFORM_ADMIN),
  async (_req: Request, res: Response) => {
    const otps = await customerService.getMockOtps()
    res.status(200).json({ otps })
  }
)

customerRouter.delete(
  '/mock-otps',
  requireAuth,
  requireRole(Role.OWNER, Role.PLATFORM_ADMIN),
  async (_req: Request, res: Response) => {
    await customerService.deleteAllOtps()
    res.status(204).end()
  }
)

customerRouter.delete(
  '/mock-otps/:id',
  requireAuth,
  requireRole(Role.OWNER, Role.PLATFORM_ADMIN),
  async (req: Request, res: Response) => {
    await customerService.deleteOtp(req.params['id'] as string)
    res.status(204).end()
  }
)

customerRouter.get(
  '/orders',
  async (req: Request, res: Response) => {
    const customerToken = req.header('x-customer-token')
    if (!customerToken) throw unauthenticated('Customer token required')

    const customer = await CustomerModel.findById(customerToken)
    if (!customer) throw unauthenticated('Invalid customer token')

    // Find all orders placed with this phone number across all restaurants
    const orders = await OrderModel.find({ customerPhone: customer.phone })
      .sort({ createdAt: -1 })
      .populate('restaurantId', 'name')
      
    res.status(200).json({ orders })
  }
)
