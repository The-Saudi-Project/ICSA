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

  // Find or create customer atomically to prevent duplicate key race conditions
  const customer = await CustomerModel.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone } },
    { upsert: true, new: true }
  )  
  return { token: customer._id.toString() }
}

export async function getMockOtps() {
  return OtpCodeModel.find({}, { _id: 0, phone: 1, code: 1, createdAt: 1, usedAt: 1 }).sort({ createdAt: -1 }).limit(50)
}
