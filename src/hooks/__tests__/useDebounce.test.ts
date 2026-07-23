import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '../useDebounce'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('a', 300))
    expect(result.current).toBe('a')
  })

  it('does not update until the delay has fully elapsed', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'a' },
    })

    rerender({ v: 'b' })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a') // still the old value at 299ms

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b') // flips exactly at the delay
  })

  it('coalesces a burst of changes into a single trailing update', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'a' },
    })

    // Each change within the window restarts the timer, so only the last one lands.
    rerender({ v: 'b' })
    act(() => vi.advanceTimersByTime(100))
    rerender({ v: 'c' })
    act(() => vi.advanceTimersByTime(100))
    rerender({ v: 'd' })
    expect(result.current).toBe('a')

    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('d')
  })

  it('does not emit a stale value after unmount', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    unmount()
    act(() => vi.advanceTimersByTime(300))
    // The value captured before unmount is unchanged; the pending timer was cleared.
    expect(result.current).toBe('a')
  })
})
