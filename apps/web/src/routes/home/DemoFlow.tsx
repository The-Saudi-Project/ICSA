/**
 * The interactive demo: one button, and the whole product happens.
 *
 * This is the section that has to do the selling, so it shows the real sequence
 * — tap, order, kitchen, ready — at the speed it actually runs, on both sides at
 * once. The guest's phone is on one side, the staff screens on the other, and
 * the ticket appears on the right at the same instant the phone says "placed",
 * because that simultaneity *is* the product.
 *
 * Nothing here talks to the API. It is a scripted sequence with the same shapes
 * and words the live screens use — honest about being a simulation, and it
 * cannot break in front of a prospect because a server was cold.
 *
 * Motion notes:
 *  - Screen swaps use `AnimatePresence mode="wait"` at 180ms: fast enough to
 *    feel like software, slow enough to read as a transition.
 *  - Entrances start at `scale(0.96)`, never `scale(0)` — things that appear
 *    out of nothing look like a rendering bug rather than an arrival.
 *  - Under `prefers-reduced-motion` the sequence still runs, it just cuts
 *    between states instead of moving. The information is the point; the
 *    movement is the flourish.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '../../components/ui/Card.js'
import type { HomeCopy } from '../../locales/home.js'

/** The script. Each entry is the delay from pressing the button, in ms. */
const TIMELINE = [
  { step: 1, at: 0 },
  { step: 2, at: 950 },
  { step: 3, at: 2050 },
  { step: 4, at: 3250 },
  { step: 5, at: 4650 },
] as const

type Step = 0 | 1 | 2 | 3 | 4 | 5

