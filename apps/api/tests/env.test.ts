import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'

const base = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://x/y' }
const secret = 'a'.repeat(32)
/** 32 bytes, base64 — the only shape TABLE_TOKEN_KEY accepts. */
const aesKey = Buffer.alloc(32, 7).toString('base64')

/** Everything production insists on. Individual tests remove one field at a time. */
const productionEnv = {
  ...base,
  JWT_ACCESS_SECRET: secret,
  TABLE_SESSION_SECRET: secret,
  TABLE_TOKEN_KEY: aesKey,
  IP_HASH_SALT: 'b'.repeat(16),
  PUBLIC_APP_URL: 'https://app.test',
  CORS_ORIGIN: 'https://app.test',
} as NodeJS.ProcessEnv

describe('loadEnv', () => {
  it('applies development defaults', () => {
    const env = loadEnv({} as NodeJS.ProcessEnv)
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(4000)
    expect(env.isDevelopment).toBe(true)
    expect(env.isProduction).toBe(false)
  })

  it('does not require a database outside production', () => {
    expect(() => loadEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow()
  })

  it('splits CORS_ORIGIN into a list', () => {
    const env = loadEnv({
      CORS_ORIGIN: 'http://a.test, http://b.test ,',
    } as NodeJS.ProcessEnv)
    expect(env.corsOrigins).toEqual(['http://a.test', 'http://b.test'])
  })

  it('rejects a non-numeric port', () => {
    expect(() => loadEnv({ PORT: 'not-a-port' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment/,
    )
  })

  it('rejects a malformed PUBLIC_APP_URL', () => {
    expect(() => loadEnv({ PUBLIC_APP_URL: 'nonsense' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment/,
    )
  })

  describe('production hardening', () => {
    /** Removing any one required secret must stop the process from starting. */
    const withoutField = (field: string) => {
      const copy = { ...productionEnv }
      delete copy[field]
      return copy
    }

    it.each([
      ['MONGODB_URI', /MONGODB_URI/],
      ['JWT_ACCESS_SECRET', /JWT_ACCESS_SECRET/],
      ['TABLE_SESSION_SECRET', /TABLE_SESSION_SECRET/],
      ['TABLE_TOKEN_KEY', /TABLE_TOKEN_KEY/],
      ['IP_HASH_SALT', /IP_HASH_SALT/],
    ])('requires %s', (field, pattern) => {
      expect(() => loadEnv(withoutField(field))).toThrow(pattern)
    })

    it('rejects a short JWT secret', () => {
      expect(() =>
        loadEnv({ ...productionEnv, JWT_ACCESS_SECRET: 'too-short' } as NodeJS.ProcessEnv),
      ).toThrow(/Invalid environment/)
    })

    it('rejects a TABLE_TOKEN_KEY that is not exactly 32 bytes', () => {
      for (const badKey of [
        Buffer.alloc(16, 1).toString('base64'), // AES-128 key, too weak
        Buffer.alloc(31, 1).toString('base64'),
        Buffer.alloc(64, 1).toString('base64'),
        'not-base64-at-all!!',
      ]) {
        expect(() =>
          loadEnv({ ...productionEnv, TABLE_TOKEN_KEY: badKey } as NodeJS.ProcessEnv),
        ).toThrow(/Invalid environment/)
      }
    })

    it('rejects a wildcard CORS origin', () => {
      expect(() => loadEnv({ ...productionEnv, CORS_ORIGIN: '*' } as NodeJS.ProcessEnv)).toThrow(
        /wildcard/,
      )
    })

    it('rejects a plaintext http app URL', () => {
      expect(() =>
        loadEnv({ ...productionEnv, PUBLIC_APP_URL: 'http://app.test' } as NodeJS.ProcessEnv),
      ).toThrow(/https/)
    })

    it('accepts a correct production configuration', () => {
      const env = loadEnv(productionEnv)
      expect(env.isProduction).toBe(true)
      expect(env.corsOrigins).toEqual(['https://app.test'])
      expect(Buffer.from(env.TABLE_TOKEN_KEY!, 'base64')).toHaveLength(32)
    })
  })
})
