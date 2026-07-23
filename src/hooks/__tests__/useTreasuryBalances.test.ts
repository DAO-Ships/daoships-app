import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { quais } from 'quais'
import type { GuildToken } from '@/types'

interface TreasuryQueryOptions {
  queryKey?: unknown[]
  queryFn?: () => Promise<unknown>
  enabled?: boolean
  refetchInterval?: number | false
}
const captured = vi.hoisted(() => ({ opts: {} as TreasuryQueryOptions }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: TreasuryQueryOptions) => {
    captured.opts = opts
    return { data: undefined }
  },
}))

const flags = vi.hoisted(() => ({ providerReady: true, visible: true }))
vi.mock('../useProviderReady', () => ({ useProviderReady: () => flags.providerReady }))
vi.mock('../usePageVisibility', () => ({ usePageVisibility: () => flags.visible }))

// Fake chain reads: native balance from the provider, ERC-20 balances from a per-address
// store, with an opt-in failure set to exercise the per-token fallback.
const chain = vi.hoisted(() => ({
  native: 0n,
  balances: new Map<string, bigint>(),
  fail: new Set<string>(),
}))
vi.mock('@/services/core/BaseService', () => ({
  baseService: {
    getProvider: () => ({
      getBalance: async () => chain.native,
    }),
  },
}))
vi.mock('quais', async (importOriginal) => {
  const actual = await importOriginal<typeof import('quais')>()
  class MockContract {
    private addr: string
    constructor(addr: string) {
      this.addr = String(addr).toLowerCase()
    }
    async balanceOf(): Promise<bigint> {
      if (chain.fail.has(this.addr)) throw new Error('read reverted')
      return chain.balances.get(this.addr) ?? 0n
    }
  }
  return { quais: { ...actual.quais, Contract: MockContract } }
})
vi.mock('@/utils/tokenMetadata', () => ({
  fetchTokenMetadata: async (addr: string) => ({
    symbol: `SYM_${String(addr).toLowerCase().slice(2, 6)}`,
    name: 'Token',
    decimals: 6,
  }),
}))

import { useTreasuryBalances } from '../useTreasuryBalances'

const NATIVE = '0x0000000000000000000000000000000000000000'
const T1 = '0x00000000000000000000000000000000000000aa'
const T2 = '0x0012340000000000000000000000000000005678'

function token(address: string, enabled = true): GuildToken {
  return {
    id: `dao-${address}`,
    dao_id: 'dao',
    token_address: address,
    enabled,
    created_at: '',
    tx_hash: '',
  }
}

beforeEach(() => {
  captured.opts = {}
  flags.providerReady = true
  flags.visible = true
  chain.native = 0n
  chain.balances = new Map()
  chain.fail = new Set()
})

describe('useTreasuryBalances — query config', () => {
  it('keys on the SORTED token-address set so a same-length swap cannot serve stale balances', () => {
    const { rerender } = renderHook(({ toks }) => useTreasuryBalances('0xvault', toks), {
      initialProps: { toks: [token(T1), token(T2)] },
    })
    const key1 = captured.opts.queryKey
    rerender({ toks: [token(T2), token(T1)] }) // same set, reversed order
    expect(captured.opts.queryKey).toEqual(key1)
    // ...but a genuinely different token set must produce a different key.
    rerender({ toks: [token(T1)] })
    expect(captured.opts.queryKey).not.toEqual(key1)
  })

  it('is disabled until the wallet provider is ready (all RPC goes through it)', () => {
    flags.providerReady = false
    renderHook(() => useTreasuryBalances('0xvault', [token(T1)]))
    expect(captured.opts.enabled).toBe(false)
  })

  it('polls every 30s only while the page is visible', () => {
    const { rerender } = renderHook(() => useTreasuryBalances('0xvault', [token(T1)]))
    expect(captured.opts.refetchInterval).toBe(30000)
    flags.visible = false
    rerender()
    expect(captured.opts.refetchInterval).toBe(false)
  })
})

describe('useTreasuryBalances — queryFn balance assembly', () => {
  async function run(tokens: GuildToken[]) {
    renderHook(() => useTreasuryBalances(quais.getAddress('0x00abc00000000000000000000000000000000011'), tokens))
    return (await captured.opts.queryFn!()) as {
      nativeBalance: bigint
      tokenBalances: Array<{ address: string; balance: bigint; isNative: boolean; symbol: string }>
    }
  }

  it('returns balances in the original token order, native and ERC-20 alike', async () => {
    chain.native = 500n
    chain.balances.set(T1.toLowerCase(), 111n)
    chain.balances.set(T2.toLowerCase(), 222n)

    const { nativeBalance, tokenBalances } = await run([token(T1), token(NATIVE), token(T2)])

    expect(nativeBalance).toBe(500n)
    expect(tokenBalances.map((t) => t.address)).toEqual([T1, NATIVE, T2])
    expect(tokenBalances[0].balance).toBe(111n)
    expect(tokenBalances[1]).toMatchObject({ isNative: true, balance: 500n, symbol: 'QUAI' })
    expect(tokenBalances[2].balance).toBe(222n)
  })

  it('excludes disabled guild tokens', async () => {
    chain.balances.set(T1.toLowerCase(), 1n)
    const { tokenBalances } = await run([token(T1), token(T2, false)])
    expect(tokenBalances.map((t) => t.address)).toEqual([T1])
  })

  it('falls back to a placeholder entry when one token read reverts, without failing the whole query', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    chain.balances.set(T1.toLowerCase(), 111n)
    chain.fail.add(T2.toLowerCase())

    const { tokenBalances } = await run([token(T1), token(T2)])

    expect(tokenBalances[0].balance).toBe(111n)
    expect(tokenBalances[1]).toMatchObject({ address: T2, balance: 0n, symbol: '???' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
