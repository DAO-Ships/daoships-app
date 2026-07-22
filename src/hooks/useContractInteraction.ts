import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProviderReady } from './useProviderReady'
import { quais } from 'quais'
import { isContract, fetchAbi, type AbiSource } from '@/services/utils/ContractMetadataService'
import { baseService } from '@/services/core/BaseService'
import { isAddress } from '@/services/utils/AddressUtils'

export interface TokenMetadata {
  symbol: string
  decimals: number
  name: string
}

// ═══════════════════════════════════════════════════════════════════════════
// useContractInteraction — Contract detection + ABI fetch + function parsing
// ═══════════════════════════════════════════════════════════════════════════

export interface FunctionInputInfo {
  name: string
  type: string
}

export interface FunctionInfo {
  name: string
  signature: string
  selector: string
  inputs: FunctionInputInfo[]
  stateMutability: string
  payable: boolean
}

function parseFunctions(abi: quais.InterfaceAbi): FunctionInfo[] {
  try {
    const iface = new quais.Interface(abi)
    const functions: FunctionInfo[] = []

    iface.forEachFunction((fragment) => {
      if (fragment.stateMutability === 'view' || fragment.stateMutability === 'pure') return

      functions.push({
        name: fragment.name,
        signature: fragment.format('minimal'),
        selector: fragment.selector,
        inputs: fragment.inputs.map((inp, i) => ({
          // ParamType has no `index`; fall back to positional order for unnamed args.
          name: inp.name || `arg${i}`,
          type: inp.type,
        })),
        stateMutability: fragment.stateMutability,
        payable: fragment.stateMutability === 'payable',
      })
    })

    // Sort: common names first, then alphabetical
    const priority = new Set(['transfer', 'approve', 'transferFrom', 'mint', 'burn', 'execute'])
    functions.sort((a, b) => {
      const ap = priority.has(a.name) ? 0 : 1
      const bp = priority.has(b.name) ? 0 : 1
      if (ap !== bp) return ap - bp
      return a.name.localeCompare(b.name)
    })

    return functions
  } catch {
    return []
  }
}

export function useContractInteraction(address: string | undefined) {
  const providerReady = useProviderReady()
  const isValidAddress = address ? isAddress(address) : false
  const hasProvider = providerReady

  // Contract detection query
  const {
    data: isContractResult,
    isLoading: isDetecting,
    error: detectError,
  } = useQuery({
    queryKey: ['contractDetect', address],
    queryFn: () => isContract(address!),
    enabled: isValidAddress && hasProvider,
    staleTime: Infinity,
    retry: 1,
  })

  // ABI fetch query (only if it's a contract and no manual ABI)
  const [manualAbi, setManualAbiState] = useState<quais.JsonFragment[] | null>(null)

  const {
    data: fetchedResult,
    isLoading: isFetchingAbi,
    error: abiFetchError,
  } = useQuery({
    queryKey: ['contractAbi', address],
    queryFn: () => fetchAbi(address!),
    enabled: isValidAddress && hasProvider && isContractResult === true && !manualAbi,
    staleTime: Infinity,
    retry: 1,
  })

  const abi = manualAbi ?? fetchedResult?.abi ?? null
  const abiSource: AbiSource | 'manual' | null = manualAbi ? 'manual' : fetchedResult?.source ?? null

  const functions = useMemo(() => (abi ? parseFunctions(abi) : []), [abi])

  // Detect ERC-20 and fetch token metadata (symbol, decimals)
  const isErc20 = useMemo(() => {
    if (!abi) return false
    const names = new Set(abi.filter((e) => e.type === 'function').map((e) => e.name))
    return names.has('transfer') && names.has('balanceOf') && names.has('approve') && names.has('totalSupply')
  }, [abi])

  const { data: tokenMetadata } = useQuery<TokenMetadata | null>({
    queryKey: ['tokenMetadata', address],
    queryFn: async (): Promise<TokenMetadata | null> => {
      try {
        const provider = baseService.getProvider()
        const contract = new quais.Contract(quais.getAddress(address!), [
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)',
          'function name() view returns (string)',
        ], provider)
        const [symbol, decimals, name] = await Promise.all([
          contract.symbol() as Promise<string>,
          contract.decimals().then((d: unknown) => Number(d)),
          contract.name().catch(() => '') as Promise<string>,
        ])
        return { symbol, decimals, name }
      } catch {
        return null
      }
    },
    enabled: isValidAddress && hasProvider && isErc20,
    staleTime: Infinity,
  })

  const setManualAbi = useCallback((input: quais.JsonFragment[]): { success: boolean; error?: string } => {
    try {
      if (!Array.isArray(input)) return { success: false, error: 'ABI must be a JSON array' }
      // Validate it parses as an Interface
      new quais.Interface(input)
      setManualAbiState(input)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid ABI format' }
    }
  }, [])

  const clearManualAbi = useCallback(() => setManualAbiState(null), [])

  return {
    isContract: isContractResult ?? null,
    isDetecting: isValidAddress && hasProvider && isDetecting,
    detectError: detectError instanceof Error ? detectError.message : null,
    abi,
    abiSource,
    isFetchingAbi: isValidAddress && hasProvider && isFetchingAbi,
    abiFetchError: abiFetchError instanceof Error ? abiFetchError.message : null,
    functions,
    setManualAbi,
    clearManualAbi,
    hasManualAbi: !!manualAbi,
    isErc20,
    tokenMetadata: tokenMetadata ?? null,
  }
}
