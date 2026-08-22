/**
 * The questions section.
 *
 * One open at a time, because a page where every panel can be open at once
 * turns into a wall the moment someone is curious. The height animation is
 * 220ms `ease-out`: fast enough that the answer feels like it was already
 * there, slow enough that the reader's eye follows the text down rather than
 * losing its place.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useId, useState } from 'react'
import type { HomeCopy } from '../../locales/home.js'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function Faq({ copy }: { copy: HomeCopy }) {
  const [open, setOpen] = useState<number | null>(0)
  const reduce = useReducedMotion()
  const baseId = useId()

  return (
    <ul className="mx-auto mt-12 max-w-3xl divide-y divide-border border-y border-border">
      {copy.faq.items.map((item, index) => {
        const isOpen = open === index
        const panelId = `${baseId}-panel-${index}`
        const buttonId = `${baseId}-button-${index}`

        return (
          <li key={item.q}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-6 py-5 text-start"
              >
                <span className="text-lead font-bold text-ink">{item.q}</span>
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-ink-soft transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  aria-hidden="true"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <p className="pb-6 pe-14 text-body leading-relaxed text-ink-soft">{item.a}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        )
      })}
    </ul>
  )
}
