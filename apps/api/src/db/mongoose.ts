/**
 * MongoDB connection.
 *
 * `sanitizeFilter` is on globally: Mongoose then wraps any object that looks
 * like a query operator coming from user input in `$eq`, which blunts NoSQL
 * injection. Zod validation is the first line of defence; this is the second.
 *
 * `strictQuery` prevents silently ignoring a filter field that is not in the
 * schema — a typo in a tenant filter must be an error, never a wider query.
 */

import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { logger } from '../core/logger.js'

mongoose.set('sanitizeFilter', true)
mongoose.set('strictQuery', true)

export type DbStatus = 'connected' | 'connecting' | 'disconnected' | 'not-configured'

export function dbStatus(): DbStatus {
  if (!env.MONGODB_URI) return 'not-configured'
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected'
    case 2:
      return 'connecting'
    default:
      return 'disconnected'
  }
}

export async function connectDb(uri = env.MONGODB_URI): Promise<boolean> {
  if (!uri) {
    if (env.isProduction) {
      // Unreachable: env validation already blocks this. Belt and braces.
      throw new Error('MONGODB_URI is required in production')
    }
    logger.warn(
      'MONGODB_URI is not set — starting without a database. ' +
        'Set it in apps/api/.env before Phase 1 Step 2.',
    )
    return false
  }

  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb connection error'))
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'))
  mongoose.connection.on('reconnected', () => logger.info('mongodb reconnected'))

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    // Modest pool: free hosting tiers have low connection limits.
    maxPoolSize: 10,
    minPoolSize: 1,
    autoIndex: !env.isProduction, // in production indexes are built deliberately, not on boot
  })

  logger.info({ db: mongoose.connection.name }, 'mongodb connected')
  return true
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}
