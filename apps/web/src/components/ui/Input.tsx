import { type InputHTMLAttributes, forwardRef, useId } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id: propId, ...props }, ref) => {
    const generatedId = useId()
    const id = propId ?? generatedId
    const errorId = `${id}-error`

    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={id} className="block text-meta font-semibold uppercase tracking-[0.12em] text-ink-soft mb-1.5">
            {label}
          </label>
        ) : null}
        <input
          id={id}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`input-glass ${error ? 'border-status-danger focus:border-status-danger focus:ring-status-danger-wash' : ''} ${className}`}
          {...props}
        />
        {error ? (
          <p id={errorId} className="mt-1.5 text-small text-status-danger animate-fade-in">{error}</p>
        ) : null}
      </div>
    )
  }
)
Input.displayName = 'Input'
