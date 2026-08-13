/**
 * Image provider selection.
 *
 * `IMAGE_PROVIDER=none` (the default) means uploads are refused with an
 * explanation and everything else still works. Nothing in development is
 * blocked waiting for an external account.
 */

import { env } from '../../config/env.js'
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

export type { ImageProvider, UploadCredentials } from './imageProvider.js'
export { ALLOWED_IMAGE_MIME_TYPES } from './imageProvider.js'
