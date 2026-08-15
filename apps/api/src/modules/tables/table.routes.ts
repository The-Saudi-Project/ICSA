/**
 * Table management — restaurant side.
 *
 * Owner and manager only. A cashier or kitchen user has no business seeing
 * table URLs: the URL *is* the credential, so exposing it to every member of
 * staff would widen the blast radius of a leaked screenshot for no benefit.
 */

import { createTableSchema, objectIdSchema, updateTableSchema } from '@rw/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireRestaurantAdmin } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import * as tableService from './table.service.js'

export const tableRouter: Router = Router()

tableRouter.use(requireAuth, requireRestaurantAdmin)

/**
 * Nothing from this router may be cached, anywhere, ever.
 *
 * **A table URL is the credential**, not a reference to one — anyone holding
 * `/t/<token>` can order at that table. `GET /` returns one for every table in
 * the restaurant and `GET /export` returns the same set as a file, and neither
 * said so: with no `Cache-Control` at all, a shared proxy or the browser's own
 * heuristic cache was free to keep a copy of every table credential in the
 * restaurant. Only the QR route had been given the header.
 *
 * Applied to the router rather than to each handler, so a route added later
 * cannot quietly omit it.
 */
tableRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  next()
})

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
