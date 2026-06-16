import { useEffect, useMemo, useRef } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// useDebouncedCallback — trailing-debounced wrapper with unmount cleanup
// ───────────────────────────────────────────────────────────────────────────
// Used to coalesce bursts of realtime row events into a single query invalidation,
// so a vote sweep / batch enroll / reorg tombstone wave triggers ONE refetch instead
// of N. The returned function is stable; it always calls the latest `fn`.
// ═══════════════════════════════════════════════════════════════════════════

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 300,
): (...args: A) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const debounced = useMemo(
    () =>
      (...args: A) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => fnRef.current(...args), delayMs)
      },
    [delayMs],
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  return debounced
}
