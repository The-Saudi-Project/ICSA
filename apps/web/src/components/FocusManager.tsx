import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/**
 * FocusManager manages focus across route changes.
 * When the route changes, it automatically focuses on the main content area (#main)
 * so screen reader users are notified of the page change and don't have to navigate
 * all the way back down from the top of the document.
 */
export function FocusManager() {
  const location = useLocation()
  const prevLocation = useRef(location.pathname)

  useEffect(() => {
    if (location.pathname !== prevLocation.current) {
      prevLocation.current = location.pathname
      const main = document.getElementById('main')
      if (main) {
        // Elements without a native tabIndex need tabIndex="-1" to receive focus via JS
        if (!main.hasAttribute('tabindex')) {
          main.setAttribute('tabindex', '-1')
        }
        main.focus()
      }
    }
  }, [location.pathname])

  return null
}
