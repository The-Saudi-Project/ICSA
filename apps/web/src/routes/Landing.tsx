/**
 * The homepage.
 *
 * Written for one reader: a restaurant owner in Riyadh, on a phone, who has
 * thirty seconds and has been sold to before. So the page opens with what the
 * product does rather than an adjective, proves it with a demo they can press
 * instead of a video they must watch, answers the objection ("do I have to
 * replace my POS?") before the fold ends, and ends with a form that takes a
 * minute.
 *
 * The sections live in `./home/*`; this file is the running order and the
 * chrome. Copy — both languages — is in `locales/home.ts`.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { BrandLockup } from '../components/BrandLockup.js'
import { PhoneVerificationModal } from '../components/PhoneVerificationModal.js'
import { Card } from '../components/ui/Card.js'
import { useI18n } from '../lib/i18n.js'
import { useTheme } from '../lib/theme.js'
import { brandName } from '../lib/brand.js'
import { homeCopy } from '../locales/home.js'
import { ContactForm } from './home/ContactForm.js'
import { DemoFlow } from './home/DemoFlow.js'
import { Faq } from './home/Faq.js'
import { Reveal, SectionHeading } from './home/Reveal.js'
import { Scene3D } from './home/Scene3D.js'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

export default function Landing() {
  const { locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const reduce = useReducedMotion()
  const copy = homeCopy(locale)
  const [showCustomerLogin, setShowCustomerLogin] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { href: '#how', label: copy.nav.how },
    { href: '#demo', label: copy.nav.demo },
    { href: '#features', label: copy.nav.features },
    { href: '#faq', label: copy.nav.faq },
  ]

  return (
    <div className="min-h-dvh bg-ground font-sans">
      {/* ── chrome ─────────────────────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled ? 'border-b border-border bg-ground/85 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <a href="#top" className="pressable rounded-xl">
            <BrandLockup size="lg" />
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-small font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
              className="pressable rounded-full border border-border px-3 py-1.5 text-caption font-bold text-ink-soft"
              aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              {locale === 'ar' ? 'EN' : 'ع'}
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="pressable flex size-9 items-center justify-center rounded-full border border-border text-ink-soft"
              aria-label="Toggle theme"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {theme === 'dark' ? (
                  <>
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                  </>
                ) : (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                )}
              </svg>
            </button>

            <a
              href="#contact"
              className="btn-gradient pressable ms-1 inline-flex rounded-xl px-4 py-2 text-small font-black text-white sm:hidden"
            >
              {copy.nav.contact}
            </a>

            <Link
              to="/staff/login"
              className="btn-gradient pressable ms-1 hidden rounded-xl px-4 py-2 text-small font-black text-white sm:inline-flex"
            >
              {copy.nav.signIn}
            </Link>
          </div>
        </div>
      </header>

      {/* ── hero ───────────────────────────────────────────────────────────── */}
      <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
        <div className="home-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-8">
          <div className="text-center lg:text-start">
            <motion.span
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.5, ease: EASE_OUT }}
              className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-wash px-4 py-1.5 text-caption font-bold text-accent"
            >
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              {copy.hero.badge}
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: reduce ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.55, delay: 0.06, ease: EASE_OUT }}
              className="mt-6 text-4xl font-black leading-[1.05] tracking-tight text-ink sm:text-6xl xl:text-7xl"
            >
              {copy.hero.titleLead}{' '}
              <span className="bg-gradient-to-r from-accent to-accent-bright bg-clip-text text-transparent">
                {copy.hero.titleAccent}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: reduce ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.55, delay: 0.12, ease: EASE_OUT }}
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-soft lg:mx-0 sm:text-xl"
            >
              {copy.hero.subtitle}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.55, delay: 0.18, ease: EASE_OUT }}
              className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start justify-center"
            >
              <a
                href="#contact"
                className="btn-gradient pressable inline-flex w-full items-center justify-center rounded-2xl px-8 py-4 text-lead font-black text-white sm:w-auto"
              >
                {copy.hero.ctaPrimary}
              </a>
              <a
                href="#demo"
                className="pressable inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-8 py-4 text-lead font-bold text-ink sm:w-auto"
              >
                {copy.hero.ctaSecondary}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </a>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.28 }}
              className="mt-6 text-small text-ink-faint"
            >
              {copy.hero.reassure}
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduce ? 0.2 : 0.7, delay: 0.1, ease: EASE_OUT }}
          >
            <Scene3D copy={copy} />
          </motion.div>
        </div>
      </section>

      {/* ── you are not replacing anything ─────────────────────────────────── */}
      <section className="border-y border-border bg-ground-sunken py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <Reveal>
              <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                {copy.keep.title}
              </h2>
              <p className="mt-4 text-body leading-relaxed text-ink-soft">{copy.keep.body}</p>
            </Reveal>

            <ul className="grid grid-cols-2 gap-3">
              {copy.keep.items.map((item, index) => (
                <Reveal as="li" key={item} delay={index * 0.06}>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-wash text-accent">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span className="text-small font-bold text-ink">{item}</span>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── how it works ───────────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading
            eyebrow={copy.how.eyebrow}
            title={copy.how.title}
            subtitle={copy.how.subtitle}
          />

          <ol className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {copy.how.steps.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 0.06}>
                <Card variant="glass" className="lift h-full rounded-3xl p-7">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright text-lead font-black text-white shadow-lg">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-lead font-bold text-ink">{step.title}</h3>
                  <p className="mt-3 text-small leading-relaxed text-ink-soft">{step.body}</p>
                </Card>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── the demo ───────────────────────────────────────────────────────── */}
      <section id="demo" className="scroll-mt-24 border-y border-border bg-ground-sunken py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading
            eyebrow={copy.demo.eyebrow}
            title={copy.demo.title}
            subtitle={copy.demo.subtitle}
          />
          <div className="mt-16">
            <DemoFlow copy={copy} />
          </div>
        </div>
      </section>

      {/* ── features ───────────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading
            eyebrow={copy.features.eyebrow}
            title={copy.features.title}
            subtitle={copy.features.subtitle}
          />

          <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {copy.features.items.map((item, index) => (
              <Reveal key={item.title} delay={(index % 3) * 0.06}>
                <Card variant="glass" className="lift h-full rounded-3xl p-7">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-wash text-accent">
                    <FeatureGlyph index={index} />
                  </span>
                  <h3 className="mt-5 text-lead font-bold text-ink">{item.title}</h3>
                  <p className="mt-3 text-small leading-relaxed text-ink-soft">{item.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── surfaces ───────────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-ground-sunken py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading
            eyebrow={copy.surfaces.eyebrow}
            title={copy.surfaces.title}
            subtitle={copy.surfaces.subtitle}
          />

          <div className="mt-16 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {copy.surfaces.items.map((item, index) => (
              <Reveal key={item.name} delay={index * 0.05}>
                <div className="lift h-full rounded-2xl border border-border bg-surface p-6">
                  <span className="text-caption font-black uppercase tracking-[0.16em] text-accent">
                    0{index + 1}
                  </span>
                  <h3 className="mt-3 text-body font-black text-ink">{item.name}</h3>
                  <p className="mt-2 text-small leading-relaxed text-ink-soft">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── trust ──────────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading
            eyebrow={copy.trust.eyebrow}
            title={copy.trust.title}
            subtitle={copy.trust.subtitle}
          />

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {copy.trust.items.map((item, index) => (
              <Reveal key={item.title} delay={(index % 2) * 0.06}>
                <div className="flex h-full gap-5 rounded-3xl border border-border bg-surface p-7">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3 4 6.5v5c0 4.7 3.2 8.9 8 9.5 4.8-.6 8-4.8 8-9.5v-5L12 3z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-lead font-bold text-ink">{item.title}</h3>
                    <p className="mt-2 text-small leading-relaxed text-ink-soft">{item.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── questions ──────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-24 border-y border-border bg-ground-sunken py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} />
          <Faq copy={copy} />
        </div>
      </section>

      {/* ── contact ────────────────────────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <SectionHeading
            eyebrow={copy.contact.eyebrow}
            title={copy.contact.title}
            subtitle={copy.contact.subtitle}
          />
          <div className="mt-12">
            <ContactForm copy={copy} />
          </div>
        </div>
      </section>

      {/* ── footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-ground-sunken py-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <BrandLockup size="md" />
            <p className="mt-3 max-w-sm text-small text-ink-soft">{copy.footer.tagline}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={() => setShowCustomerLogin(true)}
              className="text-small font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
            >
              {copy.footer.myOrders}
            </button>
            <Link
              to="/staff/login"
              className="text-small font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
            >
              {copy.footer.staff}
            </Link>
            <span className="text-small text-ink-faint">
              © {new Date().getFullYear()} {brandName(locale)}. {copy.footer.rights}
            </span>
          </div>
        </div>
      </footer>

      <PhoneVerificationModal
        isOpen={showCustomerLogin}
        onClose={() => setShowCustomerLogin(false)}
        onVerified={() => {
          setShowCustomerLogin(false)
          window.location.href = '/my-orders'
        }}
      />
    </div>
  )
}

/** Six glyphs, one per feature. Inline so the page ships no icon dependency. */
function FeatureGlyph({ index }: { index: number }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (index) {
    case 0:
      return (
        <svg {...common}>
          <path d="M6 8.5a7 7 0 0 1 0 7" />
          <path d="M10 5.5a12 12 0 0 1 0 13" />
          <path d="M14 3a17 17 0 0 1 0 18" />
        </svg>
      )
    case 1:
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )
    case 2:
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 3:
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      )
    case 4:
      return (
        <svg {...common}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
        </svg>
      )
  }
}
