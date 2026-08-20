import { z } from 'zod'

export const tableLabelSchema = z.string().trim().min(1).max(40)

export const createTableSchema = z.object({
  label: tableLabelSchema,
  zone: z.string().trim().max(40).optional(),
  seats: z.coerce.number().int().min(1).max(50).optional(),
})
export type CreateTableInput = z.infer<typeof createTableSchema>

export const updateTableSchema = z
  .object({
    label: tableLabelSchema.optional(),
    zone: z.string().trim().max(40).optional(),
    seats: z.coerce.number().int().min(1).max(50).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    assignedWaiterId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'no fields to update')
export type UpdateTableInput = z.infer<typeof updateTableSchema>

/**
 * The table token as it arrives from an NFC tag or QR scan.
 *
 * Declared as a bounded base64url string, so an object shaped like a MongoDB
 * operator is rejected at the edge. The length bound also stops a megabyte of
 * junk reaching the hash function.
 */
export const tableTokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/, 'invalid token')

export const exchangeTableTokenSchema = z.object({
  tableToken: tableTokenSchema,
})
export type ExchangeTableTokenInput = z.infer<typeof exchangeTableTokenSchema>
