// ═══════════════════════════════════════════════════════════════════════════
// Phase A: the error dictionary decodes from all 16 ABIs, not just DAOShip.
//
// Decoding used to run against DAOShip.json alone, so a revert originating in a
// navigator, token, launcher, or the vault fell through undecoded and reached
// the user as the opaque "missing revert data" — the most common complaint.
//
// The selectors below are real, computed from the shipped ABIs.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estimateGasOrThrow } from '../GasEstimator'
import type { quais } from 'quais'

/** A revert the way quais surfaces it — data nested under `error`. */
function revert(data: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error('execution reverted'), { error: { data }, ...extra })
}

/** Minimal stand-in for a quais.Contract whose estimateGas rejects. */
function contractThatReverts(err: unknown): quais.Contract {
  return {
    doThing: { estimateGas: vi.fn().mockRejectedValue(err) },
  } as unknown as quais.Contract
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('estimateGasOrThrow — custom error decoding across all ABIs', () => {
  it('still decodes DAOShip errors with their friendly message (regression)', async () => {
    // 0x57eee766 = AlreadyProcessed(), in DAOShip.json and CUSTOM_ERROR_MESSAGES
    await expect(
      estimateGasOrThrow(contractThatReverts(revert('0x57eee766')), 'doThing', [], 'Process proposal'),
    ).rejects.toThrow('This proposal has already been processed.')
  })

  it('decodes a navigator error that DAOShip.json alone could not', async () => {
    // 0xc45cb513 = AllowanceExceeded(), BudgetNavigator only.
    // No friendly message, so it falls back to the decoded name — which is still
    // vastly better than "missing revert data".
    await expect(
      estimateGasOrThrow(contractThatReverts(revert('0xc45cb513')), 'doThing', [], 'Disburse'),
    ).rejects.toThrow('Contract error: AllowanceExceeded')
  })

  it('decodes an Onboarder navigator error', async () => {
    // 0xe24e90b3 = InsufficientTribute(), OnboarderNavigator only
    await expect(
      estimateGasOrThrow(contractThatReverts(revert('0xe24e90b3')), 'doThing', [], 'Onboard'),
    ).rejects.toThrow('Contract error: InsufficientTribute')
  })

  it('decodes a QuaiVault error despite the { abi } artifact shape (H12)', async () => {
    // 0x4b9fc0de = AlreadyAnOwner(), QuaiVault.json — one of the two artifacts
    // stored as { abi: [...] } rather than a bare array. Handed to
    // new quais.Interface() unnormalized it throws, and the vault would be the
    // one contract silently missing from the dictionary.
    await expect(
      estimateGasOrThrow(contractThatReverts(revert('0x4b9fc0de')), 'doThing', [], 'Enable module'),
    ).rejects.toThrow('Contract error: AlreadyAnOwner')
  })

  it('resolves a selector shared by two ABIs to that shared name', async () => {
    // 0x54e37625 = AlreadyCancelled(), present in BOTH DAOShip and BudgetNavigator.
    // Identical signature so the selector collides by construction; either match
    // yields the same name.
    await expect(
      estimateGasOrThrow(contractThatReverts(revert('0x54e37625')), 'doThing', [], 'Cancel'),
    ).rejects.toThrow('This proposal has already been cancelled.')
  })

  it('finds revert data nested deeper in the error chain', async () => {
    const nested = Object.assign(new Error('failed'), {
      info: { payload: { data: '0xe24e90b3' } },
    })
    await expect(
      estimateGasOrThrow(contractThatReverts(nested), 'doThing', [], 'Onboard'),
    ).rejects.toThrow('Contract error: InsufficientTribute')
  })

  it('throws a non-decode error for revert data no ABI recognises', async () => {
    const err = estimateGasOrThrow(
      contractThatReverts(revert('0xdeadbeef')), 'doThing', [], 'Mystery',
    )
    await expect(err).rejects.toThrow(/Mystery failed:/)
    await expect(err).rejects.not.toThrow(/Contract error:/)
  })

  it('yields instead of blocking when there is no revert data at all', async () => {
    // Pelagus wraps every estimateGas failure as code 4001 with data stripped.
    // Blocking here would reject valid transactions, so the estimator must
    // return undefined and let the wallet simulate at signing time.
    const result = await estimateGasOrThrow(
      contractThatReverts(Object.assign(new Error('user rejected'), { code: 4001 })),
      'doThing', [], 'Anything',
    )
    expect(result).toBeUndefined()
  })

  it('returns the estimate unchanged when the call succeeds', async () => {
    const contract = {
      doThing: { estimateGas: vi.fn().mockResolvedValue(21000n) },
    } as unknown as quais.Contract
    await expect(estimateGasOrThrow(contract, 'doThing', [], 'Fine')).resolves.toBe(21000n)
  })
})
