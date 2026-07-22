import { describe, it, expect } from 'vitest'
import { mapContractError } from '../pluginErrors'

// TransactionErrorHandler.isUserRejection / formatTransactionError had ZERO callers
// while every write path stringified the raw provider error, so a deliberate wallet
// cancellation rendered identically to a hard on-chain failure.

const MAP = { NotDelinquent: 'This member is not past their grace window yet.' }

describe('mapContractError', () => {
  it('reports a wallet cancellation as a cancellation, not a failure', () => {
    expect(mapContractError({ code: 'ACTION_REJECTED', message: 'user rejected' }, MAP))
      .toBe('Transaction cancelled in your wallet.')
  })

  it('recognises the EIP-1193 numeric rejection code', () => {
    expect(mapContractError({ code: 4001, message: 'User denied transaction' }, MAP))
      .toBe('Transaction cancelled in your wallet.')
  })

  it('still maps known contract errors to friendly copy', () => {
    expect(mapContractError(new Error('execution reverted: NotDelinquent()'), MAP))
      .toBe(MAP.NotDelinquent)
  })

  it('prefers the contract-error map over the generic formatter', () => {
    const out = mapContractError(new Error('NotDelinquent'), MAP)
    expect(out).toBe(MAP.NotDelinquent)
  })

  it('returns a non-empty message for an unmapped error', () => {
    const out = mapContractError(new Error('some unmapped failure'), MAP)
    expect(out).toBeTruthy()
    expect(typeof out).toBe('string')
  })
})
