import { useEffect, useState } from 'react'

export function usePullToRefresh(onRefresh: () => Promise<void>, distance = 80) {
  const [refreshing, setRefreshing] = useState(false)
  const [pullProgress, setPullProgress] = useState(0) // 0 to 1

  useEffect(() => {
    let startY = 0
    let currentY = 0
    let isPulling = false

    const handleTouchStart = (e: TouchEvent) => {
      // Only start pull-to-refresh if we are at the very top of the page
      if (window.scrollY > 0) return
      startY = e.touches[0]?.clientY ?? 0
      isPulling = true
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || refreshing) return
      currentY = e.touches[0]?.clientY ?? 0
      const deltaY = currentY - startY
      
      // Only consider pulling down
      if (deltaY > 0) {
        // Prevent default scrolling when we are pulling down at the top
        // e.preventDefault() // Not allowed on passive listeners, but we can manage visual state
        
        // Add resistance
        const pull = Math.min(deltaY * 0.4, distance * 1.5)
        setPullProgress(Math.min(pull / distance, 1.2))
      }
    }

    const handleTouchEnd = async () => {
      if (!isPulling) return
      isPulling = false
      
      if (pullProgress >= 1 && !refreshing) {
        setRefreshing(true)
        setPullProgress(1)
        try {
          await onRefresh()
        } finally {
          setRefreshing(false)
          setPullProgress(0)
        }
      } else {
        setPullProgress(0)
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onRefresh, refreshing, pullProgress, distance])

  return { refreshing, pullProgress }
}
