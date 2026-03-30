import { useState } from 'react'
import { useDelegation } from '@/hooks/useDelegation'
import { Button } from '@/components/common/Button'

// ═══════════════════════════════════════════════════════════════════════════
// DelegationWidget - Delegate/undelegate shares to another member
// ═══════════════════════════════════════════════════════════════════════════

interface DelegationWidgetProps {
  daoId: string
  sharesAddress: string
  currentDelegate?: string | null
  userAddress?: string
}

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/

export function DelegationWidget({
  daoId,
  sharesAddress,
  currentDelegate,
  userAddress,
}: DelegationWidgetProps) {
  const [delegateAddress, setDelegateAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { delegate, isDelegating } = useDelegation(daoId)

  const isDelegated =
    currentDelegate &&
    userAddress &&
    currentDelegate.toLowerCase() !== userAddress.toLowerCase()

  const handleDelegate = async () => {
    setError(null)

    if (!ADDRESS_REGEX.test(delegateAddress)) {
      setError('Must be a valid 42-character hex address')
      return
    }

    try {
      await delegate({ sharesAddress, to: delegateAddress })
      setDelegateAddress('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delegation failed')
    }
  }

  const handleUndelegate = async () => {
    if (!userAddress) return
    setError(null)

    try {
      await delegate({ sharesAddress, to: userAddress })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Undelegation failed')
    }
  }

  return (
    <div className="card px-6 py-4">
      <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
        Delegation
      </h3>

      {/* Current delegation status */}
      {isDelegated && (
        <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-dao-text-secondary">
            Currently delegating to:{' '}
            <span className="font-mono text-accent-400" title={currentDelegate!}>
              {currentDelegate!.slice(0, 6)}...{currentDelegate!.slice(-4)}
            </span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUndelegate}
            loading={isDelegating}
            className="mt-2"
          >
            Undelegate
          </Button>
        </div>
      )}

      {/* Delegate form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={delegateAddress}
          onChange={(e) => {
            setDelegateAddress(e.target.value)
            setError(null)
          }}
          placeholder="Delegate to address (0x...)"
          className="input flex-1 font-mono text-sm"
          disabled={isDelegating}
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleDelegate}
          loading={isDelegating}
          disabled={!delegateAddress}
        >
          Delegate
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  )
}
