import { type HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'solid' | 'subtle'
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'glass', children, ...props }, ref) => {
    
    let variantClass = ''
    switch (variant) {
      case 'glass':
        variantClass = 'card-glass'
        break
      case 'solid':
        variantClass = 'bg-surface border border-border rounded-2xl shadow-sm'
        break
      case 'subtle':
        variantClass = 'bg-ground-sunken rounded-2xl'
        break
    }

    return (
      <div
        ref={ref}
        className={`${variantClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'
