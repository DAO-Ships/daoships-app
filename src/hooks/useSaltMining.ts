import { useState, useCallback } from 'react'
import { saltMiner } from '@/services/utils/SaltMiner'
import type { SaltMiningParams } from '@/services/utils/SaltMiner'

/**
 * Progress update emitted during salt mining.
 */
export interface SaltMiningProgress {
  currentContract: string
  contractsComplete: number
  totalContracts: number
  currentAttempt: number
}

/**
 * Final result of a successful salt mining operation.
 * Contains deterministic CREATE2 salts and predicted addresses for all contracts.
 */
export interface SaltMiningResult {
  vault: { salt: string; address: string }
  shares: { salt: string; address: string }
  loot: { salt: string; address: string }
  daoShip: { salt: string; address: string }
}

export type { SaltMiningParams }

/**
 * Wraps the SaltMiner Web Worker, providing reactive state for:
 * - mining progress (current contract, attempt count)
 * - final results (salts + predicted addresses)
 * - error handling
 * - cancel support
 */
export function useSaltMining() {
  const [mining, setMining] = useState(false)
  const [progress, setProgress] = useState<SaltMiningProgress | null>(null)
  const [results, setResults] = useState<SaltMiningResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mine = useCallback(async (params: SaltMiningParams) => {
    setMining(true)
    setError(null)
    setResults(null)
    setProgress(null)

    try {
      const result = await saltMiner.mineAllSalts(params, (p: SaltMiningProgress) => setProgress(p))
      setResults(result)
      return result
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Salt mining failed'
      setError(message)
      throw e
    } finally {
      setMining(false)
    }
  }, [])

  const cancel = useCallback(() => {
    saltMiner.cancel()
  }, [])

  return { mining, progress, results, error, mine, cancel }
}
