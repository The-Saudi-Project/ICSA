/**
 * In-memory MongoDB for integration tests.
 *
 * Every test file gets its own throwaway server, so tests never share state and
 * CI needs no database service. On first run `mongodb-memory-server` downloads a
 * mongod binary and caches it — that download is why hookTimeout is generous.
 */

import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let server: MongoMemoryServer | undefined

export async function startTestDb(): Promise<string> {
  server = await MongoMemoryServer.create()
  const uri = server.getUri()
  await mongoose.connect(uri)
  return uri
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect()
  await server?.stop()
  server = undefined
}

/** Wipe every collection between tests without paying to recreate the server. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
}
