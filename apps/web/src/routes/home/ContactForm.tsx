/**
 * The contact form.
 *
 * It posts to `POST /api/v1/leads`, which stores the enquiry in our own
 * database and is readable only by a platform admin. The form carries no
 * credential of any kind — that is the whole reason `leadApi.ts` is a separate
 * client module from the customer and staff ones.
 *
 * Details worth keeping:
 *  - **The honeypot is invisible to people, not to bots.** It is off-screen
 *    rather than `display: none` (which some bots skip), `tabIndex={-1}` so a
 *    keyboard never lands in it, and `aria-hidden` so a screen reader never
 *    reads it out. Anything in it is a script, and the server answers such a
 *    submission normally so whoever wrote it learns nothing.
 *  - **Success replaces the form.** Leaving a filled form behind a banner
 *    invites a second submission of the same message.
 *  - **The rate-limited case has its own words.** "Try again later" is not the
 *    same message as "check the fields", and telling someone the wrong one
 *    makes them edit a form that was already correct.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { LeadSubmitError, submitLead, type LeadError } from '../../lib/leadApi.js'
import { useI18n } from '../../lib/i18n.js'
import type { HomeCopy } from '../../locales/home.js'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

type State = 'idle' | 'sending' | 'sent'

export function ContactForm({ copy }: { copy: HomeCopy }) {
  const { locale } = useI18n()
  const reduce = useReducedMotion()
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<LeadError | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state === 'sending') return

    const form = new FormData(event.currentTarget)
    const text = (key: string) => String(form.get(key) ?? '').trim()
    const branches = text('branches')

    setState('sending')
    setError(null)

    try {
      await submitLead({
        restaurantName: text('restaurantName'),
        contactName: text('contactName'),
        phone: text('phone'),
        email: text('email') || undefined,
        city: text('city') || undefined,
        branches: branches ? Number(branches) : undefined,
        message: text('message') || undefined,
        locale: locale === 'ar' ? 'ar' : 'en',
        website: text('website') || undefined,
      })
      setState('sent')
    } catch (err) {
      setError(err instanceof LeadSubmitError ? err.kind : 'invalid')
      setState('idle')
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state === 'sent' ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
          className="card-glass flex flex-col items-center rounded-3xl p-10 text-center"
          role="status"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-bright text-white shadow-lg">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h3 className="mt-5 text-h2 font-black text-ink">{copy.contact.successTitle}</h3>
          <p className="mt-2 max-w-sm text-body text-ink-soft">{copy.contact.successBody}</p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={(e) => void onSubmit(e)}
          initial={false}
          className="card-glass rounded-3xl p-6 sm:p-8"
          noValidate={false}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="restaurantName" label={copy.contact.restaurantName} required autoComplete="organization" />
            <Field name="contactName" label={copy.contact.contactName} required autoComplete="name" />
            <Field name="phone" label={copy.contact.phone} required type="tel" autoComplete="tel" inputMode="tel" />
            <Field name="email" label={copy.contact.email} hint={copy.contact.optional} type="email" autoComplete="email" />
            <Field name="city" label={copy.contact.city} hint={copy.contact.optional} autoComplete="address-level2" />
            <Field name="branches" label={copy.contact.branches} hint={copy.contact.optional} type="number" min={1} max={500} inputMode="numeric" />
          </div>

          <label className="mt-5 block">
            <span className="text-caption font-bold uppercase tracking-[0.14em] text-ink-soft">
              {copy.contact.message}
            </span>
            <textarea
              name="message"
              rows={4}
              maxLength={2000}
              placeholder={copy.contact.messagePlaceholder}
              className="input-glass mt-2 w-full resize-y rounded-xl px-4 py-3 text-body text-ink"
            />
          </label>

          {/* Honeypot — off-screen, unfocusable, unread. */}
          <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label>
              Website
              <input name="website" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.p
                initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                className="mt-5 rounded-xl border border-status-danger/40 bg-status-danger-wash px-4 py-3 text-small text-status-danger"
                role="alert"
              >
                <span className="font-black">{copy.contact.errorTitle}</span>{' '}
                {error === 'rate-limited' ? copy.contact.tooMany : copy.contact.errorBody}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-ink-faint">{copy.contact.privacy}</p>
            <button
              type="submit"
              disabled={state === 'sending'}
              className="btn-gradient pressable inline-flex items-center justify-center rounded-2xl px-7 py-3 text-body font-black text-white disabled:opacity-60"
            >
              {state === 'sending' ? copy.contact.sending : copy.contact.submit}
            </button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  )
}

function Field({
  name,
  label,
  hint,
  ...input
}: {
  name: string
  label: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2">
        <span className="text-caption font-bold uppercase tracking-[0.14em] text-ink-soft">
          {label}
        </span>
        {hint ? <span className="text-caption text-ink-faint">{hint}</span> : null}
      </span>
      <input
        name={name}
        className="input-glass mt-2 w-full rounded-xl px-4 py-3 text-body text-ink"
        {...input}
      />
    </label>
  )
}
