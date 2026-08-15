/**
 * Shared admin building blocks — sections, fields and the button classes the
 * three admin screens are assembled from.
 *
 * This file used to also export an `AdminShell` layout component with its own
 * header, sign-out and tab bar. Nothing imported it: the redesign replaced that
 * navigation with `StaffLayout`, and the old shell was left behind along with
 * `StaffChrome`. Both were removed on 2026-08-15. They were not harmless —
 * each carried its own copy of the sign-out flow and its own hard-coded route
 * list, so they were a second, unreachable, silently drifting definition of how
 * staff navigation works. The filename is kept so the four importers of the
 * helpers below do not have to change.
 */

export function AdminSection({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 className="text-h3 font-bold text-ink tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="relative">
        <div className="absolute -inset-4 bg-surface/30 rounded-2xl blur-xl pointer-events-none -z-10" />
        {children}
      </div>
    </section>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-small font-bold uppercase tracking-wider text-ink-soft mb-2 block">
        {label}
      </span>
      {children}
    </label>
  )
}

export const inputClass =
  'input-glass w-full border-border/40 hover:border-border-strong focus:border-accent bg-surface-strong/50 shadow-inner'

export const primaryButtonClass =
  'btn-gradient pressable px-6 py-2.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none'

export const quietButtonClass =
  'pressable rounded-xl bg-surface px-5 py-2.5 text-meta font-bold text-ink ring-1 ring-border shadow-sm hover:bg-surface-hover hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none'

/**
 * A one-time secret, shown once and never retrievable.
 */
export function OneTimeSecret({
  label,
  value,
  onDone,
}: {
  label: string
  value: string
  onDone: () => void
}) {
  return (
    <div className="mt-4 glass p-5" style={{ borderColor: 'var(--color-gold)25' }}>
      <p className="text-body font-[600]">{label}</p>
      <p className="mt-2 rounded-xl bg-ground px-4 py-3 font-mono text-body break-all select-all ring-1 ring-border text-gold">
        {value}
      </p>
      <p className="mt-2 text-meta text-ink-soft">
        Copy it now and hand it over directly. It cannot be shown again, and they must change it
        when they first sign in.
      </p>
      <button type="button" onClick={onDone} className={`${quietButtonClass} mt-3`}>
        I have copied it
      </button>
    </div>
  )
}
