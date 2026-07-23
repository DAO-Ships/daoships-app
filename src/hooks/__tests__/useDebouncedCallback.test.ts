import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedCallback } from '../useDebouncedCallback'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedCallback', () => {
  it('fires once, on the trailing edge, after a burst of calls', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300))

    // This is the exact scenario the hook exists for: a wave of realtime row events
    // should collapse into ONE invalidation, not one per row.
    act(() => {
      result.current()
      result.current()
      result.current()
    })
    expect(fn).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(300))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes the arguments from the most recent call', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300))

    act(() => {
      result.current('first')
      result.current('last')
    })
    act(() => vi.advanceTimersByTime(300))

    expect(fn).toHaveBeenCalledWith('last')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('always calls the latest fn, even if the debounced wrapper identity is stable', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ f }) => useDebouncedCallback(f, 300), {
      initialProps: { f: first },
    })
    const wrapperBefore = result.current

    act(() => result.current())
    rerender({ f: second }) // swap the callback mid-flight
    const wrapperAfter = result.current

    act(() => vi.advanceTimersByTime(300))

    expect(wrapperAfter).toBe(wrapperBefore) // stable identity...
    expect(first).not.toHaveBeenCalled() // ...but the stale fn never fires
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('keeps a stable identity across re-renders so effects do not re-subscribe', () => {
    const { result, rerender } = renderHook(({ f }) => useDebouncedCallback(f, 300), {
      initialProps: { f: vi.fn() },
    })
    const before = result.current
    rerender({ f: vi.fn() })
    expect(result.current).toBe(before)
  })

  it('recreates the wrapper when the delay changes', () => {
    const { result, rerender } = renderHook(({ d }) => useDebouncedCallback(vi.fn(), d), {
      initialProps: { d: 300 },
    })
    const before = result.current
    rerender({ d: 500 })
    expect(result.current).not.toBe(before)
  })

  it('does not fire a pending call after unmount', () => {
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => result.current())
    unmount()
    act(() => vi.advanceTimersByTime(300))
    expect(fn).not.toHaveBeenCalled()
  })
})
