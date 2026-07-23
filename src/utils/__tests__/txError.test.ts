import { describe, it, expect } from 'vitest'
import { classifyTxError, isPendingTimeout } from '../txError'
import { TxPendingTimeout, TxReverted } from '@/services/utils/TxExecutor'

describe('classifyTxError', () => {
  it('frames a TxPendingTimeout as pending (not a failure)', () => {
    const info = classifyTxError(new TxPendingTimeout('0xabc', 90_000))
    expect(info.pending).toBe(true)
    expect(info.title).toBe('Still confirming')
    expect(info.message).toMatch(/no need to resend/i)
  })

  it('recognizes a pending timeout by name even if instanceof is defeated', () => {
    const lookalike = Object.assign(new Error('slow'), { name: 'TxPendingTimeout' })
    expect(isPendingTimeout(lookalike)).toBe(true)
    expect(classifyTxError(lookalike).pending).toBe(true)
  })

  it('frames a revert as a genuine failure carrying the underlying message', () => {
    const info = classifyTxError(new TxReverted('0xdead', 'Ragequit'))
    expect(info.pending).toBe(false)
    expect(info.title).toBe('Transaction failed')
    expect(info.message).toContain('Ragequit')
  })

  it('handles a plain Error', () => {
    const info = classifyTxError(new Error('user rejected'))
    expect(info.pending).toBe(false)
    expect(info.message).toBe('user rejected')
  })

  it('stringifies a non-Error throw', () => {
    expect(classifyTxError('boom').message).toBe('boom')
  })
})
