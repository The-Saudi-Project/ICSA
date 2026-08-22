/**
 * The mark and the wordmark, in one component.
 *
 * The glyph is a cloche over a table edge — a spread laid out, which is what
 * `Simat` means. Deliberately *not* three stacked lines: on the mobile staff
 * header the brand sits directly beside the navigation button, and a three-line
 * mark would read as a second hamburger.
 *
 * Both the app icon (`public/icon.svg`) and this component draw the same two
 * paths, so the tab, the home-screen icon and the sidebar cannot drift apart.
 */

import { brandName } from '../lib/brand.js'
import { useI18n } from '../lib/i18n.js'

type Size = 'sm' | 'md' | 'lg'

const TILE: Record<Size, string> = {
  sm: 'size-6 rounded',
  md: 'size-8 rounded-lg',
  lg: 'size-10 rounded-xl',
}

const GLYPH: Record<Size, number> = { sm: 14, md: 18, lg: 24 }

const WORDMARK: Record<Size, string> = {
  sm: 'text-body font-bold',
  md: 'text-h3 font-black',
  lg: 'text-2xl font-black',
}

export function BrandMark({ size = 'md' }: { size?: Size }) {
  return (
    <div
      className={`${TILE[size]} flex shrink-0 items-center justify-center bg-gradient-to-br from-accent to-accent-bright text-white shadow-lg`}
    >
      <svg
        width={GLYPH[size]}
        height={GLYPH[size]}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.5 17h17" />
        <path d="M6 17v-4a6 6 0 0 1 12 0v4" />
      </svg>
    </div>
  )
}

export function BrandLockup({
  size = 'md',
  className = '',
}: {
  size?: Size
  className?: string
}) {
  const { locale } = useI18n()

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandMark size={size} />
      <span className={`${WORDMARK[size]} tracking-tight text-ink`}>{brandName(locale)}</span>
    </div>
  )
}
