/**
 * Creates the first PLATFORM_ADMIN.
 *
 * There is no other bootstrap path: the platform routes require a platform
 * admin, and a platform admin can only be created by one. This script breaks
 * that circle exactly once.
 *
 *   npm run seed:admin --workspace @rw/api
 *
 * Reads PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD from the environment.
 * The password is never passed on the command line, because command lines end
 * up in shell history and in process listings.
 *
 * Refuses to run if a platform admin already exists — this is a bootstrap tool,
 * not an account-management tool.
 */

import { Role } from '@rw/shared'
import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { hashPassword } from '../core/crypto.js'
import { logger } from '../core/logger.js'
import { connectDb, disconnectDb } from '../db/mongoose.js'
import { UserModel } from '../modules/users/user.model.js'

const MIN_PASSWORD_LENGTH = 12

async function main(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.PLATFORM_ADMIN_PASSWORD
  const name = process.env.PLATFORM_ADMIN_NAME?.trim() || 'Platform Admin'

  if (!email || !password) {
    throw new Error(
      'Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD in apps/api/.env, then run again.',
    )
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`PLATFORM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set.')
  }

  await connectDb()

  const existing = await UserModel.findOne({ role: Role.PLATFORM_ADMIN })
  if (existing) {
    logger.warn(
      { email: existing.email },
      'a platform admin already exists — nothing to do. Manage further admins through the app.',
    )
    return
  }

  const clash = await UserModel.findOne({ email })
  if (clash) throw new Error('That email is already in use by another account.')

  const admin = await UserModel.create({
    email,
    passwordHash: await hashPassword(password),
    name,
    role: Role.PLATFORM_ADMIN,
    restaurantId: null,
  })

  logger.info({ id: admin._id.toString(), email: admin.email }, 'platform admin created')
  // ASCII only: the Windows console renders UTF-8 punctuation as mojibake.
  logger.info('Now remove PLATFORM_ADMIN_PASSWORD from your .env - it is no longer needed.')
}

main()
  .then(async () => {
    await disconnectDb()
    process.exit(0)
  })
  .catch(async (err: unknown) => {
    logger.error({ err }, 'seed failed')
    if (mongoose.connection.readyState !== 0) await disconnectDb()
    process.exit(1)
  })
