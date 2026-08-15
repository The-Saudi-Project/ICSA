/**
 * The decorative band and the order state progress bar.
 *
 * Redesigned as sleek gradient lines for the dark glassmorphism theme.
 * The state band uses an animated glowing progress bar with stage dots.
 */

import { OrderStatus } from '@rw/shared/orderState'
import type { CSSProperties } from 'react'

type Scale = 'fine' | 'default' | 'wall'

const scaleClass: Record<Scale, string> = {
  fine: 'openwork openwork--fine',
  default: 'openwork',
  wall: 'openwork openwork--wall',
}

export function OpenworkBand({
  scale = 'default',
  className = '',
  style,
}: {
  scale?: Scale
  className?: string
  style?: CSSProperties
}) {
  return <div aria-hidden="true" className={`${scaleClass[scale]} ${className}`} style={style} />
}

/**
 * The state progress bar.
 *
 * A glowing gradient bar with labeled stage dots. Light advances as
 * the order progresses through its lifecycle.
 */

interface Stage {
  label: string
  reach: number
}

const STAGES: Stage[] = [
  { label: 'Ordered', reach: 25 },
  { label: 'Confirmed', reach: 50 },
  { label: 'Being made', reach: 75 },
  { label: 'Ready', reach: 100 },
]

function stageFor(status: string): number {
  switch (status) {
    case OrderStatus.PLACED:
    case OrderStatus.CASH_PENDING:
      return 0
    case OrderStatus.CONFIRMED:
    case OrderStatus.KITCHEN_ACCEPTED:
      return 1
    case OrderStatus.PREPARING:
      return 2
    case OrderStatus.READY:
    case OrderStatus.COMPLETED:
      return 3
    default:
      return 0
  }
}

const TERMINAL_UNHAPPY = new Set<string>([
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.EXPIRED,
])

export function StateBand({ status }: { status: string }) {
  const stopped = TERMINAL_UNHAPPY.has(status)
  const current = stageFor(status)
  const reach = stopped ? 0 : STAGES[current]!.reach

  const gradientColor =
    status === OrderStatus.READY || status === OrderStatus.COMPLETED
      ? 'var(--color-status-success)'
      : status === OrderStatus.PREPARING || status === OrderStatus.KITCHEN_ACCEPTED
        ? 'var(--color-status-warning)'
        : 'var(--color-accent)'

  return (
    <div>
      {/* Progress bar */}
      <div className="relative h-1.5 rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-600"
          style={{
            width: `${reach}%`,
            background: `linear-gradient(90deg, ${gradientColor}, ${gradientColor}aa)`,
            boxShadow: `0 0 16px ${gradientColor}40`,
            transition: 'width 600ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={STAGES.length}
          aria-valuenow={stopped ? 0 : current + 1}
          aria-valuetext={stopped ? 'Stopped' : STAGES[current]!.label}
        />
      </div>

      {/* Stage dots and labels */}
      <div className="relative mt-4 flex justify-between">
        {STAGES.map((stage, index) => {
          const done = !stopped && index <= current
          const isActive = !stopped && index === current
          return (
            <div key={stage.label} className="flex flex-col items-center gap-2" style={{ width: '25%' }}>
              <div
                className={[
                  'size-3 rounded-full transition-all duration-300',
                  done
                    ? 'scale-110'
                    : 'bg-[rgba(255,255,255,0.1)]',
                ].join(' ')}
                style={done ? {
                  background: gradientColor,
                  boxShadow: isActive ? `0 0 12px ${gradientColor}60` : `0 0 6px ${gradientColor}30`,
                } : undefined}
              />
              <span
                className={[
                  'text-[0.7rem] font-medium tracking-wide',
                  index === 0 ? 'text-start' : index === STAGES.length - 1 ? 'text-end' : 'text-center',
                  done ? 'text-ink' : 'text-ink-faint',
                ].join(' ')}
              >
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
