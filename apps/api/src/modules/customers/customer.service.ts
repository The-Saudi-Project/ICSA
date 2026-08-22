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
  const otp = await OtpCodeModel.findOneAndUpdate({
    phone,
    code,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  }, {
    $set: { usedAt: new Date() }
  })

  if (!otp) {
    throw badRequest('Invalid or expired OTP')
  }

  const customerDoc = await CustomerModel.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone } },
    { upsert: true, new: true }
  )
  
  const customer = customerDoc || await CustomerModel.findOne({ phone })

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
