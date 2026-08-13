/**
 * The admin shell — dark glass layout with tab navigation.
 * Shared admin components (Field, buttons, etc.) updated to glass style.
 */

import { NavLink, Outlet } from 'react-router'
import { getStaffUser, logout } from '../../lib/staffApi.js'
import { useNavigate } from 'react-router'

const TABS = [
  { to: '/admin/menu', label: 'Menu', icon: 'M4 6h16M4 12h16M4 18h7' },
  { to: '/admin/tables', label: 'Tables', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { to: '/admin/staff', label: 'Staff', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
]

export default function AdminShell() {
  const navigate = useNavigate()
  const user = getStaffUser()

  async function signOut() {
    await logout()
    void navigate('/staff/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-mesh-deep text-ink">
      <header className="border-b border-border bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-6 px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
          <h1 className="text-lead font-[680]">Restaurant Admin</h1>
          <div className="flex items-center gap-3">
            <NavLink to="/dashboard" className="pressable rounded-lg px-3 py-1.5 text-meta font-medium text-ink-soft hover:bg-surface hover:text-ink transition-colors">
              Dashboard
            </NavLink>
            <NavLink to="/cashier" className="pressable rounded-lg px-3 py-1.5 text-meta font-medium text-accent hover:bg-accent-wash transition-colors">
              Till
            </NavLink>
            <button
              type="button"
              onClick={() => void signOut()}
              className="pressable rounded-lg px-3 py-1.5 text-meta text-ink-soft hover:bg-surface transition-colors"
            >
              {user?.name ? `${user.name} · Sign out` : 'Sign out'}
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-px">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                [
                  'pressable flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-body transition-all duration-200',
                  isActive
                    ? 'bg-accent-wash font-[600] text-accent border-b-2 border-accent'
                    : 'text-ink-soft hover:text-ink hover:bg-surface',
                ].join(' ')
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20">
        <Outlet />
      </main>
    </div>
  )
}

/* ── shared admin pieces ──────────────────────────────────────────────────── */

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
