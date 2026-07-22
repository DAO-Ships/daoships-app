import { describe, it, expect, beforeEach } from 'vitest'
import { recordTx, clearTx, getTrackedTx, listTrackedTxs } from '../TxTracker'

// ═══════════════════════════════════════════════════════════════════════════
// Record-before-await is the whole point: nothing in the app captured a tx hash
// before calling tx.wait(), so a dropped connection or tab reload left the client
// with no evidence a transaction had been sent while the chain had executed it.
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'daoships-inflight-tx'

beforeEach(() => {
  localStorage.clear()
})

describe('TxTracker persistence', () => {
  it('records and reads back an in-flight transaction', () => {
    recordTx({ step: 'launch', hash: '0xabc', chainId: 9 })
    const tracked = getTrackedTx('launch')
    expect(tracked?.hash).toBe('0xabc')
    expect(tracked?.chainId).toBe(9)
    expect(typeof tracked?.recordedAt).toBe('number')
  })

  it('clears a step once its outcome is known', () => {
    recordTx({ step: 'launch', hash: '0xabc', chainId: 9 })
    clearTx('launch')
    expect(getTrackedTx('launch')).toBeNull()
  })

  it('keeps steps independent', () => {
    recordTx({ step: 'launch', hash: '0xaaa', chainId: 9 })
    recordTx({ step: 'navigator', hash: '0xbbb', chainId: 9 })
    clearTx('launch')
    expect(getTrackedTx('launch')).toBeNull()
    expect(getTrackedTx('navigator')?.hash).toBe('0xbbb')
  })

  it('retains the expected deployment address for a CREATE2 probe', () => {
    recordTx({ step: 'launch', hash: '0xabc', chainId: 9, expectedAddress: '0x001' })
    expect(getTrackedTx('launch')?.expectedAddress).toBe('0x001')
  })

  it('survives malformed storage without throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    expect(getTrackedTx('launch')).toBeNull()
    expect(listTrackedTxs()).toEqual([])
  })

  it('ignores entries missing required fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ launch: { step: 'launch' } }))
    expect(getTrackedTx('launch')).toBeNull()
  })

  it('discards entries older than the retention window', () => {
    const stale = Date.now() - 48 * 60 * 60 * 1000
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ launch: { step: 'launch', hash: '0xabc', chainId: 9, recordedAt: stale } }),
    )
    expect(getTrackedTx('launch')).toBeNull()
  })

  it('does not honour prototype-polluting keys from storage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __proto__: { step: 'x', hash: '0x1', chainId: 9, recordedAt: Date.now() } }),
    )
    expect(listTrackedTxs()).toEqual([])
  })

  it('lists tracked transactions newest first', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        older: { step: 'older', hash: '0x1', chainId: 9, recordedAt: Date.now() - 1000 },
        newer: { step: 'newer', hash: '0x2', chainId: 9, recordedAt: Date.now() },
      }),
    )
    expect(listTrackedTxs().map((t) => t.step)).toEqual(['newer', 'older'])
  })
})
