/**
 * A sales enquiry from the public homepage.
 *
 * **No `tenantGuardPlugin` here, on purpose.** A lead is a platform record, not
 * a tenant one — the person filling the form has no restaurant in our system
 * yet, which is the entire point of them writing to us. It joins `AuditLog` and
 * `Restaurant` in the short list of models the tenant guard does not apply to,
 * and like those it is reachable only from platform-admin code.
 *
 * It holds someone's name and phone number, so treat it as personal data: never
 * log the document, never expose it outside `requirePlatformAdmin`.
 */

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  ARCHIVED: 'ARCHIVED',
} as const
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus]

const leadSchema = new Schema(
  {
    restaurantName: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, trim: true, maxlength: 160 },
    city: { type: String, trim: true, maxlength: 80 },
    /** Roughly how big they are — the only qualifying question the form asks. */
    branches: { type: Number, min: 1, max: 500 },
    message: { type: String, trim: true, maxlength: 2000 },

    /** Which language they read the page in. Reply in the same one. */
    locale: { type: String, enum: ['en', 'ar'], default: 'en' },

    status: { type: String, enum: Object.values(LeadStatus), default: LeadStatus.NEW, index: true },
    /** Hashed, never raw — the same rule as the audit log. */
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 200 },
  },
  { timestamps: true },
)

leadSchema.index({ createdAt: -1 })

export type Lead = InferSchemaType<typeof leadSchema>
export type LeadDoc = HydratedDocument<Lead>

export const LeadModel = model('Lead', leadSchema)
