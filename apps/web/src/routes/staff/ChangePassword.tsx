/**
 * `/staff/password` — forced password change.
 * Glass card form on dark gradient background.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { getStaffUser, staffApi, StaffApiError, logout } from '../../lib/staffApi.js'

const MIN_LENGTH = 12

export default function ChangePassword() {
  const navigate = useNavigate()
  const user = getStaffUser()
  const forced = user?.mustChangePassword ?? false

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const ready = current.length > 0 && next.length >= MIN_LENGTH && confirm === next

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)

    try {
      await staffApi('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })

      await logout()
      void navigate('/staff/login', { replace: true })
    } catch (err) {
      setError(
        err instanceof StaffApiError ? err.message : 'Could not change the password. Try again.',
      )
      setBusy(false)
    }
  }

  return (
    <main className="bg-mesh flex min-h-dvh items-center justify-center px-6">
      <div className="glass-strong mx-auto w-full max-w-sm px-8 py-10 animate-slide-up">
        {/* Lock icon */}
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 className="text-center text-title text-balance">
          {forced ? 'Choose your password' : 'Change your password'}
        </h1>

        {forced ? (
          <p className="mt-2 text-center text-body text-ink-soft">
            You are signed in with a temporary password. Pick your own before you carry on.
          </p>
        ) : null}

        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-meta font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {forced ? 'Temporary password' : 'Current password'}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input-glass mt-2"
            />
          </label>

          <label className="block">
            <span className="text-meta font-semibold uppercase tracking-[0.14em] text-ink-soft">
              New password
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input-glass mt-2"
            />
            <span className={`mt-2 block text-meta ${tooShort ? 'text-status-warning' : 'text-ink-faint'}`}>
              At least {MIN_LENGTH} characters. A few ordinary words is stronger than one short word
              with symbols in it.
            </span>
          </label>

          <label className="block">
            <span className="text-meta font-semibold uppercase tracking-[0.14em] text-ink-soft">
              New password again
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input-glass mt-2"
            />
            {mismatch ? (
              <span className="mt-2 block text-meta text-status-warning">These do not match.</span>
            ) : null}
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-status-danger-wash px-4 py-3 text-body ring-1 ring-status-danger/20">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!ready || busy}
            className="btn-gradient mt-4 w-full px-5 py-3.5 text-body disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save and sign in again'}
          </button>

          <p className="mt-4 text-center text-meta text-ink-faint">
            You will be signed out everywhere and asked to sign in with the new password.
          </p>
        </form>
      </div>
    </main>
  )
}
