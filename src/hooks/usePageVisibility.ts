import { useState, useEffect } from 'react'

/**
 * Tracks whether the browser tab/window is currently visible.
 * Returns `false` when the tab is hidden or minimized.
 * Used to pause polling intervals when the user is not actively viewing the page.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return !document.hidden
  })

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handler = () => setIsVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  return isVisible
}
