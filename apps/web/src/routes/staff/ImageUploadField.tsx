/**
 * Menu item image upload.
 *
 * The file never passes through our server. The browser asks our API for a
 * short-lived signature scoped to this restaurant's folder, POSTs the file
 * straight to the image host, and sends back only the resulting URL — which the
 * server then re-validates as genuinely ours before storing it.
 *
 * That design is why this component looks the way it does: the "upload" is two
 * network calls to two different hosts, and either can fail for its own reasons,
 * so both failures have to be legible to a restaurant owner rather than
 * collapsing into "something went wrong".
 *
 * With no provider configured — the default — the credentials call answers 503
 * with the exact variables to set. That message is shown verbatim rather than
 * being softened, because it is the most useful thing anyone can read here.
 */

import { useState } from 'react'
import imageCompression from 'browser-image-compression'
import { Button } from '../../components/ui/Button.js'
import { requestUploadCredentials, uploadImageToProvider } from '../../lib/staffApi.js'

const MB = 1024 * 1024

export function ImageUploadField({
  value,
  onChange,
}: {
  /** The currently stored image URL, or empty. */
  value: string
  onChange: (url: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** A local preview so the picture appears while the upload is still running. */
  const [preview, setPreview] = useState<string | null>(null)

  async function handleFile(originalFile: File) {
    setError(null)
    setBusy(true)

    // Revoked in every exit path below; a preview that outlives the component
    // would hold the whole image in memory for the life of the tab.
    const objectUrl = URL.createObjectURL(originalFile)
    setPreview(objectUrl)

    try {
      // Compress the image locally to save bandwidth
      const file = await imageCompression(originalFile, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
      })

      const credentials = await requestUploadCredentials('menu-item')

      // Checked here as well as at the host, so an owner on a slow connection
      // is told immediately rather than after uploading eight megabytes.
      if (!credentials.allowedMimeTypes.includes(file.type)) {
        throw new Error(
          `That file is a ${file.type || 'unknown type'}. Use ${credentials.allowedMimeTypes
            .map((t) => t.replace('image/', ''))
            .join(', ')}.`,
        )
      }
      if (file.size > credentials.maxBytes) {
        throw new Error(
          `That image is ${(file.size / MB).toFixed(1)} MB. The limit is ${(
            credentials.maxBytes / MB
          ).toFixed(1)} MB.`,
        )
      }

      onChange(await uploadImageToProvider(credentials, file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload failed.')
      setPreview(null)
    } finally {
      URL.revokeObjectURL(objectUrl)
      setBusy(false)
    }
  }

  const shown = value || preview

  return (
    <div className="space-y-3">
      <span className="block text-meta font-semibold uppercase tracking-[0.12em] text-ink-soft">
        Photo
      </span>

      <div className="flex items-start gap-4">
        <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-surface-strong ring-1 ring-border grid place-items-center">
          {shown ? (
            <img src={shown} alt="Upload preview" className="size-full object-cover" />
          ) : (
            <svg
              className="size-8 text-ink-faint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  // Reset so re-picking the same file fires change again.
                  e.target.value = ''
                  if (file) void handleFile(file)
                }}
              />
              <span
                className={[
                  'inline-flex items-center justify-center font-semibold transition-all',
                  'bg-surface border border-border text-ink hover:bg-surface-hover',
                  'px-3 py-1.5 text-small rounded-lg cursor-pointer',
                  busy ? 'opacity-50 pointer-events-none' : 'pressable shadow-sm',
                ].join(' ')}
              >
                {busy ? 'Uploading…' : value ? 'Replace photo' : 'Upload a photo'}
              </span>
            </label>

            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-status-danger"
                disabled={busy}
                onClick={() => {
                  setPreview(null)
                  setError(null)
                  // Empty string clears the field; the server treats it as "no image".
                  onChange('')
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>

          <p className="text-caption text-ink-faint">
            JPEG, PNG, WebP or AVIF. It is resized and optimised on arrival, so a photo straight
            from a phone is fine. Removing it here does not delete the stored file.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-small font-medium text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
