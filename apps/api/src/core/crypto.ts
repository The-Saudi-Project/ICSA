/**
 * Cryptographic helpers.
 *
 * One place for random generation, hashing, and comparison, so no module
 * invents its own. Every random value here comes from `crypto.randomBytes`,
 * never `Math.random`, which is predictable and must never touch a credential.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { env } from '../config/env.js'
import { logger } from './logger.js'

/** 256 bits. The size used for refresh tokens and, in Step 4, table tokens. */
export const TOKEN_BYTES = 32

/** URL-safe opaque token. 32 bytes -> 43 characters. */
export function generateToken(bytes = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Short opaque public identifier, for things that appear in a URL but are not
 * credentials (order and restaurant public IDs).
 * 12 characters of base64url is ~72 bits — not guessable by enumeration.
 */
export function generatePublicId(bytes = 9): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * SHA-256, hex encoded. Used to store lookup hashes of high-entropy tokens.
 *
 * A plain hash is correct here and a password hash would be wrong: these tokens
 * already contain 256 bits of randomness, so there is nothing to brute-force,
 * and lookups must be fast enough to run on every request.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Constant-time comparison. Never compare a secret with `===`. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

/**
 * Argon2id parameters.
 *
 * Argon2id is memory-hard, so an attacker with GPUs gains far less than against
 * bcrypt. 19 MiB / 2 iterations / 1 lane is the OWASP baseline; it costs a few
 * tens of milliseconds per login, which is imperceptible to a user and
 * expensive to an attacker running billions of guesses.
 *
 * The memory cost is the number that matters. Do not lower it to speed up tests.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTIONS)
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain, ARGON_OPTIONS)
  } catch {
    // A malformed stored hash must fail closed, never throw into the request.
    return false
  }
}

/**
 * A valid Argon2 hash of a value nobody knows.
 *
 * Verified against when a login names an account that does not exist, so that
 * "unknown email" and "wrong password" take the same amount of time. Without
 * this, response timing alone reveals which email addresses are registered.
 */
let dummyHashPromise: Promise<string> | undefined
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(generateToken())
  return dummyHashPromise
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reversible encryption for secrets we must be able to read back.
 *
 * Used for table tokens: they are stored hashed for lookup, but the owner has
 * to be able to reprint a table's QR code months later without rotating the
 * token and rewriting the physical NFC tag. A hash cannot do that, so an
 * encrypted copy is kept alongside it.
 *
 * AES-256-GCM is authenticated: tampering with the stored ciphertext makes
 * decryption fail rather than silently producing different plaintext.
 * ──────────────────────────────────────────────────────────────────────────── */

const CIPHER = 'aes-256-gcm'
const IV_BYTES = 12 // 96 bits, the size GCM is specified for
const VERSION = 'v1' // lets the format change later without breaking old rows

export class CryptoKeyError extends Error {
  override readonly name = 'CryptoKeyError'
}

let cachedKey: Buffer | undefined

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey

  if (env.TABLE_TOKEN_KEY) {
    cachedKey = Buffer.from(env.TABLE_TOKEN_KEY, 'base64')
    return cachedKey
  }

  if (env.isProduction) {
    // Unreachable — env validation blocks it. Belt and braces.
    throw new CryptoKeyError('TABLE_TOKEN_KEY is required in production')
  }

  logger.warn(
    'TABLE_TOKEN_KEY is not set - using a random per-process key. ' +
      'Existing table tokens will not be decryptable after a restart. ' +
      'Set it in apps/api/.env.',
  )
  cachedKey = randomBytes(32)
  return cachedKey
}

/** Returns `v1:<iv>:<authTag>:<ciphertext>`, all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Returns null rather than throwing when the payload cannot be decrypted —
 * a rotated key or a corrupted row is an operational problem to surface in the
 * UI ("QR unavailable, rotate this table's token"), not a 500.
 */
export function decryptSecret(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(':')
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null

    const decipher = createDecipheriv(CIPHER, encryptionKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}
