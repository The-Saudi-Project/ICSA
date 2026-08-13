import { type InputHTMLAttributes, forwardRef } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label ? (
          <label className="block text-meta font-semibold uppercase tracking-[0.12em] text-ink-soft mb-1.5">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          className={`input-glass ${error ? 'border-status-danger focus:border-status-danger focus:ring-status-danger-wash' : ''} ${className}`}
          {...props}
        />
        {error ? (
          <p className="mt-1.5 text-small text-status-danger animate-fade-in">{error}</p>
        ) : null}
      </div>
    )
  }
)
Input.displayName = 'Input'
