/**
 * The Cloudinary adapter, with credentials present.
 *
 * Every existing image test covers the *unconfigured* path — the 503 and the
 * refusal to store an arbitrary URL. That left the configured path entirely
 * untested, which is where the expensive mistake lives: if the URL Cloudinary
 * hands back does not satisfy `isOwnedUrl`, an owner uploads a photo
 * successfully and then cannot save the item, and the error blames the image
 * URL rather than the path matching.
 *
 * So the important test here is the round trip — take the folder we actually
 * sign, build the URL Cloudinary would return for a file in it, and assert our
 * own validator accepts it.
 *
 * Credentials below are fabricated and local to this process. Nothing here
 * makes a network call.
 */

process.env.IMAGE_PROVIDER = 'cloudinary'
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud'
process.env.CLOUDINARY_API_KEY = '123456789012345'
process.env.CLOUDINARY_API_SECRET = 'not-a-real-secret-abcdef123'

const { CloudinaryProvider } = await import('../src/modules/images/cloudinaryProvider.js')

import { describe, expect, it } from 'vitest'

const RESTAURANT_ID = '65d1a1234567890123456789'
const OTHER_RESTAURANT_ID = '65d1a1234567890123456780'
const provider = new CloudinaryProvider()

describe('signing an upload', () => {
  it('is configured once the three variables are set', () => {
    expect(provider.isConfigured).toBe(true)
  })

  it('scopes the folder to this tenant and this kind', async () => {
    const credentials = await provider.createUploadCredentials({
      restaurantId: RESTAURANT_ID,
      kind: 'menu-item',
    })

    expect(credentials.fields.folder).toBe(`rw/${RESTAURANT_ID}/menu-item`)
    expect(credentials.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/upload')
  })

  /**
   * The browser is handed these fields and posts them verbatim. The API secret
   * signs them and must never be among them — it would be readable by anyone
   * with the page open, and it authorises every operation on the account.
   */
  it('never sends the API secret to the browser', async () => {
    const credentials = await provider.createUploadCredentials({
      restaurantId: RESTAURANT_ID,
      kind: 'menu-item',
    })

    const serialised = JSON.stringify(credentials)
    expect(serialised).not.toContain(process.env.CLOUDINARY_API_SECRET!)
    expect(credentials.fields.api_key).toBe('123456789012345')
    expect(credentials.fields.signature).toMatch(/^[0-9a-f]{40}$/)
  })

  it('surfaces the limits the upload form enforces', async () => {
    const credentials = await provider.createUploadCredentials({
      restaurantId: RESTAURANT_ID,
      kind: 'menu-item',
    })

    expect(credentials.maxBytes).toBeGreaterThan(0)
    expect(credentials.allowedMimeTypes).toContain('image/jpeg')
    // SVG can carry script, so it must never be offered.
    expect(credentials.allowedMimeTypes).not.toContain('image/svg+xml')
    expect(credentials.expiresInSeconds).toBeGreaterThan(0)
  })

  it('changes the signature when the folder changes', async () => {
    const [mine, theirs] = await Promise.all([
      provider.createUploadCredentials({ restaurantId: RESTAURANT_ID, kind: 'menu-item' }),
      provider.createUploadCredentials({ restaurantId: OTHER_RESTAURANT_ID, kind: 'menu-item' }),
    ])

    // A browser cannot repoint the upload at another tenant's folder without
    // invalidating the signature, because the folder is one of the signed params.
    expect(mine.fields.signature).not.toBe(theirs.fields.signature)
  })
})

describe('the URL Cloudinary returns is accepted by our own validator', () => {
  /** What `secure_url` looks like for a file uploaded into the signed folder. */
  const delivered = (path: string) => `https://res.cloudinary.com/demo-cloud/${path}`

  it('accepts a plain delivery URL in this tenant’s folder', () => {
    const url = delivered(`image/upload/v1699999999/rw/${RESTAURANT_ID}/menu-item/biriyani.jpg`)
    expect(provider.isOwnedUrl(url, RESTAURANT_ID)).toBe(true)
  })

  /**
   * The signed incoming transformation can appear as a path segment, which is
   * why the folder is matched anywhere in the path rather than at a fixed
   * offset. This is the case that would break a naive `startsWith`.
   */
  it('accepts a URL carrying transformation segments', () => {
    for (const path of [
      `image/upload/c_limit,w_1600,q_auto,f_auto/v1699999999/rw/${RESTAURANT_ID}/menu-item/a.webp`,
      `image/upload/f_auto,q_auto/w_400/v1/rw/${RESTAURANT_ID}/menu-item/nested/b.avif`,
    ]) {
      expect(provider.isOwnedUrl(delivered(path), RESTAURANT_ID), path).toBe(true)
    }
  })

  it('rejects another tenant’s folder on our own account', () => {
    const url = delivered(`image/upload/v1/rw/${OTHER_RESTAURANT_ID}/menu-item/a.jpg`)
    expect(provider.isOwnedUrl(url, RESTAURANT_ID)).toBe(false)
  })

  it('rejects another Cloudinary account, plain http, and other hosts', () => {
    for (const url of [
      `https://res.cloudinary.com/someone-else/image/upload/v1/rw/${RESTAURANT_ID}/menu-item/a.jpg`,
      `http://res.cloudinary.com/demo-cloud/image/upload/v1/rw/${RESTAURANT_ID}/menu-item/a.jpg`,
      `https://evil.test/demo-cloud/image/upload/rw/${RESTAURANT_ID}/menu-item/a.jpg`,
      'javascript:alert(1)',
      'not a url at all',
    ]) {
      expect(provider.isOwnedUrl(url, RESTAURANT_ID), url).toBe(false)
    }
  })

  /**
   * A host that merely *contains* our domain must not pass — the check is on
   * the parsed hostname, not on the string.
   */
  it('rejects a lookalike hostname', () => {
    const url = `https://res.cloudinary.com.evil.test/demo-cloud/image/upload/rw/${RESTAURANT_ID}/menu-item/a.jpg`
    expect(provider.isOwnedUrl(url, RESTAURANT_ID)).toBe(false)
  })
})
