/**
 * Bring the database's indexes in line with the schemas.
 *
 *   npm run indexes:sync --workspace @rw/api
 *
 * Creates indexes the models declare and DROPS ones they do not. That second
 * half is why this is a deliberate command rather than something that happens
 * on boot: dropping an index someone added by hand during an incident would be
 * a bad surprise in the middle of one.
 *
 * Refuses to run in production. There, index changes belong in a reviewed
 * deployment step: build new indexes first (in the background, so writes keep
 * working), confirm the query plans, then drop the old ones separately.
 */

import mongoose from 'mongoose'

process.env.NODE_ENV ??= 'development'

const { env } = await import('../src/config/env.js')
if (env.isProduction) {
  throw new Error(
    'indexes:sync refuses to run in production. Create and drop indexes as a reviewed deployment step.',
  )
}
if (!env.MONGODB_URI) throw new Error('MONGODB_URI is not set.')

const { connectDb, disconnectDb } = await import('../src/db/mongoose.js')
await connectDb()

// Importing the models is what registers their index declarations.
await Promise.all([
  import('../src/modules/restaurants/restaurant.model.js'),
  import('../src/modules/users/user.model.js'),
  import('../src/modules/auth/refreshToken.model.js'),
  import('../src/modules/audit/auditLog.model.js'),
  import('../src/modules/tables/table.model.js'),
  import('../src/modules/tables/tableSession.model.js'),
  import('../src/modules/menu/menuCategory.model.js'),
  import('../src/modules/menu/menuItem.model.js'),
  import('../src/modules/orders/order.model.js'),
  import('../src/modules/orders/counter.model.js'),
  import('../src/modules/orders/idempotencyKey.model.js'),
])

let created = 0
let dropped = 0

for (const name of Object.keys(mongoose.models)) {
  const model = mongoose.models[name]!
  // Returns the names of any indexes it removed.
  const removed = await model.syncIndexes()
  const indexes = await model.collection.indexes()

  if (removed.length > 0) {
    dropped += removed.length
    console.log(`${name}: dropped ${removed.join(', ')}`)
  }
  created += indexes.length
  console.log(`${name}: ${indexes.length} index(es)`)
}

console.log('')
console.log(`In sync. ${created} indexes across ${Object.keys(mongoose.models).length} collections.`)
if (dropped > 0) console.log(`${dropped} redundant index(es) removed.`)

await disconnectDb()
process.exit(0)
