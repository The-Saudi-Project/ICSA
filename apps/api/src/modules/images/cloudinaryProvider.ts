/**
 * Cloudinary adapter — signed direct upload.
 *
 * Written now, inert until credentials exist. No SDK: Cloudinary's signature is
 * a SHA-1 of the sorted parameters plus the API secret, which is a dozen lines
 * of `node:crypto`. A dependency for that would be weight without benefit.
 *
 * Flow:
 *   1. The browser asks us for credentials.
 *   2. We sign a folder scoped to the tenant, a short expiry, and the
 *      transformation we want applied on arrival.
 *   3. The browser POSTs the file straight to Cloudinary.
 *   4. Cloudinary returns a URL, which the browser sends back to us on the menu
 *      item. We verify the URL is genuinely ours before storing it.
 *
 * The API secret never leaves the server, and the file never touches it.
 */

import { createHash } from 'node:crypto'
import { env } from '../../config/env.js'
import { AppError } from '../../core/errors.js'
import { logger } from '../../core/logger.js'
import {
  ALLOWED_IMAGE_MIME_TYPES,
  type ImageProvider,
  type UploadCredentials,
} from './imageProvider.js'

const SIGNATURE_TTL_SECONDS = 300

/**
 * Applied by Cloudinary as the file arrives, so we never store a 12-megapixel
 * phone photo and never serve one to a customer on 4G.
 *
 *   c_limit,w_1600  never upscale, cap the long edge
 *   q_auto          let Cloudinary choose the quality/size trade-off
 *   f_auto          serve AVIF/WebP to browsers that accept them
 */
const INCOMING_TRANSFORMATION = 'c_limit,w_1600,q_auto,f_auto'

export class CloudinaryProvider implements ImageProvider {
  readonly name = 'cloudinary'
  readonly isConfigured: boolean

  private readonly cloudName: string
  private readonly apiKey: string
  private readonly apiSecret: string

  constructor() {
    this.cloudName = env.CLOUDINARY_CLOUD_NAME ?? ''
    this.apiKey = env.CLOUDINARY_API_KEY ?? ''
    this.apiSecret = env.CLOUDINARY_API_SECRET ?? ''
    this.isConfigured = Boolean(this.cloudName && this.apiKey && this.apiSecret)

    if (!this.isConfigured) {
      logger.warn(
        'IMAGE_PROVIDER is cloudinary but CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / ' +
          'CLOUDINARY_API_SECRET are not all set. Uploads will be refused.',
      )
    }
  }

  /**
   * Cloudinary's scheme: sort the parameters by key, join as `k=v&k=v`, append
   * the API secret, SHA-1 the result. The secret is never sent to the browser.
   */
  private sign(params: Record<string, string>): string {
    const canonical = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&')

    return createHash('sha1').update(canonical + this.apiSecret).digest('hex')
  }

  /** One folder per tenant, so a stray upload cannot land in someone else's space. */
  private folderFor(restaurantId: string, kind: string): string {
    return `rw/${restaurantId}/${kind}`
  }

  createUploadCredentials(input: {
    restaurantId: string
    kind: 'menu-item' | 'menu-category' | 'restaurant-logo'
  }): Promise<UploadCredentials> {
    if (!this.isConfigured) {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Cloudinary is selected but not fully configured. Set CLOUDINARY_CLOUD_NAME, ' +
          'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in apps/api/.env.',
      )
    }

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const folder = this.folderFor(input.restaurantId, input.kind)

    // Every signed parameter is chosen by us. The browser cannot add or change
    // one without invalidating the signature — so it cannot redirect the upload
    // into another tenant's folder or skip the transformation.
    const signedParams: Record<string, string> = {
      folder,
      timestamp,
      transformation: INCOMING_TRANSFORMATION,
    }

    return Promise.resolve({
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      fields: {
        api_key: this.apiKey,
        timestamp,
        folder,
        transformation: INCOMING_TRANSFORMATION,
        signature: this.sign(signedParams),
      },
      expiresInSeconds: SIGNATURE_TTL_SECONDS,
      maxBytes: env.IMAGE_UPLOAD_MAX_BYTES,
      allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    })
  }

  /**
   * A stored image URL must be on our Cloudinary account *and* inside this
   * tenant's folder. Both halves matter: the first stops an admin pointing at
   * an arbitrary host, the second stops one restaurant referencing another's
   * uploads.
   */
  isOwnedUrl(url: string, restaurantId: string): boolean {
    if (!this.isConfigured) return false

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }

    if (parsed.protocol !== 'https:') return false
    if (parsed.hostname !== 'res.cloudinary.com') return false
    if (!parsed.pathname.startsWith(`/${this.cloudName}/`)) return false

    // Cloudinary may insert transformation segments into the path, so match the
    // tenant folder anywhere in it rather than at a fixed position.
    return parsed.pathname.includes(`/rw/${restaurantId}/`)
  }

  deleteImage(url: string): Promise<void> {
    // Deliberately not implemented yet. Deleting requires a signed admin API
    // call, and an orphaned image on a free tier costs nothing, whereas a
    // half-written delete that removes the wrong asset is expensive. Revisit
    // when storage is measured, not before.
    logger.info({ url }, 'image delete requested; retention cleanup is not implemented yet')
    return Promise.resolve()
  }
}
