/**
 * The whole API on an in-memory MongoDB, with demo data, in one command.
 *
 *   npm run dev:standalone --workspace @rw/api
 *
 * Why this exists: frontend work should never be blocked on a database account,
 * an Atlas IP allowlist, or a network. This boots a real MongoDB in-process,
 * seeds a restaurant with a menu and tables, prints the table URLs, and starts
 * the API against it. Nothing touches a real database, and nothing survives the
 * process exiting.
 *
 * Lives outside `src/` on purpose: `mongodb-memory-server` is a dev dependency
 * and must never end up in a production build.
 */

import { MongoMemoryServer } from 'mongodb-memory-server'

const server = await MongoMemoryServer.create()

// Set before anything imports config/env.ts. dotenv does not override values
// that already exist in process.env, so this wins over apps/api/.env.
process.env.MONGODB_URI = server.getUri('restaurant_dev')
process.env.NODE_ENV = 'development'
// 5174, matching `server.port` in apps/web/vite.config.ts — not Vite's default
// of 5173. A mismatch here silently produces table URLs and QR codes pointing at
// a port nothing serves.
process.env.PUBLIC_APP_URL ??= 'http://localhost:5174'
process.env.CORS_ORIGIN ??= 'http://localhost:5174'

const { logger } = await import('../src/core/logger.js')
logger.info('in-memory MongoDB started; no external database is being used')

await import('../src/db/mongoose.js').then((m) => m.connectDb())

const { seedDemoData } = await import('../src/scripts/seedDemo.js')
await seedDemoData()

await import('../src/index.js')
