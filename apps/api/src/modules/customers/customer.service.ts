import { CustomerModel, OtpCodeModel } from './customer.model.js'
import { randomInt } from 'node:crypto'
import { badRequest } from '../../core/errors.js'

export async function generateOtp(phone: string): Promise<string> {
  const code = randomInt(100000, 999999).toString()
  
  await OtpCodeModel.create({
    phone,
    code,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  })

  // In a real app, send SMS here. For now, it just goes into the DB for the mock dashboard.
  return code
}

export async function verifyOtp(phone: string, code: string): Promise<{ token: string }> {
  const otp = await OtpCodeModel.findOne({
    phone,
    code,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  })

  if (!otp) {
    throw badRequest('Invalid or expired OTP')
  }

  // Mark as used
  otp.usedAt = new Date()
  await otp.save()

  // Find or create customer — Mongoose 8 types findOneAndUpdate as T|null even
  // with upsert:true, so we use a two-step pattern that is guaranteed to return
  // a document and avoids the duplicate-key race condition.
  let customer = await CustomerModel.findOne({ phone })
  if (!customer) {
    try {
      customer = await CustomerModel.create({ phone })
    } catch (err: unknown) {
      // Another request beat us to the insert (duplicate key). Fetch the winner.
      if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
        customer = await CustomerModel.findOne({ phone })
      } else {
        throw err
      }
    }
  }

  if (!customer) {
    throw new Error('Failed to create or find customer record')
  }

  return { token: customer._id.toString() }

}

export async function getMockOtps() {
  return OtpCodeModel.find({}, { _id: 1, phone: 1, code: 1, createdAt: 1, usedAt: 1 }).sort({ createdAt: -1 }).limit(50)
}

export async function deleteOtp(id: string): Promise<void> {
  await OtpCodeModel.findByIdAndDelete(id)
}

export async function deleteAllOtps(): Promise<void> {
  await OtpCodeModel.deleteMany({})
}
