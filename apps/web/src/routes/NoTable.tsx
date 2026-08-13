/**
 * Reached when someone opens the app without a table session.
 * Glass card on dark mesh background with NFC illustration.
 */

export default function NoTable() {
  return (
    <main className="bg-mesh flex min-h-dvh items-center justify-center px-6">
      <div className="glass-strong mx-auto max-w-sm px-8 py-10 text-center animate-slide-up">
        {/* NFC tap icon */}
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-accent-wash">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
            <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
            <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
            <path d="M16.37 2a20.4 20.4 0 0 1 0 20" />
          </svg>
        </div>
        <h1 className="text-title text-balance">Tap the tag on your table</h1>
        <p className="mt-3 text-body text-ink-soft">
          Hold your phone against the card on the table, or scan the QR code printed on it. The menu
          opens by itself.
        </p>
        <p className="mt-6 text-meta text-ink-faint">
          Older phones without NFC can use the QR code.
        </p>
      </div>
    </main>
  )
}
