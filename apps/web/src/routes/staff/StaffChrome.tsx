/**
 * The thin bar across the top of every staff surface.
 * Dark glass header with accent links.
 */

import { Link, useNavigate } from 'react-router'
import { canUseAdmin } from '../../lib/roles.js'
import { getStaffUser, logout } from '../../lib/staffApi.js'

export function StaffChrome({
  title,
  count,
}: {
  title: string
  count?: number
}) {
  const navigate = useNavigate()
  const user = getStaffUser()

  async function signOut() {
    await logout()
    void navigate('/staff/login', { replace: true })
  }

  return (
    <header className="border-b border-border bg-ground/80 backdrop-blur-xl">
      <div className="flex items-baseline justify-between gap-4 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lead font-[680]">{title}</h1>
          {typeof count === 'number' ? (
            <span className="tnum rounded-full bg-accent-wash px-2.5 py-0.5 text-[0.75rem] font-semibold text-accent">
              {count}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {canUseAdmin(user?.role) ? (
            <>
              <Link
                to="/dashboard"
                className="pressable rounded-lg px-3 py-1.5 text-meta font-medium text-ink-soft hover:bg-surface hover:text-ink transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/admin"
                className="pressable rounded-lg px-3 py-1.5 text-meta font-medium text-accent hover:bg-accent-wash transition-colors"
              >
                Admin
              </Link>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            className="pressable rounded-lg px-3 py-1.5 text-meta text-ink-soft hover:bg-surface transition-colors"
          >
            {user?.name ? `${user.name} · Sign out` : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  )
}
