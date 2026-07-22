import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import {
  DEPLOYMENTS,
  getDeployment,
  SUPPORTED_CHAIN_IDS,
  QUAI_MAINNET_CHAIN_ID,
  QUAI_ORCHARD_CHAIN_ID,
} from '../deployments'

// These are offline invariants only. The addresses were verified against each chain's
// RPC with quai_getCode when the table was written; re-verifying here would make the
// test suite depend on live network access.

describe('deployments table', () => {
  it('covers both known Quai networks', () => {
    expect(SUPPORTED_CHAIN_IDS.sort()).toEqual([QUAI_MAINNET_CHAIN_ID, QUAI_ORCHARD_CHAIN_ID].sort())
  })

  it.each(SUPPORTED_CHAIN_IDS)('chain %i has fully-populated, valid config', (chainId) => {
    const d = getDeployment(chainId)
    expect(d).toBeDefined()
    expect(d!.chainId).toBe(chainId)
    expect(d!.chainName).toBeTruthy()
    expect(d!.supabaseSchema).toBeTruthy()
    expect(d!.blockExplorerUrl).toMatch(/^https:\/\//)
  })

  it.each(SUPPORTED_CHAIN_IDS)('chain %i RPC includes the mandatory shard path', (chainId) => {
    // The bare host 404s on Quai; /cyprus1 is required.
    expect(getDeployment(chainId)!.rpcUrl).toMatch(/^https:\/\/.+\/cyprus1$/)
  })

  it.each(SUPPORTED_CHAIN_IDS)('chain %i addresses are Cyprus-1 and EIP-55 checksummed', (chainId) => {
    const contracts = getDeployment(chainId)!.contracts
    for (const [name, address] of Object.entries(contracts)) {
      // quai_* rejects non-checksummed input outright, so storing them wrong is fatal.
      expect(quais.getAddress(address), `${name} must be checksummed`).toBe(address)
      expect(quais.isQuaiAddress(address), `${name} must be a Quai address`).toBe(true)
      expect(quais.getZoneForAddress(address), `${name} must be in Cyprus-1`).toBe('0x00')
    }
  })

  it('does not reuse an address across chains', () => {
    const main = Object.values(DEPLOYMENTS[QUAI_MAINNET_CHAIN_ID].contracts).map((a) => a.toLowerCase())
    const orch = Object.values(DEPLOYMENTS[QUAI_ORCHARD_CHAIN_ID].contracts).map((a) => a.toLowerCase())
    expect(main.filter((a) => orch.includes(a))).toEqual([])
  })

  it('binds each chain to a distinct indexer schema', () => {
    expect(DEPLOYMENTS[QUAI_MAINNET_CHAIN_ID].supabaseSchema).toBe('mainnet')
    expect(DEPLOYMENTS[QUAI_ORCHARD_CHAIN_ID].supabaseSchema).toBe('testnet')
  })

  it('returns undefined for an unknown chain rather than a wrong default', () => {
    expect(getDeployment(1)).toBeUndefined()
    expect(getDeployment(0)).toBeUndefined()
  })
})
