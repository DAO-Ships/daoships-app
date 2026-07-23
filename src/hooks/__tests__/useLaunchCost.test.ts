import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { LaunchFormValues } from '@/components/launch/steps/BasicInfoStep'

// Fixed modeled gas so totals are deterministic; the estimator's own math is covered in
// LaunchGasEstimator.test.ts. Real constants (buffer 20%, low-warn 25%) are kept.
const est = vi.hoisted(() => ({
  modelDeployGas: vi.fn(() => 100n),
  modelLaunchGas: vi.fn(() => 1000n),
  modelPostGas: vi.fn(() => 50n),
}))
vi.mock('@/services/utils/LaunchGasEstimator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/utils/LaunchGasEstimator')>()
  return {
    ...actual,
    modelDeployGas: est.modelDeployGas,
    modelLaunchGas: est.modelLaunchGas,
    modelPostGas: est.modelPostGas,
    getGasPrice: vi.fn(),
    getNativeBalance: vi.fn(),
  }
})

const account = vi.hoisted(() => ({ value: { address: '0xme', isConnected: true } }))
vi.mock('wagmi', () => ({ useAccount: () => account.value }))

interface PriceData {
  gasPrice: bigint | null
  balance: bigint | null
}
const query = vi.hoisted(() => ({ data: undefined as PriceData | undefined }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: query.data }) }))

import { buildLaunchGasLines, useLaunchCost } from '../useLaunchCost'

function makeForm(overrides: Partial<LaunchFormValues> = {}): LaunchFormValues {
  return {
    name: 'Test DAO',
    description: 'desc',
    avatarUrl: '',
    bannerUrl: '',
    links: {},
    members: [{ address: '0x1', shares: '1', loot: '0' }],
    guildTokens: [],
    vaultOwners: [{ address: '0x1' }],
    enableOnboarder: false,
    enableERC20Tribute: false,
    ...overrides,
  } as unknown as LaunchFormValues
}

beforeEach(() => {
  est.modelDeployGas.mockClear()
  est.modelLaunchGas.mockClear()
  est.modelPostGas.mockClear()
  account.value = { address: '0xme', isConnected: true }
  query.data = undefined
})

describe('buildLaunchGasLines', () => {
  it('always emits the launch and profile lines, and no navigator lines by default', () => {
    const ids = buildLaunchGasLines(makeForm()).map((l) => l.id)
    expect(ids).toEqual(['launch', 'profile'])
  })

  it('prepends a deploy line per enabled navigator, in a stable order', () => {
    const ids = buildLaunchGasLines(
      makeForm({ enableOnboarder: true, enableERC20Tribute: true }),
    ).map((l) => l.id)
    expect(ids).toEqual(['onboarder', 'erc20tribute', 'launch', 'profile'])
  })

  it('counts only non-blank member and vault-owner addresses, and reflects navigator count', () => {
    buildLaunchGasLines(
      makeForm({
        members: [{ address: '0xa', shares: '1', loot: '0' }, { address: '  ', shares: '', loot: '' }],
        vaultOwners: [{ address: '0xo' }, { address: '' }],
        guildTokens: [{ type: 'native', address: '' }, { type: 'erc20', address: '0xt' }],
        enableOnboarder: true,
      }),
    )
    expect(est.modelLaunchGas).toHaveBeenCalledWith({
      memberCount: 1,
      guildTokenCount: 2, // guild tokens are NOT trimmed — count is raw length
      navigatorCount: 1,
      vaultOwnerCount: 1,
    })
  })
})

describe('useLaunchCost — affordability gate', () => {
  it('blocks when cost is still unknown rather than reading as affordable', () => {
    // The query resolves {null,null} for ~30s after connect, before the provider exists.
    query.data = { gasPrice: null, balance: null }
    const { result } = renderHook(() => useLaunchCost(makeForm()))
    expect(result.current.costUnknown).toBe(true)
    expect(result.current.insufficient).toBe(true) // must BLOCK
    expect(result.current.shortfall).toBe(0n) // but not claim a specific shortfall
  })

  it('still blocks when the gas price is known but the balance is not', () => {
    query.data = { gasPrice: 2n, balance: null }
    const { result } = renderHook(() => useLaunchCost(makeForm()))
    expect(result.current.costUnknown).toBe(true)
    expect(result.current.insufficient).toBe(true)
  })

  it('flags insufficient with the exact shortfall below the buffered total', () => {
    // totalGas = 1000 (launch) + 50 (profile) = 1050; ×2 gas price = 2100;
    // required = 2100 × 1.20 = 2520.
    query.data = { gasPrice: 2n, balance: 2000n }
    const { result } = renderHook(() => useLaunchCost(makeForm()))
    expect(result.current.totalGas).toBe(1050n)
    expect(result.current.requiredBalance).toBe(2520n)
    expect(result.current.insufficient).toBe(true)
    expect(result.current.shortfall).toBe(520n)
  })

  it('clears the gate but warns "low" within 25% of the required balance', () => {
    // low threshold = 2520 × 1.25 = 3150.
    query.data = { gasPrice: 2n, balance: 3000n }
    const { result } = renderHook(() => useLaunchCost(makeForm()))
    expect(result.current.insufficient).toBe(false)
    expect(result.current.low).toBe(true)
    expect(result.current.shortfall).toBe(0n)
  })

  it('is comfortable when the balance clears the low-warning threshold', () => {
    query.data = { gasPrice: 2n, balance: 3200n }
    const { result } = renderHook(() => useLaunchCost(makeForm()))
    expect(result.current.insufficient).toBe(false)
    expect(result.current.low).toBe(false)
    expect(result.current.costUnknown).toBe(false)
  })
})
