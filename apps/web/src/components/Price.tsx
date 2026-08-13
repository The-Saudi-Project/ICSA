import { money } from '../lib/format.js'

/**
 * Money display with gold accent. The number is prominent,
 * the currency code is quieter.
 */
export function Price({
  halalas,
  size = 'body',
  className = '',
}: {
  halalas: number
  size?: 'meta' | 'body' | 'lead' | 'title'
  className?: string
}) {
  const scale = {
    meta: 'text-meta',
    body: 'text-body',
    lead: 'text-lead',
    title: 'text-title',
  }[size]

  return (
    <span className={`tnum whitespace-nowrap ${scale} ${className}`}>
      <span className="text-gold">{money(halalas)}</span>
      <span className="ms-1 text-[0.72em] font-medium text-ink-faint">SAR</span>
    </span>
  )
}
