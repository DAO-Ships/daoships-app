import { describe, it, expect } from 'vitest'
import { SaltMiningCancelledError } from '../SaltMiner'

// cancel() posted a message and then terminated the worker. Terminate fires neither
// onmessage nor onerror, so the mineAllSalts promise stayed pending FOREVER:
// `await mine(...)` never returned, the caller's `finally { setMining(false) }` never
// ran, and ReviewStep's `if (!mineResult)` cancel branch was unreachable dead code.
//
// The worker also runs a synchronous 100k-iteration loop, so it cannot dequeue the
// cancel message mid-batch — terminating is the only reliable stop, which is exactly
// why the promise has to be settled explicitly.

describe('SaltMiningCancelledError', () => {
  it('is distinguishable from a genuine mining failure', () => {
    const cancelled = new SaltMiningCancelledError()
    const failure = new Error('worker crashed')

    expect(cancelled).toBeInstanceOf(Error)
    expect(cancelled).toBeInstanceOf(SaltMiningCancelledError)
    expect(failure).not.toBeInstanceOf(SaltMiningCancelledError)
  })

  it('carries a name callers can branch on', () => {
    expect(new SaltMiningCancelledError().name).toBe('SaltMiningCancelledError')
  })

  it('states the reason in its message', () => {
    expect(new SaltMiningCancelledError().message).toMatch(/cancelled/i)
  })
})