const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function DemoFlow({ copy }: { copy: HomeCopy }) {
  const reduce = useReducedMotion()
  const [step, setStep] = useState<Step>(0)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const run = useCallback(() => {
    clearTimers()
    setStep(0)
    for (const entry of TIMELINE) {
      timers.current.push(
        window.setTimeout(() => setStep(entry.step as Step), entry.at + 60),
      )
    }
  }, [clearTimers])

  const running = step > 0 && step < 5
  /** 0 → 1 across the four labelled stages. */
  const progress = step === 0 ? 0 : Math.min(step, 4) / 4

  const duration = reduce ? 0 : 0.18

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-12 items-start">
      {/* ── the guest's phone ────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-[300px]">
        <div className="demo-phone">
          <div className="demo-phone-screen">
            <AnimatePresence mode="wait" initial={false}>
              {step === 0 ? (
                <motion.div
                  key="idle"
                  className="flex h-full flex-col items-center justify-center text-center"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration, ease: EASE_OUT }}
                >
                  <span className="demo-nfc" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 8.5a7 7 0 0 1 0 7" />
                      <path d="M10 5.5a12 12 0 0 1 0 13" />
                      <path d="M14 3a17 17 0 0 1 0 18" />
                    </svg>
                  </span>
                  <p className="mt-4 text-body font-black text-white">{copy.demo.phoneIdle}</p>
                  <p className="mt-1 text-caption text-white/50">{copy.demo.phoneIdleHint}</p>
                </motion.div>
              ) : null}

              {step === 1 || step === 2 ? (
                <motion.div
                  key="menu"
                  className="flex h-full flex-col"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration, ease: EASE_OUT }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-small font-black text-white">{copy.demo.menuTitle}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                      {copy.demo.menuHint}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {copy.demo.items.map((item, index) => (
                      <motion.div
                        key={item.name}
                        className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : index * 0.06, ease: EASE_OUT }}
                      >
                        <span className="size-8 shrink-0 rounded-lg bg-gradient-to-br from-white/25 to-white/5" />
                        <span className="flex-1 truncate text-caption font-semibold text-white">
                          {item.name}
                        </span>
                        <span className="tnum text-caption font-bold text-white/70">{item.price}</span>
                      </motion.div>
                    ))}
                  </div>

                  <AnimatePresence>
                    {step === 2 ? (
                      <motion.div
                        className="mt-auto flex items-center justify-between rounded-xl bg-gradient-to-r from-accent to-accent-bright px-3 py-2.5 text-white shadow-lg"
                        initial={{ opacity: 0, y: reduce ? 0 : 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
                      >
                        <span className="text-caption font-black">{copy.demo.cartTitle}</span>
                        <span className="tnum text-caption font-black">1 × 58.00</span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ) : null}

              {step === 3 ? (
                <motion.div
                  key="placing"
                  className="flex h-full flex-col items-center justify-center text-center"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration, ease: EASE_OUT }}
                >
                  <span className="demo-tick" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <p className="mt-4 text-body font-black text-white">{copy.demo.placedTitle}</p>
                  <p className="mt-1 text-caption text-white/50">{copy.demo.placedBody}</p>
                </motion.div>
              ) : null}

              {step === 4 || step === 5 ? (
                <motion.div
                  key="status"
                  className="flex h-full flex-col items-center justify-center text-center"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration, ease: EASE_OUT }}
                >
                  <div className="demo-status-ring" data-ready={step === 5} aria-hidden="true" />
                  <p className="mt-5 text-body font-black text-white">
                    {step === 5 ? copy.demo.readyTitle : copy.demo.kitchenStatuses[1]}
                  </p>
                  <p className="mt-1 px-4 text-caption leading-relaxed text-white/50">
                    {step === 5 ? copy.demo.readyBody : copy.demo.placedBody}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── the staff side, and the control ──────────────────────────────── */}
      <div className="flex flex-col gap-5">
        {/* Progress rail */}
        <div>
          <div className="flex justify-between">
            {copy.demo.stepLabels.map((label, index) => (
              <span
                key={label}
                className={`text-caption font-bold transition-colors duration-200 ${
                  step > index ? 'text-accent' : 'text-ink-faint'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-strong">
            <motion.div
              className="progress-fill h-full rounded-full bg-gradient-to-r from-accent to-accent-bright"
              initial={false}
              animate={{ transform: `scaleX(${progress})` }}
              transition={{ duration: reduce ? 0 : 0.4, ease: EASE_OUT }}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Kitchen screen */}
        <Card variant="glass" className="surface-kiln p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-caption font-black uppercase tracking-[0.16em] text-ink-soft">
              {copy.demo.kitchenTitle}
            </span>
            <span className="flex items-center gap-1.5 text-caption text-ink-faint">
              <span className={`size-1.5 rounded-full ${running ? 'bg-status-success' : 'bg-ink-faint'}`} />
              live
            </span>
          </div>

          <div className="mt-4 min-h-[104px]">
            <AnimatePresence initial={false}>
              {step >= 3 ? (
                <motion.div
                  key="ticket"
                  className="rounded-xl border border-border bg-surface p-4"
                  initial={{ opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: reduce ? 0 : 0.34, ease: EASE_OUT }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-body font-black text-ink">{copy.demo.kitchenTicket}</span>
                    <StatusPill
                      label={
                        step >= 5
                          ? copy.demo.kitchenStatuses[2]!
                          : step === 4
                            ? copy.demo.kitchenStatuses[1]!
                            : copy.demo.kitchenStatuses[0]!
                      }
                      tone={step >= 5 ? 'success' : step === 4 ? 'warning' : 'info'}
                      reduce={Boolean(reduce)}
                    />
                  </div>
                  <ul className="mt-3 space-y-1">
                    <li className="flex items-center gap-2 text-small text-ink-soft">
                      <span className="flex size-5 items-center justify-center rounded bg-surface-strong text-caption font-black text-ink">
                        1
                      </span>
                      {copy.demo.items[0]?.name}
                    </li>
                  </ul>
                </motion.div>
              ) : (
                <motion.p
                  key="empty"
                  className="flex h-[104px] items-center justify-center text-small text-ink-faint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration }}
                >
                  —
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </Card>

        {/* Waiter alert */}
        <AnimatePresence>
          {step >= 5 ? (
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.34, ease: EASE_OUT }}
              className="flex items-center gap-3 rounded-2xl border border-status-success/40 bg-status-success-wash px-4 py-3"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-success text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <div>
                <p className="text-small font-black text-ink">{copy.demo.readyTitle}</p>
                <p className="text-caption text-ink-soft">{copy.demo.kitchenTicket}</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <button
          type="button"
          onClick={run}
          className="btn-gradient pressable inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-lead font-black text-white sm:w-auto sm:self-start"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8.5a7 7 0 0 1 0 7" />
            <path d="M10 5.5a12 12 0 0 1 0 13" />
            <path d="M14 3a17 17 0 0 1 0 18" />
          </svg>
          {step === 0 ? copy.demo.tap : copy.demo.replay}
        </button>
      </div>
    </div>
  )
}

/**
 * The status chip. The colour crossfade is masked with a 2px blur: without it
 * you see the old label and the new one overlapping as two separate words,
 * which reads as a glitch. Blur bridges them into one change.
 */
function StatusPill({
  label,
  tone,
  reduce,
}: {
  label: string
  tone: 'info' | 'warning' | 'success'
  reduce: boolean
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-status-success-wash text-status-success border-status-success/40'
      : tone === 'warning'
        ? 'bg-status-warning-wash text-status-warning border-status-warning/40'
        : 'bg-status-info-wash text-status-info border-status-info/40'

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={label}
        className={`rounded-full border px-2.5 py-1 text-caption font-black ${toneClass}`}
        initial={{ opacity: 0, filter: reduce ? 'blur(0px)' : 'blur(2px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, filter: reduce ? 'blur(0px)' : 'blur(2px)' }}
        transition={{ duration: reduce ? 0 : 0.16 }}
      >
        {label}
      </motion.span>
    </AnimatePresence>
  )
}
