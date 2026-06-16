import { NETWORK_CONFIG } from '@/config/contracts'
import type { TransactionStep } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// TransactionFlow - Reusable transaction UX state machine
// Steps: preparing -> signing -> waiting -> success -> error
// ═══════════════════════════════════════════════════════════════════════════

interface TransactionFlowProps {
  step: TransactionStep
  txHash?: string
  error?: string
  onClose?: () => void
  explorerUrl?: string
}

const stepMessages: Record<TransactionStep, string> = {
  preparing: 'Preparing transaction...',
  signing: 'Please approve the transaction in your wallet',
  waiting: 'Waiting for transaction confirmation...',
  success: 'Transaction completed successfully!',
  error: 'Transaction failed',
}

export function TransactionFlow({
  step,
  txHash,
  error,
  onClose,
  explorerUrl,
}: TransactionFlowProps) {
  const txExplorerUrl = txHash
    ? `${explorerUrl || NETWORK_CONFIG.blockExplorerUrl}/tx/${txHash}`
    : null

  const isProcessing =
    step === 'preparing' ||
    step === 'signing' ||
    step === 'waiting'

  const getStepIcon = () => {
    switch (step) {
      case 'preparing':
      case 'signing':
      case 'waiting':
        return (
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse" />
            <div className="relative inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent" />
          </div>
        )
      case 'success':
        return (
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-800 to-emerald-950 border-2 border-emerald-600">
            <svg aria-hidden="true" className="w-8 h-8 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-red-950 border-2 border-red-700">
            <svg aria-hidden="true" className="w-8 h-8 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex flex-col items-center justify-center py-6">
        {getStepIcon()}
        <p className="mt-6 text-center text-dao-text-secondary font-semibold text-lg">
          {error && step === 'error'
            ? error
            : stepMessages[step]}
        </p>

        {/* Tx hash link */}
        {txHash && txExplorerUrl && (
          <div className="mt-4 bg-dao-dark-4 px-4 py-2 rounded-md border border-dao-border max-w-full">
            <p className="text-xs font-mono text-dao-text-hint uppercase tracking-wider mb-1">
              Transaction Hash
            </p>
            <a
              href={txExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-400 hover:text-primary-300 font-mono break-all transition-colors hover:underline"
            >
              {txHash}
            </a>
          </div>
        )}
      </div>

      {/* Error details */}
      {step === 'error' && error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-400 dark:border-red-600 rounded-md p-4">
          <div className="flex items-start gap-3">
            <svg aria-hidden="true" className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-200 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {onClose && (
        <div className="pt-4 border-t border-dao-border">
          <div className="flex gap-4 justify-end">
            {step === 'error' && (
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
            )}
            {step === 'success' && (
              <button onClick={onClose} className="btn-primary">
                Done
              </button>
            )}
            {isProcessing && (
              <button className="btn-secondary" disabled>
                Processing...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
