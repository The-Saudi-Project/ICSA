/**
 * Image provider selection.
 *
 * `IMAGE_PROVIDER=none` (the default) means uploads are refused with an
 * explanation and everything else still works. Nothing in development is
 * blocked waiting for an external account.
 */

import { env } from '../../config/env.js'
import { badRequest } from '../../core/errors.js'
import { CloudinaryProvider } from './cloudinaryProvider.js'
import { NullImageProvider } from './nullImageProvider.js'
import type { ImageProvider } from './imageProvider.js'

let provider: ImageProvider | undefined

export function imageProvider(): ImageProvider {
  provider ??= env.IMAGE_PROVIDER === 'cloudinary' ? new CloudinaryProvider() : new NullImageProvider()
  return provider
}

/** Test seam. Never called by application code. */
export function __setImageProviderForTests(next: ImageProvider | undefined): void {
  provider = next
}

/**
 * An image URL may only be stored if it genuinely belongs to our image provider
 * and to this tenant.
 *
 * Without this an admin could point any stored image — a menu photo, the
 * restaurant's logo — at an arbitrary URL, and our customer-facing page would
 * then load content from a host we do not control: a tracking pixel at best, an
 * attacker-controlled response at worst.
 *
 * Lives here rather than in one module because there is now more than one caller
 * (menu items and the restaurant logo), and two copies of a rule like this drift.
 */
export function assertOwnedImageUrl(url: string | undefined, restaurantId: string): void {
  if (url === undefined || url === '') return

  if (!imageProvider().isOwnedUrl(url, restaurantId)) {
    throw badRequest(
      'Image URLs must come from this restaurant’s own uploads. Upload the image first, then use the URL it returns.',
    )
  }
}

export type { ImageProvider, UploadCredentials } from './imageProvider.js'
export { ALLOWED_IMAGE_MIME_TYPES } from './imageProvider.js'
