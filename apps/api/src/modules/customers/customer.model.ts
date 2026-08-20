import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const customerSchema = new Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    // The user's name is optional and can be filled later
    name: { type: String, trim: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

export type Customer = InferSchemaType<typeof customerSchema>
export type CustomerDoc = HydratedDocument<Customer>
export const CustomerModel = model('Customer', customerSchema)

const otpCodeSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: '5m' } }, // Auto-delete after 5 mins
    usedAt: { type: Date },
  },
  { timestamps: true }
)

export type OtpCode = InferSchemaType<typeof otpCodeSchema>
export type OtpCodeDoc = HydratedDocument<OtpCode>
export const OtpCodeModel = model('OtpCode', otpCodeSchema)
