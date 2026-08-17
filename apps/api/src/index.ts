/**
 * Server bootstrap.
 *
 * Connects the database first, then starts listening — so the process never
 * accepts traffic it cannot serve. Shuts down gracefully so in-flight requests
 * finish before the process exits during a deploy.
 */

import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './core/logger.js'
import { initSocket } from './core/socket.js'
import { connectDb, disconnectDb } from './db/mongoose.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main(): Promise<void> {
  await connectDb()

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening')
  })

  initSocket(server)

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down')

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    forceExit.unref()

    server.close(() => {
      void disconnectDb()
        .then(() => {
          logger.info('shutdown complete')
          process.exit(0)
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'error during shutdown')
          process.exit(1)
        })
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // A rejected promise nobody handled means unknown state. Log it loudly and
  // die rather than continue serving from a corrupted position.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection')
    process.exit(1)
  })
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception')
    process.exit(1)
  })
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start')
  process.exit(1)
})
