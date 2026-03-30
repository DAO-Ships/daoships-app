import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// ERC20TributeInteraction - ERC20 Tribute Navigator UI (unit-priced onboarding)
// ═══════════════════════════════════════════════════════════════════════════

interface ERC20TributeConfig {
  /** Price per unit in wei */
  pricePerUnit: bigint
  /** Shares minted per unit purchased */
  sharePerUnit: bigint
  /** Loot minted per unit purchased */
  lootPerUnit: bigint
  /** Expiry timestamp (epoch seconds), 0 = no expiry */
  expiry: bigint
}

interface ERC20TributeInteractionProps {
  navigatorAddress: string
  config: ERC20TributeConfig
  onOnboard?: (amount: bigint) => Promise<void>
}

export function ERC20TributeInteraction({
  navigatorAddress,
  config,
  onOnboard,
}: ERC20TributeInteractionProps) {
  const [amount, setAmount] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountBigInt = amount ? parseTokenAmount(amount) : 0n
  const isValid = amountBigInt > 0n && config.pricePerUnit > 0n && amountBigInt >= config.pricePerUnit

  // Preview: how many units and resulting shares/loot
  const previewUnits = config.pricePerUnit > 0n ? amountBigInt / config.pricePerUnit : 0n
  const previewShares = previewUnits * config.sharePerUnit
  const previewLoot = previewUnits * config.lootPerUnit

  const isExpired = config.expiry > 0n && BigInt(Math.floor(Date.now() / 1000)) > config.expiry

  const handleOnboard = async () => {
    if (!isValid || !onOnboard) return
    setError(null)
    setIsOnboarding(true)

    try {
      await onOnboard(amountBigInt)
      setAmount('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onboarding failed')
    } finally {
      setIsOnboarding(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-dao-border space-y-4">
      <h4 className="text-sm font-semibold text-dao-text">Join DAO</h4>

      {/* Expired notice */}
      {isExpired && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">
            This onboarding period has expired.
          </p>
        </div>
      )}

      {/* Config summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-dao-text-hint">Price per Unit</p>
          <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.pricePerUnit)} QUAI</p>
        </div>
        <div>
          <p className="text-dao-text-hint">Shares per Unit</p>
          <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.sharePerUnit)}</p>
        </div>
        {config.lootPerUnit > 0n && (
          <div>
            <p className="text-dao-text-hint">Loot per Unit</p>
            <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.lootPerUnit)}</p>
          </div>
        )}
        {config.expiry > 0n && !isExpired && (
          <div>
            <p className="text-dao-text-hint">Expires</p>
            <p className="font-mono text-dao-text-secondary">
              {new Date(Number(config.expiry) * 1000).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {/* Amount input */}
      {!isExpired && (
        <>
          <div>
            <label htmlFor={`erc20tribute-${navigatorAddress}`} className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              QUAI Amount
            </label>
            <input
              id={`erc20tribute-${navigatorAddress}`}
              type="text"
              value={amount}
              onChange={(e) => {
                if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                  setAmount(e.target.value)
                  setError(null)
                }
              }}
              placeholder={`Min: ${formatTokenAmount(config.pricePerUnit)} (1 unit)`}
              className="input w-full font-mono"
              disabled={isOnboarding}
            />
            {amount && !isValid && (
              <p className="text-xs text-red-400 mt-1">
                Minimum is {formatTokenAmount(config.pricePerUnit)} QUAI (1 unit)
              </p>
            )}
          </div>

          {/* Preview */}
          {isValid && (
            <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-dao-text-secondary mb-1">You will receive:</p>
              <div className="flex gap-4 text-sm">
                <span className="font-mono text-dao-text-muted">
                  {previewUnits.toString()} unit{previewUnits !== 1n ? 's' : ''}
                </span>
                <span className="font-mono text-primary-400">
                  {formatTokenAmount(previewShares)} shares
                </span>
                {previewLoot > 0n && (
                  <span className="font-mono text-dao-text-muted">
                    {formatTokenAmount(previewLoot)} loot
                  </span>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleOnboard}
            loading={isOnboarding}
            disabled={!isValid || !onOnboard}
          >
            Join DAO
          </Button>
        </>
      )}
    </div>
  )
}
