/**
 * Image storage — provider interface.
 *
 * The core application never imports a vendor SDK. It asks this interface for
 * upload credentials and for a delete, and an adapter does the rest. Swapping
 * Cloudinary for Cloudflare R2 later touches one file.
 *
 * The upload itself never passes through our server. We hand the browser a
 * short-lived signature and the browser POSTs the file straight to the
 * provider. That keeps large uploads off a small backend instance, and it means
 * an image never occupies our memory or disk.
 *
 * Current decision (2026-08-09, product owner): Cloudinary for development and
 * demo, entirely on the free tier. Cloudflare R2 is the production choice and
 * is a TODO before real production — recorded in PROJECT_STATE.md §22.
 */

export interface UploadCredentials {
  /** Where the browser POSTs the file. */
  uploadUrl: string
  /** Fields the browser must include in the multipart form, verbatim. */
  fields: Record<string, string>
  /** Seconds until the signature stops being accepted. */
  expiresInSeconds: number
  maxBytes: number
  allowedMimeTypes: readonly string[]
}

export interface ImageProvider {
  readonly name: string
  /** False when the provider has no credentials configured. */
  readonly isConfigured: boolean

  /**
   * Signs a direct browser upload, scoped to one tenant's folder.
   * The tenant comes from the request context, never from the client.
   */
  createUploadCredentials(input: {
    restaurantId: string
    kind: 'menu-item' | 'menu-category' | 'restaurant-logo'
  }): Promise<UploadCredentials>

  /**
   * True when a URL genuinely belongs to this provider and this tenant.
   *
   * This is the check that stops a restaurant admin from pointing an item's
   * image at an arbitrary URL — which would let them use our customer-facing
   * page to serve tracking pixels or malicious content from a host we do not
   * control.
   */
  isOwnedUrl(url: string, restaurantId: string): boolean

  deleteImage(url: string): Promise<void>
}

/** Images we accept. Deliberately narrow — no SVG, which can carry script. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const
