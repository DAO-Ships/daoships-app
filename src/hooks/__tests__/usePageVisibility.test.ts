import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePageVisibility } from '../usePageVisibility'

// Previously this registered a `visibilitychange` listener and held its own state PER
// CALL. With 17 call sites (16 query hooks + OngoingPolls), a DAO page had several live
// instances, so one tab focus/blur fired N listeners and produced N state updates.
// Pausing polling while hidden matters most on mobile — battery and metered data — so
// the behaviour must stay identical while the listener count drops to one.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePageVisibility', () => {
  it('reports the current visibility', () => {
    setHidden(false)
    const { result } = renderHook(() => usePageVisibility())
    expect(result.current).toBe(true)
  })

  it('updates when the tab is hidden and restored', () => {
    setHidden(false)
    const { result } = renderHook(() => usePageVisibility())

    act(() => setHidden(true))
    expect(result.current).toBe(false)

    act(() => setHidden(false))
    expect(result.current).toBe(true)
  })

  it('registers ONE document listener no matter how many consumers mount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    setHidden(false)

    renderHook(() => usePageVisibility())
    renderHook(() => usePageVisibility())
    renderHook(() => usePageVisibility())

    const registrations = addSpy.mock.calls
      .filter(([event]) => event === 'visibilitychange').length
    expect(registrations).toBeLessThanOrEqual(1)
  })

  it('keeps every consumer in sync', () => {
    setHidden(false)
    const a = renderHook(() => usePageVisibility())
    const b = renderHook(() => usePageVisibility())

    act(() => setHidden(true))
    expect(a.result.current).toBe(false)
    expect(b.result.current).toBe(false)
  })

  it('removes the listener only once the LAST consumer unmounts', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    setHidden(false)

    const first = renderHook(() => usePageVisibility())
    const second = renderHook(() => usePageVisibility())

    first.unmount()
    expect(removeSpy.mock.calls.filter(([e]) => e === 'visibilitychange')).toHaveLength(0)

    second.unmount()
    expect(removeSpy.mock.calls.filter(([e]) => e === 'visibilitychange').length)
      .toBeGreaterThanOrEqual(1)
  })
})
