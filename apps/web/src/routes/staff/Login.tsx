/**
 * Staff sign-in — glass card on animated dark gradient background.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { homeForRole } from '../../lib/roles.js'
import { login, StaffApiError } from '../../lib/staffApi.js'
import { BrandLockup } from '../../components/BrandLockup.js'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      const user = await login(email, password)
      void navigate(homeForRole(user.role), { replace: true })
    } catch (err) {
      setError(
        err instanceof StaffApiError ? err.message : 'Could not sign in. Check the connection.',
      )
      setBusy(false)
    }
  }

  return (
    <main className="bg-mesh flex min-h-dvh items-center justify-center px-6">
      <div className="glass-strong mx-auto w-full max-w-sm px-8 py-10 animate-slide-up">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <BrandLockup size="lg" className="mb-6 justify-center" />
          <h1 className="text-title">Staff Sign In</h1>
          <p className="mt-1 text-meta text-ink-soft">Enter your credentials to continue</p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <label className="block">
            <span className="text-meta font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-glass mt-2"
            />
          </label>

          <label className="block">
            <span className="text-meta font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-glass mt-2"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-status-danger-wash px-4 py-3 text-body ring-1 ring-status-danger/20">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="btn-gradient w-full px-5 py-3.5 text-body"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
