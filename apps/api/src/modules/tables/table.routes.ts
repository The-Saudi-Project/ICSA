/**
 * Table management — restaurant side.
 *
 * Owner and manager only, with one exception: `GET /selectable`, the list a
 * waiter needs to name the table they are ordering for.
 *
 * The distinction is the table URL. The URL *is* the credential — anything
 * holding it can open a customer session on that table — so the views that
 * carry it stay with the two roles that manage tables, and the picker below
 * never decrypts a token at all.
 */

import { createTableSchema, objectIdSchema, Role, updateTableSchema } from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireRestaurantAdmin, requireRole } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import * as tableService from './table.service.js'

/**
 * The one table route that is not owner/manager-only.
 *
 * It lives on its own router, mounted at the same path *before* `tableRouter`,
 * so the blanket `requireRestaurantAdmin` below stays exactly as it is. Adding
 * an exception inside that router would mean replacing one guard that covers
 * everything with eight that each have to be remembered.
 *
 * The roles are the roles that may create an order (see `staff-create` in the
 * orders module). They must stay in step: a screen that can place an order for a
 * table has to be able to name the table, and nothing else needs this list.
 */
export const tablePickerRouter: Router = Router()

tablePickerRouter.get(
  '/selectable',
  requireAuth,
  requireRole(Role.OWNER, Role.MANAGER, Role.WAITER),
  async (_req: Request, res: Response) => {
    const tables = await tableService.listSelectableTables()
    res.status(200).json({ tables, count: tables.length })
  },
)

export const tableRouter: Router = Router()

tableRouter.use(requireAuth, requireRestaurantAdmin)

const idParamsSchema = z.object({ id: objectIdSchema })
const qrQuerySchema = z.object({ format: z.enum(['png', 'svg']).default('png') })

tableRouter.get('/', async (_req: Request, res: Response) => {
  const tables = await tableService.listTables()
  res.status(200).json({ tables, count: tables.length })
})

tableRouter.post(
  '/',
  validate({ body: createTableSchema }),
  async (req: Request, res: Response) => {
    const table = await tableService.createTable(req.body)
    res.status(201).json({ table })
  },
)

tableRouter.patch(
  '/:id',
  validate({ params: idParamsSchema, body: updateTableSchema }),
  async (req: Request, res: Response) => {
    const table = await tableService.updateTable(String(req.params.id), req.body)
    res.status(200).json({ table })
  },
)

tableRouter.post(
  '/:id/rotate-token',
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    const table = await tableService.rotateTableToken(String(req.params.id))
    res.status(200).json({
      table,
      warning:
        'The old URL stopped working immediately. Rewrite this table’s NFC tag and reprint its QR code.',
    })
  },
)

tableRouter.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  async (req: Request, res: Response) => {
    await tableService.deleteTable(String(req.params.id))
    res.status(204).end()
  },
)

tableRouter.get(
  '/export',
  async (_req: Request, res: Response) => {
    const csv = await tableService.exportTableUrls()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="tables.csv"')
    res.status(200).send(csv)
  },
)

tableRouter.get(
  '/:id/qr',
  validate({ params: idParamsSchema, query: qrQuerySchema }),
  async (req: Request & { validatedQuery?: { format: 'png' | 'svg' } }, res: Response) => {
    const format = req.validatedQuery?.format ?? 'png'
    const { body, contentType } = await tableService.tableQrCode(String(req.params.id), format)

    res.setHeader('Content-Type', contentType)
    // The QR encodes a credential. It must never sit in a shared cache.
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).send(body)
  },
)
