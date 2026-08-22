/**
 * Scroll reveal, used by every section on the homepage.
 *
 * Three decisions worth stating, because they are the difference between a page
 * that feels considered and one that feels like a template:
 *
 *  - **Once.** An element that re-animates every time it scrolls back into view
 *    turns a page into a fairground. `once: true`, always.
 *  - **Early.** The margin fires the reveal slightly *before* the element
 *    reaches the viewport, so by the time the reader's eye arrives the movement
 *    has already resolved. A reveal the reader watches happen is a reveal that
 *    delayed them.
 *  - **Short stagger.** 60ms between siblings. Long enough to read as a
 *    cascade, short enough that the last card is not still arriving after the
 *    reader has finished the first.
 *
 * Reduced motion keeps the fade and drops the movement — not nothing, which
 * would leave the page feeling broken, and not less, which would leave the
 * people who asked for calm with the same page as everyone else.
 */

import { motion, useReducedMotion, type MotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

/** Marketing pace: slower than the product's UI, which stays under 300ms. */
const DURATION = 0.5
const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function Reveal({
  children,
  delay = 0,
  y = 18,
  className = '',
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'span'
}) {
  const reduce = useReducedMotion()
  const Component = motion[as] as React.ComponentType<MotionProps & { className?: string }>

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: reduce ? 0.25 : DURATION, delay, ease: EASE_OUT }}
    >
      {children}
    </Component>
  )
}

/** A section heading block: eyebrow, title, and an optional line underneath. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow: string
  title: string
  subtitle?: string
  align?: 'center' | 'start'
}) {
  const alignment = align === 'center' ? 'text-center mx-auto' : 'text-start'

  return (
    <div className={`max-w-2xl ${alignment}`}>
      <Reveal>
        <span className="inline-flex items-center gap-2 text-caption font-bold uppercase tracking-[0.18em] text-accent">
          <span className="inline-block h-px w-6 bg-accent/60" aria-hidden="true" />
          {eyebrow}
        </span>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="mt-4 text-3xl md:text-5xl font-black tracking-tight text-ink leading-[1.1]">
          {title}
        </h2>
      </Reveal>
      {subtitle ? (
        <Reveal delay={0.12}>
          <p className="mt-4 text-lg text-ink-soft leading-relaxed">{subtitle}</p>
        </Reveal>
      ) : null}
    </div>
  )
}
