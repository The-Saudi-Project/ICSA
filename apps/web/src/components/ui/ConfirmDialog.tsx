import { useEffect, useRef, useState } from 'react'
import { Card } from './Card.js'
import { Button } from './Button.js'
import { Input } from './Input.js'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  requiredSlug?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  requiredSlug,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [slug, setSlug] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSlug('')
      if (requiredSlug) {
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
  }, [isOpen, requiredSlug])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const isConfirmDisabled = requiredSlug ? slug !== requiredSlug : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-ground/80 backdrop-blur-sm animate-fade-in" 
        onClick={onCancel}
        aria-hidden="true"
      />
      
      {/* Modal Dialog */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative z-10 w-full max-w-sm animate-slide-up"
      >
        <Card variant="glass" className="p-6 border-border-strong shadow-2xl">
          <h2 id="confirm-dialog-title" className="text-h3 font-black text-ink mb-2">
            {title}
          </h2>
          <p id="confirm-dialog-description" className="text-body text-ink-soft mb-6">
            {message}
          </p>

          {requiredSlug && (
            <div className="mb-6">
              <label htmlFor="confirm-slug" className="block text-meta font-bold uppercase tracking-[0.12em] text-ink-soft mb-2">
                Type <span className="font-mono text-ink bg-surface-strong px-1 py-0.5 rounded border border-border">{requiredSlug}</span> to confirm
              </label>
              <Input
                id="confirm-slug"
                ref={inputRef}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={requiredSlug}
                className="font-mono"
              />
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <Button variant="ghost" onClick={onCancel} className="flex-1">
              {cancelText}
            </Button>
            <Button
              variant="primary"
              onClick={onConfirm}
              disabled={isConfirmDisabled}
              className={`flex-1 ${
                destructive 
                  ? 'bg-status-danger hover:bg-status-danger/90 border-transparent shadow-sm' 
                  : ''
              }`}
            >
              {confirmText}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
