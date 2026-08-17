import { useRef, useCallback } from 'react'

export function useLongPress(
  onTick: () => void,
  { delay = 500, interval = 100 }: { delay?: number; interval?: number } = {}
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  const start = useCallback(() => {
    // Only register long-press logic, short clicks are handled by onClick normally.
    // Wait for `delay` ms, then start firing `onTick` every `interval` ms.
    timeoutRef.current = setTimeout(() => {
      onTick()
      intervalRef.current = setInterval(() => {
        onTick()
      }, interval)
    }, delay)
  }, [onTick, delay, interval])

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    timeoutRef.current = null
    intervalRef.current = null
  }, [])

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault() // Prevent right-click menu popping up
  }
}
