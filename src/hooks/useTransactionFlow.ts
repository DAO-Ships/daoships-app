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

  const execute = useCallback(async (fn: () => Promise<string>) => {
    try {
      setStep('signing')
      setError(null)
      const hash = await fn()
      setTxHash(hash)
      setStep('waiting')
      // The caller should await tx.wait() inside fn() or externally;
      // once resolved, transition to success:
      setStep('success')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Transaction failed'
      setError(message)
      setStep('error')
    }
  }, [])

  return { step, txHash, error, resetKey, reset, execute, setStep }
}
