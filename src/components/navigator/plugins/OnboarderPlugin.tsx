import { useState, useEffect, useCallback } from 'react'
import { quais } from 'quais'
import type { NavigatorPluginProps } from './index'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { navigatorService } from '@/services/core/NavigatorService'
import { baseService } from '@/services/core/BaseService'
import type { OnboarderNavigatorConfig } from '@/services/core/NavigatorService'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// OnboarderPlugin - Multiplier or fixed-price native QUAI onboarding
// ═══════════════════════════════════════════════════════════════════════════

/** Known revert reasons mapped to user-friendly messages */
const ERROR_MAP: Record<string, string> = {
  'OnboarderNavigator: paused': 'This navigator is currently paused by the DAO.',
  'OnboarderNavigator: expired': 'The onboarding period has expired.',
  'OnboarderNavigator: mint cap reached': 'The total mint cap has been reached.',
  'OnboarderNavigator: per-address cap reached': 'You have reached the per-address mint cap.',
  'OnboarderNavigator: below minimum': 'Your tribute is below the minimum required amount.',
  'OnboarderNavigator: not allowlisted': 'Your address is not on the allowlist for this navigator.',
}

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

export function OnboarderPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator.is_active ? navigator.navigator_address : undefined,
  )

  if (configLoading) {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Loading navigator configuration...</p>
      </Card>
    )
  }

  if (!configResult || configResult.type !== 'OnboarderNavigator') {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Unable to load Onboarder configuration.</p>
      </Card>
    )
  }

  return (
    <OnboarderInteraction
      navigatorAddress={navigator.navigator_address}
      config={configResult.config}
      daoId={daoId}
      userAddress={userAddress}
      connected={connected}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OnboarderInteraction - Full config display + onboard form
// ═══════════════════════════════════════════════════════════════════════════

function OnboarderInteraction({
  navigatorAddress,
  config,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: OnboarderNavigatorConfig
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const [amount, setAmount] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [mintedTo, setMintedTo] = useState<bigint>(0n)
  const [quaiBalance, setQuaiBalance] = useState<bigint | null>(null)

  const amountBigInt = amount ? parseTokenAmount(amount) : 0n
  const insufficientBalance = quaiBalance !== null && amountBigInt > 0n && amountBigInt > quaiBalance
  const isFixedPrice = config.mode === 'fixedPrice'

  const isValid = isFixedPrice
    ? amountBigInt > 0n && config.pricePerUnit > 0n && amountBigInt >= config.pricePerUnit
    : amountBigInt >= config.minTribute && amountBigInt > 0n

  // Preview math
  const previewShares = isFixedPrice
    ? config.pricePerUnit > 0n
      ? (amountBigInt / config.pricePerUnit) * config.sharesPerUnit
      : 0n
    : (amountBigInt * config.shareMultiplier) / 10000n

  const previewLoot = isFixedPrice
    ? config.pricePerUnit > 0n
      ? (amountBigInt / config.pricePerUnit) * config.lootPerUnit
      : 0n
    : (amountBigInt * config.lootMultiplier) / 10000n

  const previewUnits =
    isFixedPrice && config.pricePerUnit > 0n ? amountBigInt / config.pricePerUnit : 0n

  const isExpired = config.expiry > 0n && BigInt(Math.floor(Date.now() / 1000)) > config.expiry
  const mintCapReached = config.mintCap > 0n && config.totalMinted >= config.mintCap

  // Fetch native QUAI balance for the connected user
  useEffect(() => {
    if (!userAddress) return
    async function fetchBalance() {
      try {
        const checksummed = quais.getAddress(userAddress!)
        const bal = await baseService.getProvider().getBalance(checksummed)
        setQuaiBalance(BigInt(bal))
      } catch (err) {
        console.warn('[OnboarderPlugin] Failed to fetch QUAI balance:', err)
      }
    }
    fetchBalance()
  }, [userAddress, success])

  // Fetch per-address minted amount
  useEffect(() => {
    if (!userAddress || config.perAddressCap === 0n) return
    navigatorService.getOnboarderMintedTo(navigatorAddress, userAddress).then(setMintedTo).catch(() => {})
  }, [navigatorAddress, userAddress, config.perAddressCap])

  const handleOnboard = useCallback(async () => {
    if (!isValid) return
    setError(null)
    setSuccess(false)
    setIsOnboarding(true)
    try {
      // Pre-submit checks: re-read paused, expired, caps
      const freshConfig = await navigatorService.getOnboarderConfig(navigatorAddress)
      if (freshConfig.paused) {
        setError('This navigator has been paused since you loaded the page.')
        return
      }
      const now = BigInt(Math.floor(Date.now() / 1000))
      if (freshConfig.expiry > 0n && now > freshConfig.expiry) {
        setError('This onboarding period has expired.')
        return
      }
      if (freshConfig.mintCap > 0n && freshConfig.totalMinted >= freshConfig.mintCap) {
        setError('The mint cap has been reached.')
        return
      }

      await navigatorService.onboarderOnboard(navigatorAddress, amountBigInt)
      setAmount('')
      setSuccess(true)
    } catch (e: unknown) {
      setError(mapError(e))
    } finally {
      setIsOnboarding(false)
    }
  }, [isValid, navigatorAddress, amountBigInt])

  const mintCapPercent =
    config.mintCap > 0n
      ? Number((config.totalMinted * 10000n) / config.mintCap) / 100
      : 0

  return (
    <div className="space-y-5">
      {/* Status banners */}
      {config.paused && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400 font-medium">This navigator is currently paused.</p>
        </div>
      )}
      {isExpired && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400 font-medium">This onboarding period has expired.</p>
        </div>
      )}
      {mintCapReached && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400 font-medium">Mint cap has been reached.</p>
        </div>
      )}

      {/* Configuration display */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Configuration</h3>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Mode</p>
            <p className="text-dao-text-secondary font-medium">
              {isFixedPrice ? 'Fixed Price' : 'Multiplier'}
            </p>
          </div>

          {isFixedPrice ? (
            <>
              <div>
                <p className="text-dao-text-hint text-xs mb-0.5">Price per Unit</p>
                <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.pricePerUnit)} QUAI</p>
              </div>
              <div>
                <p className="text-dao-text-hint text-xs mb-0.5">Shares per Unit</p>
                <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.sharesPerUnit)}</p>
              </div>
              {config.lootPerUnit > 0n && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Loot per Unit</p>
                  <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.lootPerUnit)}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-dao-text-hint text-xs mb-0.5">Share Multiplier</p>
                <p className="font-mono text-dao-text-secondary">
                  {(Number(config.shareMultiplier) / 10000).toFixed(2)}x
                </p>
              </div>
              {config.lootMultiplier > 0n && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Loot Multiplier</p>
                  <p className="font-mono text-dao-text-secondary">
                    {(Number(config.lootMultiplier) / 10000).toFixed(2)}x
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Min Tribute</p>
            <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.minTribute)} QUAI</p>
          </div>

          {config.expiry > 0n && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Expiry</p>
              <p className="font-mono text-dao-text-secondary">
                {isExpired ? (
                  <span className="text-red-400">Expired</span>
                ) : (
                  new Date(Number(config.expiry) * 1000).toLocaleDateString()
                )}
              </p>
            </div>
          )}

          {config.perAddressCap > 0n && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Per-Address Cap</p>
              <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.perAddressCap)}</p>
            </div>
          )}
        </div>

        {/* Mint cap progress bar */}
        {config.mintCap > 0n && (
          <div className="mt-4 pt-3 border-t border-dao-border">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-dao-text-hint">Mint Cap Progress</span>
              <span className="font-mono text-dao-text-muted">
                {formatTokenAmount(config.totalMinted)} / {formatTokenAmount(config.mintCap)}
              </span>
            </div>
            <div className="w-full bg-dao-dark-3 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  mintCapReached ? 'bg-red-500' : 'bg-accent-500'
                }`}
                style={{ width: `${Math.min(mintCapPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-dao-text-hint mt-1">{mintCapPercent.toFixed(1)}% minted</p>
          </div>
        )}

        {/* Per-address minted display */}
        {config.perAddressCap > 0n && userAddress && mintedTo > 0n && (
          <div className="mt-3 pt-3 border-t border-dao-border">
            <p className="text-xs text-dao-text-hint">
              Your minted:{' '}
              <span className="font-mono text-dao-text-muted">
                {formatTokenAmount(mintedTo)} / {formatTokenAmount(config.perAddressCap)}
              </span>
            </p>
          </div>
        )}
      </Card>

      {/* Onboard form */}
      {!isExpired && !config.paused && !mintCapReached && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Join DAO</h3>}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor={`onboard-${navigatorAddress}`}
                className="block text-sm font-medium text-dao-text-secondary mb-1.5"
              >
                QUAI Amount
              </label>
              <input
                id={`onboard-${navigatorAddress}`}
                type="text"
                value={amount}
                onChange={(e) => {
                  if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                    setAmount(e.target.value)
                    setError(null)
                    setSuccess(false)
                  }
                }}
                placeholder={
                  isFixedPrice
                    ? `Min: ${formatTokenAmount(config.pricePerUnit)} (1 unit)`
                    : `Min: ${formatTokenAmount(config.minTribute)}`
                }
                className="input w-full font-mono"
                disabled={isOnboarding || !connected}
                aria-describedby={`onboard-hint-${navigatorAddress}`}
              />
              {amount && !isValid && (
                <p id={`onboard-hint-${navigatorAddress}`} className="text-xs text-red-400 mt-1">
                  {isFixedPrice
                    ? `Minimum is ${formatTokenAmount(config.pricePerUnit)} QUAI (1 unit)`
                    : `Minimum tribute is ${formatTokenAmount(config.minTribute)} QUAI`}
                </p>
              )}
              {insufficientBalance && (
                <p className="text-xs text-red-400 mt-1">
                  Insufficient QUAI balance. You have {formatTokenAmount(quaiBalance!)} QUAI.
                </p>
              )}
              {quaiBalance !== null && connected && (
                <p className="text-xs text-dao-text-hint mt-1">
                  Your Balance: {formatTokenAmount(quaiBalance)} QUAI
                </p>
              )}
            </div>

            {/* Preview */}
            {isValid && (
              <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-dao-text-secondary mb-1">You will receive:</p>
                <div className="flex gap-4 text-sm">
                  {isFixedPrice && (
                    <span className="font-mono text-dao-text-muted">
                      {previewUnits.toString()} unit{previewUnits !== 1n ? 's' : ''}
                    </span>
                  )}
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
              <p className="text-sm text-red-400" role="alert">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-400" role="status">Successfully onboarded!</p>
            )}

            {!connected ? (
              <p className="text-sm text-dao-text-hint text-center py-2">Connect wallet to join</p>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleOnboard}
                loading={isOnboarding}
                disabled={!isValid || insufficientBalance}
              >
                {insufficientBalance ? 'Insufficient Balance' : 'Join DAO'}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
