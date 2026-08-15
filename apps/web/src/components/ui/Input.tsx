import { type InputHTMLAttributes, forwardRef, useId } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

/**
 * A labelled text input.
 *
 * The `htmlFor`/`id` pair is load-bearing, not tidiness. The label used to be a
 * sibling of the input with neither an `id` nor a wrapping `<label>`, so it was
 * decoration: a screen reader announced "edit text, blank" with no name, and
 * clicking the label did not focus the field. That affected every use — the
 * kitchen note, special instructions, and the whole tenant-provisioning form.
 *
 * The error message is wired through `aria-describedby` and `aria-invalid` for
 * the same reason: red text nobody is told about is not a validation message.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`

    return (
      <div className="w-full">
        {label ? (
          <label
            htmlFor={inputId}
            className="block text-meta font-semibold uppercase tracking-[0.12em] text-ink-soft mb-1.5"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`input-glass ${error ? 'border-status-danger focus:border-status-danger focus:ring-status-danger-wash' : ''} ${className}`}
          {...props}
        />
        {error ? (
          <p id={errorId} className="mt-1.5 text-small text-status-danger animate-fade-in">
            {error}
          </p>
        ) : null}
      </div>
    )
  }
)
Input.displayName = 'Input'
