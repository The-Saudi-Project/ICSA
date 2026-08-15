import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    
    let variantClass = ''
    switch (variant) {
      case 'primary':
        variantClass = 'btn-gradient text-white'
        break
      case 'secondary':
        variantClass = 'bg-surface border border-border text-ink hover:bg-surface-hover hover:border-border-strong pressable shadow-sm'
        break
      case 'ghost':
        variantClass = 'bg-transparent text-ink-soft hover:text-ink hover:bg-surface pressable'
        break
      case 'danger':
        variantClass = 'bg-status-danger text-white hover:bg-red-700 pressable shadow-sm'
        break
    }

    let sizeClass = ''
    switch (size) {
      case 'sm':
        sizeClass = 'px-3 py-1.5 text-small rounded-lg'
        break
      case 'md':
        sizeClass = 'px-5 py-2.5 text-body rounded-xl'
        break
      case 'lg':
        sizeClass = 'px-6 py-3 text-lead rounded-2xl'
        break
    }

    const disabledClass = disabled || isLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center font-semibold transition-all ${variantClass} ${sizeClass} ${disabledClass} ${className}`}
        disabled={disabled || isLoading}
        // The spinner is the only cue that anything is happening, and it is
        // purely visual. `aria-busy` is what tells a screen reader the same.
        aria-busy={isLoading ? true : undefined}
        {...props}
      >
        {isLoading ? (
          <svg aria-hidden="true" className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
