import { useState, useCallback } from 'react'
import type { TransactionStep } from '@/types'

/**
 * Manages the lifecycle state for a TransactionFlow UI component.
 * Tracks the current step (preparing -> signing -> waiting -> success/error),
 * the transaction hash, any error messages, and provides reset/execute helpers.
 *
 * The `resetKey` counter increments on each reset, useful as a React key
 * to force child component remounts when the flow restarts.
 */
export function useTransactionFlow() {
  const [step, setStep] = useState<TransactionStep>('preparing')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)

  const reset = useCallback(() => {
    setStep('preparing')
    setTxHash(null)
    setError(null)
    setResetKey((k) => k + 1)
  }, [])

  /**
   * Execute a transaction flow. The `fn` callback receives a `reportHash`
   * function it should call as soon as the tx hash is available (before mining).
   * This transitions the UI to "waiting" so the user sees confirmation progress.
   *
   * The callback should:
   * 1. Submit the transaction (wallet signing prompt)
   * 2. Call `reportHash(txHash)` once the hash is known
   * 3. Await tx.wait() for on-chain confirmation
   * 4. Return the tx hash
   *
   * The flow transitions: signing → waiting → success (or error).
   */
  const execute = useCallback(async (fn: (reportHash: (hash: string) => void) => Promise<string>) => {
    try {
      setStep('signing')
      setError(null)

      const reportHash = (hash: string) => {
        setTxHash(hash)
        setStep('waiting')
      }

      const hash = await fn(reportHash)
      // Ensure hash is captured even if fn didn't call reportHash
      setTxHash(hash)
      setStep('success')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Transaction failed'
      setError(message)
      setStep('error')
    }
  }, [])

  return { step, txHash, error, resetKey, reset, execute, setStep }
}
