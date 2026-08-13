import { z } from 'zod'

/**
 * A MongoDB ObjectId as it appears in a URL or request body.
 *
 * Declaring it as a 24-hex string rather than `z.string()` matters for
 * security: it means an object such as `{ "$ne": null }` is rejected at the
 * edge and can never reach a query.
 */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id')

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('must be a valid email address')

/**
 * Staff password rules.
 *
 * Length is the dominant factor in password strength, so the minimum is 12
 * rather than the more common 8. Composition rules (one symbol, one digit) are
 * deliberately omitted — they push people towards predictable substitutions
 * like "Password1!" without adding real entropy.
 *
 * The upper bound exists because Argon2 hashes the whole input; without it, a
 * multi-megabyte password becomes a denial-of-service vector.
 */
export const passwordSchema = z
  .string()
  .min(12, 'must be at least 12 characters')
  .max(200, 'must be at most 200 characters')

/** Bilingual text. Arabic is optional in Phase 1; the UI falls back to English. */
export const localizedTextSchema = z.object({
  en: z.string().trim().min(1).max(200),
  ar: z.string().trim().max(200).optional(),
})
export type LocalizedText = z.infer<typeof localizedTextSchema>

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
})
