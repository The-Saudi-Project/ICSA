import { useState, useRef, useEffect } from 'react'

export function SwipeableItem({ 
  children, 
  onSwipeComplete, 
  threshold = 0.5 
}: { 
  children: React.ReactNode, 
  onSwipeComplete: () => void,
  threshold?: number 
}) {
  const [offsetX, setOffsetX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0]?.clientX ?? 0
      currentX.current = e.touches[0]?.clientX ?? 0
      setIsSwiping(true)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping) return
      currentX.current = e.touches[0]?.clientX ?? 0
      const diff = currentX.current - startX.current
      // Only allow swiping left
      if (diff < 0) {
        // e.preventDefault() // Cannot prevent default on passive listener, but okay for X axis
        setOffsetX(Math.max(diff, -window.innerWidth))
      }
    }

    const handleTouchEnd = () => {
      if (!isSwiping) return
      setIsSwiping(false)
      
      const width = el.offsetWidth
      const dragRatio = Math.abs(offsetX) / width
      
      if (dragRatio > threshold) {
        // Swipe completed
        setOffsetX(-width)
        setTimeout(() => {
          onSwipeComplete()
        }, 200)
      } else {
        // Snap back
        setOffsetX(0)
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isSwiping, offsetX, onSwipeComplete, threshold])

  return (
    <div className="relative overflow-hidden rounded-2xl w-full" ref={containerRef}>
      {/* Background Actions (Delete) */}
      <div className="absolute inset-0 bg-status-danger text-white flex items-center justify-end px-6">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </div>

      {/* Swipeable Content */}
      <div 
        className="relative z-10 w-full bg-ground"
        style={{ 
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' 
        }}
      >
        {children}
      </div>
    </div>
  )
}
