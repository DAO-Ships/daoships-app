import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { quais } from 'quais'

// The three internal queries (detect/abi/metadata) are inert here — we drive the hook
// through the manual-ABI path so parseFunctions and the ERC-20 detection run against REAL
// quais.Interface parsing, not a mock.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
}))
vi.mock('../useProviderReady', () => ({ useProviderReady: () => true }))
vi.mock('@/services/utils/ContractMetadataService', () => ({
  isContract: vi.fn(),
  fetchAbi: vi.fn(),
}))
vi.mock('@/services/core/BaseService', () => ({ baseService: { getProvider: vi.fn() } }))

import { useContractInteraction } from '../useContractInteraction'

const fn = (
  name: string,
  stateMutability: string,
  inputs: Array<{ name: string; type: string }> = [],
): quais.JsonFragment => ({ type: 'function', name, stateMutability, inputs, outputs: [] })

const ERC20_ABI: quais.JsonFragment[] = [
  fn('transfer', 'nonpayable', [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }]),
  fn('approve', 'nonpayable', [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }]),
  fn('mint', 'payable'),
  fn('balanceOf', 'view', [{ name: 'owner', type: 'address' }]),
  fn('totalSupply', 'view'),
  fn('foo', 'nonpayable', [{ name: '', type: 'uint256' }]), // unnamed arg
]

const VALID_ADDRESS = '0x00000000000000000000000000000000000000aa'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setManualAbi — validation', () => {
  it('rejects a non-array input', () => {
    const { result } = renderHook(() => useContractInteraction(VALID_ADDRESS))
    let outcome!: { success: boolean; error?: string }
    act(() => {
      outcome = result.current.setManualAbi({} as unknown as quais.JsonFragment[])
    })
    expect(outcome.success).toBe(false)
    expect(outcome.error).toMatch(/array/i)
    expect(result.current.hasManualAbi).toBe(false)
  })

  it('accepts a valid ABI, marks the source manual, and clears it on request', () => {
    const { result } = renderHook(() => useContractInteraction(VALID_ADDRESS))
    act(() => {
      const outcome = result.current.setManualAbi(ERC20_ABI)
      expect(outcome.success).toBe(true)
    })
    expect(result.current.hasManualAbi).toBe(true)
    expect(result.current.abiSource).toBe('manual')

    act(() => result.current.clearManualAbi())
    expect(result.current.hasManualAbi).toBe(false)
  })
})

describe('parseFunctions (via functions) — real quais parsing', () => {
  function withAbi(abi: quais.JsonFragment[]) {
    const hook = renderHook(() => useContractInteraction(VALID_ADDRESS))
    act(() => {
      hook.result.current.setManualAbi(abi)
    })
    return hook.result
  }

  it('excludes view/pure functions and keeps only the writable ones', () => {
    const names = withAbi(ERC20_ABI).current.functions.map((f) => f.name)
    expect(names).not.toContain('balanceOf')
    expect(names).not.toContain('totalSupply')
  })

  it('orders priority names (approve/mint/transfer) ahead of the rest, each group alphabetical', () => {
    const names = withAbi(ERC20_ABI).current.functions.map((f) => f.name)
    // priority set is {transfer, approve, ..., mint, ...}; alpha within group -> approve, mint, transfer
    expect(names).toEqual(['approve', 'mint', 'transfer', 'foo'])
  })

  it('names an unnamed argument positionally and flags payable', () => {
    const fns = withAbi(ERC20_ABI).current.functions
    const foo = fns.find((f) => f.name === 'foo')!
    expect(foo.inputs[0].name).toBe('arg0')
    const mint = fns.find((f) => f.name === 'mint')!
    expect(mint.payable).toBe(true)
    expect(mint.selector).toMatch(/^0x[0-9a-f]{8}$/i)
  })
})

describe('ERC-20 detection', () => {
  it('is true when transfer, balanceOf, approve and totalSupply are all present', () => {
    const { result } = renderHook(() => useContractInteraction(VALID_ADDRESS))
    act(() => result.current.setManualAbi(ERC20_ABI))
    expect(result.current.isErc20).toBe(true)
  })

  it('is false when a required ERC-20 function is missing', () => {
    const { result } = renderHook(() => useContractInteraction(VALID_ADDRESS))
    act(() => {
      result.current.setManualAbi(ERC20_ABI.filter((e) => e.name !== 'totalSupply'))
    })
    expect(result.current.isErc20).toBe(false)
  })
})
