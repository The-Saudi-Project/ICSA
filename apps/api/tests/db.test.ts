/**
 * Proves the in-memory MongoDB harness works before Step 2 depends on it.
 * If this file fails, the mongod binary download is the first thing to check.
 */

import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Imported for its side effects: this is where sanitizeFilter/strictQuery are set.
import '../src/db/mongoose.js'
import { clearTestDb, startTestDb, stopTestDb } from './setup/mongo.js'

describe('test database harness', () => {
  beforeAll(async () => {
    await startTestDb()
  })

  afterAll(async () => {
    await stopTestDb()
  })

  it('connects', () => {
    expect(mongoose.connection.readyState).toBe(1)
  })

  it('reads and writes', async () => {
    const Widget = mongoose.model('Widget', new mongoose.Schema({ name: String }))
    await Widget.create({ name: 'test' })
    expect(await Widget.countDocuments()).toBe(1)

    await clearTestDb()
    expect(await Widget.countDocuments()).toBe(0)
  })

  it('has sanitizeFilter enabled, blocking operator injection', async () => {
    expect(mongoose.get('sanitizeFilter')).toBe(true)
  })
})
