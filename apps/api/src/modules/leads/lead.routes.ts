/**
 * The homepage contact form, and the platform inbox that reads it.
 *
 * Two routers, because they have opposite threat models. `leadRouter` is open
 * to the entire internet and is treated accordingly: hard rate limit, strict
 * validation, a honeypot, and a reply that reveals nothing. `platformLeadRouter`
 * is ours, behind `requirePlatformAdmin`, because a list of restaurant owners'
 * names and phone numbers is personal data.
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requirePlatformAdmin } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { notFound } from '../../core/errors.js'
import { writeAudit } from '../../core/audit.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { LeadStatus } from './lead.model.js'
import * as leadService from './lead.service.js'

export const leadRouter: Router = Router()
export const platformLeadRouter: Router = Router()

const submitLeadSchema = z.object({
  restaurantName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(5).max(20),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  branches: z.coerce.number().int().min(1).max(500).optional(),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  locale: z.enum(['en', 'ar']).default('en'),
  /**
   * Honeypot. A human never sees this field, so anything in it came from a bot.
   * The request still answers 201: telling a script it was detected only teaches
   * whoever wrote it to try again differently.
   */
  website: z.string().max(200).optional(),
})

const blank = (value?: string) => (value && value.length > 0 ? value : undefined)

leadRouter.post(
  '/',
  validate({ body: submitLeadSchema }),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof submitLeadSchema>

    if (body.website) {
      res.status(201).json({ received: true })
      return
    }

    await leadService.submitLead(
      {
        restaurantName: body.restaurantName,
        contactName: body.contactName,
        phone: body.phone,
        ...(blank(body.email) ? { email: body.email } : {}),
        ...(blank(body.city) ? { city: body.city } : {}),
        ...(body.branches ? { branches: body.branches } : {}),
        ...(blank(body.message) ? { message: body.message } : {}),
        locale: body.locale,
      },
      { ip: req.ip, userAgent: req.header('user-agent') },
    )

    // Nothing about the stored record comes back — not an id, not a count.
    res.status(201).json({ received: true })
  },
)

/* ── the platform inbox ───────────────────────────────────────────────────── */

platformLeadRouter.use(requireAuth, requirePlatformAdmin)

const listQuerySchema = z.object({
  status: z.enum([LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.ARCHIVED]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
})
type ListQuery = z.infer<typeof listQuerySchema>

platformLeadRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: Request & { validatedQuery?: ListQuery }, res: Response) => {
    const query = req.validatedQuery!
    const result = await leadService.listLeads(query)

    // Personal data: never cached by a proxy or left in the browser's store.
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(result)
  },
)

const statusParamsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) })
const statusBodySchema = z.object({
  status: z.enum([LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.ARCHIVED]),
})

platformLeadRouter.patch(
  '/:id/status',
  validate({ params: statusParamsSchema, body: statusBodySchema }),
  async (req: Request, res: Response) => {
    const { status } = req.body as z.infer<typeof statusBodySchema>
    const lead = await leadService.setLeadStatus(String(req.params['id']), status)
    if (!lead) throw notFound('Lead not found')

    await writeAudit({
      action: AuditAction.LEAD_STATUS_CHANGED,
      targetType: 'Lead',
      targetId: lead.id,
      restaurantId: null,
      metadata: { to: status },
    })

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ lead })
  },
)
