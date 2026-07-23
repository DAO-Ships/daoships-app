import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const tracker = vi.hoisted(() => ({ recordTx: vi.fn(), clearTx: vi.fn() }))
vi.mock('../TxTracker', () => ({ recordTx: tracker.recordTx, clearTx: tracker.clearTx }))

const estimate = vi.hoisted(() => vi.fn())
vi.mock('../GasEstimator', () => ({ estimateGasOrThrow: estimate }))

const base = vi.hoisted(() => ({ chainId: 9 as number | null }))
vi.mock('@/services/core/BaseService', () => ({
  baseService: { getChainId: () => base.chainId },
}))

import {
  waitForReceipt,
  confirmTx,
  executeWrite,
  TxPendingTimeout,
  TxReverted,
  DEFAULT_TX_TIMEOUT_MS,
} from '../TxExecutor'

const OK = { status: 1 } as unknown
const REVERTED = { status: 0 } as unknown

/** A sent-tx double whose receipt resolves after `delayMs` (or never, if omitted). */
function fakeTx(hash: string, receipt: unknown, delayMs?: number) {
  return {
    hash,
    wait: () =>
      new Promise<never>((resolve, reject) => {
        if (delayMs === undefined) return // never settles
        setTimeout(() => (receipt instanceof Error ? reject(receipt) : resolve(receipt as never)), delayMs)
      }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  tracker.recordTx.mockClear()
  tracker.clearTx.mockClear()
  estimate.mockReset().mockResolvedValue(undefined)
  base.chainId = 9
})
afterEach(() => {
  vi.useRealTimers()
})

describe('waitForReceipt', () => {
  it('resolves with the receipt when it arrives before the timeout', async () => {
    const p = waitForReceipt(fakeTx('0x1', OK, 1000), 5000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toBe(OK)
  })

  it('throws TxPendingTimeout (carrying the hash) when the receipt is too slow', async () => {
    const p = waitForReceipt(fakeTx('0xabc', OK, 10_000), 5000)
    const assertion = expect(p).rejects.toMatchObject({ name: 'TxPendingTimeout', hash: '0xabc' })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('propagates a wait() rejection (a revert) rather than masking it as a timeout', async () => {
    const p = waitForReceipt(fakeTx('0x2', new Error('execution reverted'), 1000), 5000)
    const assertion = expect(p).rejects.toThrow('execution reverted')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })
})

describe('confirmTx', () => {
  it('records the hash BEFORE the await and clears it only after a confirmed receipt', async () => {
    const p = confirmTx(fakeTx('0xhash', OK, 1000), { label: 'Vote', step: 'vote' })

    // Recorded synchronously, before any receipt exists.
    expect(tracker.recordTx).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'vote', hash: '0xhash', chainId: 9 }),
    )
    expect(tracker.clearTx).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(tracker.clearTx).toHaveBeenCalledWith('vote')
  })

  it('does NOT clear the record on timeout, so the pending tx stays recoverable', async () => {
    const p = confirmTx(fakeTx('0xhash', OK, 10_000), { label: 'Vote', step: 'vote', timeoutMs: 5000 })
    const assertion = expect(p).rejects.toBeInstanceOf(TxPendingTimeout)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(tracker.clearTx).not.toHaveBeenCalled()
  })

  it('throws TxReverted on a reverted-status receipt', async () => {
    const p = confirmTx(fakeTx('0xdead', REVERTED, 500), { label: 'Ragequit' })
    const assertion = expect(p).rejects.toBeInstanceOf(TxReverted)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it('throws TxReverted on a null receipt', async () => {
    const p = confirmTx(fakeTx('0x0', null, 500), { label: 'Ragequit' })
    const assertion = expect(p).rejects.toBeInstanceOf(TxReverted)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it('does not record anything when no step is given', async () => {
    const p = confirmTx(fakeTx('0x9', OK, 100), { label: 'Vote' })
    await vi.advanceTimersByTimeAsync(100)
    await p
    expect(tracker.recordTx).not.toHaveBeenCalled()
    expect(tracker.clearTx).not.toHaveBeenCalled()
  })

  it('falls back to chainId 0 when the wallet chain is unknown', async () => {
    base.chainId = null
    const p = confirmTx(fakeTx('0x9', OK, 100), { label: 'Vote', step: 's' })
    await vi.advanceTimersByTimeAsync(100)
    await p
    expect(tracker.recordTx).toHaveBeenCalledWith(expect.objectContaining({ chainId: 0 }))
  })
})

describe('executeWrite', () => {
  function fakeContract(capture: (method: string, args: unknown[]) => void) {
    const handler = (method: string) => (...args: unknown[]) => {
      capture(method, args)
      return Promise.resolve(fakeTx('0xsent', OK, 100))
    }
    return new Proxy({}, { get: (_t, prop: string) => handler(prop) }) as never
  }

  it('estimates, sends with the args, and confirms', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const p = executeWrite({
      contract: fakeContract((method, args) => calls.push({ method, args })),
      method: 'submitVote',
      args: [7, true],
      label: 'Vote',
    })
    await vi.advanceTimersByTimeAsync(100)
    await p

    expect(estimate).toHaveBeenCalledWith(expect.anything(), 'submitVote', [7, true], 'Vote', undefined)
    expect(calls).toEqual([{ method: 'submitVote', args: [7, true] }]) // no trailing override arg
  })

  it('applies the gas multiplier as a gasLimit override when an estimate is available', async () => {
    estimate.mockResolvedValue(1000n)
    const calls: Array<{ method: string; args: unknown[] }> = []
    const p = executeWrite({
      contract: fakeContract((method, args) => calls.push({ method, args })),
      method: 'processProposal',
      args: [3, '0xdata'],
      label: 'Process',
      gasMultiplier: 150n,
    })
    await vi.advanceTimersByTimeAsync(100)
    await p

    expect(calls[0].args).toEqual([3, '0xdata', { gasLimit: 1500n }])
  })

  it('does NOT append a gasLimit when the estimate was skipped (undefined)', async () => {
    estimate.mockResolvedValue(undefined)
    const calls: Array<{ method: string; args: unknown[] }> = []
    const p = executeWrite({
      contract: fakeContract((method, args) => calls.push({ method, args })),
      method: 'processProposal',
      args: [3, '0xdata'],
      label: 'Process',
      gasMultiplier: 150n,
    })
    await vi.advanceTimersByTimeAsync(100)
    await p

    expect(calls[0].args).toEqual([3, '0xdata']) // no trailing undefined/override
  })

  it('passes a value override through to both the estimate and the send', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const p = executeWrite({
      contract: fakeContract((method, args) => calls.push({ method, args })),
      method: 'onboard(bytes32[])',
      args: [[]],
      label: 'Onboard',
      overrides: { value: 500n },
    })
    await vi.advanceTimersByTimeAsync(100)
    await p

    expect(estimate).toHaveBeenCalledWith(expect.anything(), 'onboard(bytes32[])', [[]], 'Onboard', { value: 500n })
    expect(calls[0].args).toEqual([[], { value: 500n }])
  })
})

describe('constants', () => {
  it('defaults the timeout to 90s', () => {
    expect(DEFAULT_TX_TIMEOUT_MS).toBe(90_000)
  })
})
