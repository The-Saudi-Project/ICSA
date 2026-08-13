/**
 * `/t/:token` — the signature moment.
 *
 * An immersive dark entry screen with animated gradient background,
 * glowing orbs, and a smooth restaurant name reveal. Covers the
 * real network round trip of exchanging the tag token for a session.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { openTableSession } from '../lib/api.js'
import { hasPlayedEntry, markEntryPlayed, setTableToken } from '../lib/session.js'

const SWEEP_MS = 900

export default function TableEntry() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const [restaurant, setRestaurant] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const first = !hasPlayedEntry()

    async function enter() {
      try {
        setTableToken(token)
        const [session] = await Promise.all([
          openTableSession(token),
          first ? new Promise((r) => setTimeout(r, SWEEP_MS)) : Promise.resolve(),
        ])
        setRestaurant(session.restaurant.name.en)
        markEntryPlayed()
        navigate('/menu', { replace: true })
      } catch {
        setFailed(true)
      }
    }

    void enter()
  }, [token, navigate])

  if (failed) {
    return (
      <main className="bg-mesh flex min-h-dvh items-center justify-center px-6 pb-[env(safe-area-inset-bottom)]">
        <div className="glass-strong mx-auto max-w-sm px-8 py-10 text-center">
          {/* Error icon */}
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-status-danger-wash">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-title text-balance">This table code is not working</h1>
          <p className="mt-3 text-body text-ink-soft">
            Tap the tag again, or ask a member of staff. They can check the table.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      {/* Animated gradient background */}
      <div
        className="animate-gradient absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(30,174,107,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 30% 70%, rgba(212,168,67,0.06) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 80% 30%, rgba(56,189,248,0.04) 0%, transparent 60%), var(--color-ground)',
          backgroundSize: '200% 200%',
        }}
      />

      {/* Spinning glow ring */}
      <div className="relative mb-10">
        <div
          className="size-24 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent, var(--color-accent), transparent, var(--color-gold), transparent)',
            animation: 'spin-slow 3s linear infinite',
            opacity: 0.3,
          }}
        />
        <div className="absolute inset-2 rounded-full bg-ground" />
        <div
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* NFC/Tap icon */}
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-float">
            <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
            <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
            <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
            <path d="M16.37 2a20.4 20.4 0 0 1 0 20" />
          </svg>
        </div>
      </div>

      {/* Text content */}
      <div className="relative text-center">
        <p className="ow-rise ow-rise-1 text-meta font-medium uppercase tracking-[0.2em] text-accent">
          Welcome
        </p>
        <h1 className="ow-rise ow-rise-2 mt-3 text-display text-balance">
          {restaurant ?? 'Opening your table'}
        </h1>
        <p className="ow-rise ow-rise-3 mt-4 text-body text-ink-soft">
          No app, no sign-up. Just order.
        </p>
      </div>
    </main>
  )
}
