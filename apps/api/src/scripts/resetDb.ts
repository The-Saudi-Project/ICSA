/**
 * Database Reset Script.
 *
 * Drops the entire database and provisions ONLY the Platform Admin user.
 * This is used to clear out all seed data and start fresh testing from the admin panel.
 */

import mongoose from 'mongoose'
import { env as config } from '../config/env.js'
import { Role } from '@rw/shared'
import { hashPassword } from '../core/crypto.js'
import { UserModel } from '../modules/users/user.model.js'
import { logger } from '../core/logger.js'

async function run() {
  await mongoose.connect(config.MONGODB_URI!)
  logger.info({ env: config.NODE_ENV, db: mongoose.connection.name }, 'mongodb connected')

  // 1. Drop the entire database
  logger.info('Dropping the entire database...')
  await mongoose.connection.dropDatabase()
  logger.info('Database dropped.')

  // 2. Create the Platform Admin
  const adminEmail = config.PLATFORM_ADMIN_EMAIL ?? 'admin@demo.test'
  const adminPassword = config.PLATFORM_ADMIN_PASSWORD ?? 'demo-password-1234'
  
  logger.info(`Creating Platform Admin (${adminEmail})...`)
  const adminPasswordHash = await hashPassword(adminPassword)
  
  await UserModel.create({
    email: adminEmail,
    passwordHash: adminPasswordHash,
    name: 'Platform Superadmin',
    role: Role.PLATFORM_ADMIN,
    mustChangePassword: false, // For demo convenience
  })
  
  logger.info('Platform Admin created successfully.')
  logger.info('You can now log in at /staff/login with:')
  logger.info(`  Email: ${adminEmail}`)
  logger.info(`  Password: ${adminPassword}`)
  
  await mongoose.connection.close()
  logger.info('Done.')
}

run().catch((error) => {
  logger.error(error)
  process.exit(1)
})
