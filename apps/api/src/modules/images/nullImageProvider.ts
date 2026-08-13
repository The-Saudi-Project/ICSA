/**
 * The default provider: no image hosting configured.
 *
 * Everything else in the menu works — items, prices, modifiers, the customer
 * menu — so development is never blocked on an external account. Only the
 * upload endpoint refuses, and it refuses with instructions rather than a
 * generic error.
 *
 * It deliberately does NOT fall back to accepting arbitrary URLs. An admin
 * pasting `https://anything.example/pic.jpg` would make our customer page load
 * content from a host we do not control.
 */

import { AppError } from '../../core/errors.js'
import { ALLOWED_IMAGE_MIME_TYPES, type ImageProvider, type UploadCredentials } from './imageProvider.js'

export class NullImageProvider implements ImageProvider {
  readonly name = 'none'
  readonly isConfigured = false

  createUploadCredentials(): Promise<UploadCredentials> {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Image uploads are not configured. Set IMAGE_PROVIDER=cloudinary and the ' +
        'CLOUDINARY_* variables in apps/api/.env, then restart the API.',
    )
  }

  isOwnedUrl(): boolean {
    return false
  }

  deleteImage(): Promise<void> {
    return Promise.resolve()
  }
}

export { ALLOWED_IMAGE_MIME_TYPES }
