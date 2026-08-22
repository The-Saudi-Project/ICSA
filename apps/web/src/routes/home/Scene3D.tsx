/**
 * The hero scene: a table, the card on it, and a phone floating above.
 *
 * Real 3D, done with CSS rather than WebGL. `perspective` on the frame plus
 * `transform-style: preserve-3d` on the stage means every layer genuinely sits
 * at a different depth — the card lies *on* the table at 64°, the phone hovers
 * 90px above it, and the chips float higher still. Tilting the stage moves them
 * by different amounts because they are actually at different distances, which
 * is parallax you cannot fake convincingly with stacked 2D layers.
 *
 * Two details that carry the whole effect:
 *
 *  - **Springs, not raw pointer values.** Binding rotation straight to the
 *    cursor feels mechanical, because nothing in the physical world snaps to a
 *    new angle instantly. A spring gives the scene mass, so it lags a little and
 *    settles.
 *  - **A transform string, not `x`/`y`/`rotate` props.** Motion's shorthands run
 *    on the main thread; `useMotionTemplate` produces one `transform` the
 *    compositor can own, which is what keeps this smooth while the rest of the
 *    page is still loading fonts and images.
 *
 * The whole thing is decorative, so it is also the first thing to go quiet:
 * with `prefers-reduced-motion` the pointer tracking is never attached and the
 * scene simply sits at its resting angle.
 */

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { BrandMark } from '../../components/BrandLockup.js'
import type { HomeCopy } from '../../locales/home.js'

const SPRING = { stiffness: 110, damping: 18, mass: 0.6 } as const

/** Degrees of tilt at the very edge of the frame. Past ~10° the illusion breaks. */
const MAX_TILT = 7

export function Scene3D({ copy }: { copy: HomeCopy }) {
  const reduce = useReducedMotion()

  const tiltX = useSpring(useMotionValue(0), SPRING)
  const tiltY = useSpring(useMotionValue(0), SPRING)

  const stageTransform = useMotionTemplate`rotateX(${tiltX}deg) rotateY(${tiltY}deg)`

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    // Touch would pin the scene to wherever a finger last was and leave it
    // there, which reads as a glitch rather than as motion.
    if (reduce || event.pointerType !== 'mouse') return

    const bounds = event.currentTarget.getBoundingClientRect()
    const px = (event.clientX - bounds.left) / bounds.width - 0.5
    const py = (event.clientY - bounds.top) / bounds.height - 0.5

    tiltY.set(px * MAX_TILT * 2)
    tiltX.set(-py * MAX_TILT)
  }

  function onPointerLeave() {
    tiltX.set(0)
    tiltY.set(0)
  }

  return (
    <div
      className="scene-frame relative mx-auto w-full max-w-[520px] select-none"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      aria-hidden="true"
    >
      {/* Ambient light. Sits behind everything and never moves — a light source
          that tilted with the scene would give the depth away. */}
      <div className="pointer-events-none absolute inset-0 -z-10 blur-[90px] opacity-70">
        <div className="absolute left-[12%] top-[18%] size-56 rounded-full bg-accent/30" />
        <div className="absolute right-[8%] bottom-[10%] size-48 rounded-full bg-accent-bright/20" />
      </div>

      <motion.div className="scene-stage" style={{ transform: stageTransform }}>
        {/* ── the table ───────────────────────────────────────────────────── */}
        <div className="scene-table">
          <div className="scene-table-sheen" />
        </div>

        {/* ── the card lying on it ────────────────────────────────────────── */}
        <div className="scene-card">
          <div className="flex items-center justify-between">
            <BrandMark size="sm" />
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/70">
              A2
            </span>
          </div>
          <p className="mt-2 text-[11px] font-bold leading-tight text-white">
            {copy.demo.phoneIdle}
          </p>
          <div className="mt-auto flex items-end justify-between">
            <span className="text-[8px] font-medium text-white/60">{copy.demo.phoneIdleHint}</span>
            <QrGlyph />
          </div>
          {/* The NFC field, as a ring that keeps leaving the card. */}
          <span className="scene-pulse" />
          <span className="scene-pulse scene-pulse-delayed" />
        </div>

        {/* ── the phone above it ──────────────────────────────────────────── */}
        <div className="scene-phone">
          <div className="scene-phone-screen">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-white">{copy.demo.menuTitle}</span>
              <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[7px] font-bold text-white/80">
                {copy.demo.menuHint}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {copy.demo.items.slice(0, 3).map((item, index) => (
                <div
                  key={item.name}
                  className="flex items-center gap-2 rounded-lg bg-white/10 p-1.5"
                  style={{ opacity: 1 - index * 0.18 }}
                >
                  <span className="size-6 shrink-0 rounded bg-gradient-to-br from-white/25 to-white/5" />
                  <span className="flex-1 truncate text-[8px] font-semibold text-white">
                    {item.name}
                  </span>
                  <span className="tnum text-[8px] font-bold text-white/80">{item.price}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto rounded-lg bg-gradient-to-r from-accent to-accent-bright py-1.5 text-center text-[8px] font-black text-white shadow-lg">
              {copy.demo.cartTitle}
            </div>
          </div>
        </div>

        {/* ── the chips that show the order landing elsewhere ─────────────── */}
        <div className="scene-chip scene-chip-kitchen">
          <span className="size-1.5 rounded-full bg-status-warning" />
          {copy.demo.kitchenStatuses[0]} · {copy.demo.kitchenTicket}
        </div>

        <div className="scene-chip scene-chip-ready">
          <span className="size-1.5 rounded-full bg-status-success" />
          {copy.demo.kitchenStatuses[2]}
        </div>
      </motion.div>
    </div>
  )
}

function QrGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white/80">
      <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h3v3h-3v-3zm5 0h2v2h-2v-2zm-5 5h3v3h-3v-3zm5 0h2v3h-2v-3z" />
    </svg>
  )
}
