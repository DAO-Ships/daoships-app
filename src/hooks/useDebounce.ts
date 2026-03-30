import { useState, useEffect } from 'react'

/**
 * Debounces a value by the specified delay in milliseconds.
 * Returns the debounced value which only updates after the delay
 * has elapsed without a new value being set.
 *
 * Useful for search inputs to avoid excessive API calls on every keystroke.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
