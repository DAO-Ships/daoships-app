import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// OnboarderInteraction - UI to join a DAO via the Onboarder navigator
// ═══════════════════════════════════════════════════════════════════════════

interface OnboarderConfig {
  /** Shares multiplier per QUAI contributed */
  sharesMultiplier: number
  /** Loot multiplier per QUAI contributed */
  lootMultiplier: number
  /** Minimum tribute in wei */
  minTribute: string
  /** Expiry timestamp (epoch seconds), 0 = no expiry */
  expiry: number
}

interface OnboarderInteractionProps {
  navigatorAddress: string
  config: OnboarderConfig
  onOnboard?: (amount: bigint) => Promise<void>
}

export function OnboarderInteraction({
  navigatorAddress,
  config,
  onOnboard,
}: OnboarderInteractionProps) {
  const [amount, setAmount] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountBigInt = amount ? parseTokenAmount(amount) : 0n
  const minTribute = BigInt(config.minTribute || '0')
  const isValid = amountBigInt >= minTribute && amountBigInt > 0n

  // Preview: how many shares/loot the user would receive
  const previewShares = amountBigInt * BigInt(config.sharesMultiplier || 1)
  const previewLoot = amountBigInt * BigInt(config.lootMultiplier || 0)

  // Check expiry
  const isExpired = config.expiry > 0 && Date.now() / 1000 > config.expiry

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
    <div className="card">
      <div className="px-6 py-4 border-b border-dao-border">
        <h3 className="text-lg font-semibold text-dao-text">Join DAO</h3>
        <p className="text-xs text-dao-text-hint font-mono mt-0.5" title={navigatorAddress}>
          Onboarder: {navigatorAddress.slice(0, 6)}...{navigatorAddress.slice(-4)}
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
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
            <p className="text-dao-text-hint">Min Tribute</p>
            <p className="font-mono text-dao-text-secondary">{formatTokenAmount(minTribute)} QUAI</p>
          </div>
          <div>
            <p className="text-dao-text-hint">Shares per QUAI</p>
            <p className="font-mono text-dao-text-secondary">{config.sharesMultiplier}x</p>
          </div>
          {config.lootMultiplier > 0 && (
            <div>
              <p className="text-dao-text-hint">Loot per QUAI</p>
              <p className="font-mono text-dao-text-secondary">{config.lootMultiplier}x</p>
            </div>
          )}
          {config.expiry > 0 && !isExpired && (
            <div>
              <p className="text-dao-text-hint">Expires</p>
              <p className="font-mono text-dao-text-secondary">
                {new Date(config.expiry * 1000).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Amount input */}
        {!isExpired && (
          <>
            <div>
              <label htmlFor="onboard-amount" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                QUAI Amount
              </label>
              <input
                id="onboard-amount"
                type="text"
                value={amount}
                onChange={(e) => {
                  if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                    setAmount(e.target.value)
                    setError(null)
                  }
                }}
                placeholder={`Min: ${formatTokenAmount(minTribute)}`}
                className="input w-full font-mono"
                disabled={isOnboarding}
              />
              {amount && !isValid && (
                <p className="text-xs text-red-400 mt-1">
                  Minimum tribute is {formatTokenAmount(minTribute)} QUAI
                </p>
              )}
            </div>

            {/* Preview */}
            {isValid && (
              <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-dao-text-secondary mb-1">You will receive:</p>
                <div className="flex gap-4 text-sm">
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

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {/* Action */}
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
    </div>
  )
}
