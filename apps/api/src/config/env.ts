/**
 * Environment configuration.
 *
 * Validated with Zod at boot. If anything is missing or malformed the process
 * exits immediately with a readable list of problems.
 *
 * Failing fast is deliberate: a server that starts with a missing JWT secret
 * and only discovers it on the first login is far worse than one that refuses
 * to start at all.
 */

import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

/**
 * Tests never read the developer's `.env`.
 *
 * Two reasons, and the second is the important one:
 *  - test results must not depend on what happens to be in a local file;
 *  - a test suite that inherits a real `MONGODB_URI` is one mistaken
 *    `deleteMany({})` away from wiping a live database. Tests get their own
 *    in-memory MongoDB and nothing else.
 */
if (process.env.NODE_ENV !== 'test') {
  loadDotenv()
}

const MIN_SECRET_LENGTH = 32

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Optional in development and test so the API runs before any database exists.
  // Required in production — enforced below.
  MONGODB_URI: z.string().min(1).optional(),

  // Optional outside production so the API boots with no configuration.
  // Absent in development means an ephemeral per-process secret (see core/jwt.ts).
  JWT_ACCESS_SECRET: z.string().min(MIN_SECRET_LENGTH).optional(),
  TABLE_SESSION_SECRET: z.string().min(MIN_SECRET_LENGTH).optional(),
  /**
   * AES-256-GCM key, base64. Must decode to exactly 32 bytes — a shorter key
   * silently weakens the cipher, so it is rejected rather than padded.
   */
  TABLE_TOKEN_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64 encoded')
    .optional(),
  IP_HASH_SALT: z.string().min(16).optional(),

  /** How long a customer's table session lasts before it must be re-established. */
  TABLE_SESSION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  /** Failed logins allowed before an account is temporarily locked. */
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(8),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  /**
   * Set when the API and web app are on sibling subdomains (api./app.), so the
   * refresh cookie is shared. Leave unset for localhost development.
   */
  COOKIE_DOMAIN: z.string().optional(),

  /**
   * Base of every QR/NFC payload: `<PUBLIC_APP_URL>/t/<token>`.
   *
   * The default must match `server.port` in `apps/web/vite.config.ts`, which is
   * **5174**, not Vite's own default of 5173. When these drifted apart, every
   * table URL and QR code pointed at a port nothing was listening on, and the
   * only symptom was ERR_FAILED when someone scanned a tag.
   *
   * Nothing is stored: the URL is rebuilt from this value on every read, so
   * correcting it fixes existing tables without rotating a single token.
   */
  PUBLIC_APP_URL: z
    .string()
    .refine((v) => URL.canParse(v), 'must be a valid absolute URL')
    .default('http://localhost:5174'),
  /** Comma-separated list of exact allowed browser origins. Same port as above. */
  CORS_ORIGIN: z.string().default('http://localhost:5174'),

  /** Max JSON body size. Small on purpose — no endpoint here needs a large body. */
  BODY_LIMIT: z.string().default('100kb'),

  /**
   * Image hosting. `none` means uploads are refused with an explanation and
   * everything else still works — development is never blocked on an account.
   *
   * Cloudinary is the development and demo choice (free tier). Cloudflare R2 is
   * the production choice and is a TODO before real production.
   */
  IMAGE_PROVIDER: z.enum(['none', 'cloudinary']).default('none'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  /** 5 MB. A phone photo is smaller than this once the browser has encoded it. */
  IMAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().min(100_000).max(20_000_000).default(5_000_000),

  /**
   * How long a customer may cancel their own order from their phone. After
   * this the kitchen may have started, so cancelling becomes a staff decision
   * about waste rather than a customer's right.
   */
  ORDER_CANCEL_WINDOW_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),

  PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().min(8).optional(),
})

export type Env = z.infer<typeof EnvSchema> & {
  isProduction: boolean
  isTest: boolean
  isDevelopment: boolean
  corsOrigins: string[]
}

/** Structural type so this does not break across Zod major versions. */
type Issue = { readonly path: readonly PropertyKey[]; readonly message: string }

function formatIssues(issues: readonly Issue[]): string {
  return issues
    .map((i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('\n')
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const raw: NodeJS.ProcessEnv = { ...source }

  // Tests assert on responses, not on log output. Expected errors (401s, 403s,
  // validation failures) are the *point* of the security suite, so leaving the
  // logger on buries the actual results in noise. Set LOG_LEVEL explicitly to
  // override when debugging a test.
  if (raw.NODE_ENV === 'test' && !raw.LOG_LEVEL) {
    raw.LOG_LEVEL = 'silent'
  }

  const parsed = EnvSchema.safeParse(raw)

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(parsed.error.issues)}`)
  }

  const env = parsed.data
  const isProduction = env.NODE_ENV === 'production'

  // Extra rules that only apply in production.
  const productionProblems: string[] = []
  if (isProduction) {
    if (!env.MONGODB_URI) productionProblems.push('  - MONGODB_URI: required in production')
    if (!env.JWT_ACCESS_SECRET) {
      productionProblems.push(
        `  - JWT_ACCESS_SECRET: required in production, minimum ${MIN_SECRET_LENGTH} characters`,
      )
    }
    if (!env.TABLE_SESSION_SECRET) {
      productionProblems.push('  - TABLE_SESSION_SECRET: required in production')
    }
    if (!env.TABLE_TOKEN_KEY) {
      productionProblems.push('  - TABLE_TOKEN_KEY: required in production (32 bytes, base64)')
    }
    if (!env.IP_HASH_SALT) {
      productionProblems.push('  - IP_HASH_SALT: required in production for audit IP hashing')
    }
    if (
      env.IMAGE_PROVIDER === 'cloudinary' &&
      !(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
    ) {
      productionProblems.push(
        '  - CLOUDINARY_*: IMAGE_PROVIDER is cloudinary but cloud name, key or secret is missing',
      )
    }
    if (env.CORS_ORIGIN.includes('*')) {
      productionProblems.push('  - CORS_ORIGIN: wildcard origins are not allowed in production')
    }
    if (env.PUBLIC_APP_URL.startsWith('http://')) {
      productionProblems.push('  - PUBLIC_APP_URL: must use https in production')
    }
  }
  if (productionProblems.length > 0) {
    throw new Error(`Invalid environment configuration:\n${productionProblems.join('\n')}`)
  }

  return {
    ...env,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    isDevelopment: env.NODE_ENV === 'development',
    corsOrigins: env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  }
}

/**
 * The singleton used by the running server.
 * Tests call `loadEnv(customSource)` directly instead of importing this.
 */
export const env: Env = loadEnv()
