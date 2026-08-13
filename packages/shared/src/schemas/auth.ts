import { z } from 'zod'
import { ROLES } from '../enums.js'
import { emailSchema, passwordSchema } from './common.js'

export const loginSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: a login must accept whatever was typed so an existing
  // password that predates a rule change still authenticates. Only the length
  // ceiling is kept, as a denial-of-service guard.
  password: z.string().min(1).max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const createStaffSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES as [string, ...string[]]),
  phone: z
    .string()
    .trim()
    .regex(/^\+9665\d{8}$/, 'must be a Saudi mobile number in +9665XXXXXXXX form')
    .optional(),
})
export type CreateStaffInput = z.infer<typeof createStaffSchema>
