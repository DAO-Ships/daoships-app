import { useState } from 'react'
import type { Navigator } from '@/types'
import { NAVIGATOR_PERMISSION_LABELS, type NavigatorPermission } from '@/types'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useWallet } from '@/hooks/useWallet'
import { navigatorService } from '@/services/core/NavigatorService'
import type { OnboarderNavigatorConfig, ERC20TributeNavigatorConfig } from '@/services/core/NavigatorService'
import { Card } from '@/components/common/Card'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { Button } from '@/components/common/Button'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { formatDuration } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorDetailCard - Navigator info + type-specific interaction UI
// ═══════════════════════════════════════════════════════════════════════════

const PERMISSION_COLORS: Record<string, string> = {
  none: 'bg-dao-surface text-dao-text-hint',
  admin: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  manager: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  admin_manager: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
  governor: 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400',
  admin_governor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400',
  manager_governor: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400',
  all: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
}

function formatPermissionLabel(label: string): string {
  return label
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' + ')
}

const NAVIGATOR_TYPE_LABELS: Record<string, string> = {
  OnboarderNavigator: 'Onboarder Navigator',
  ERC20TributeNavigator: 'ERC20 Tribute Navigator',
  unknown: 'Custom Navigator',
}

interface NavigatorDetailCardProps {
  navigator: Navigator
}

export function NavigatorDetailCard({ navigator }: NavigatorDetailCardProps) {
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator.is_active ? navigator.navigator_address : undefined,
  )
  const { address: userAddress, connected } = useWallet()

  const permLabel =
    navigator.permission_label ||
    NAVIGATOR_PERMISSION_LABELS[navigator.permission as NavigatorPermission] ||
    'unknown'
  const colorClass = PERMISSION_COLORS[permLabel] || 'bg-dao-surface text-dao-text-muted'
  const typeLabel = configResult ? NAVIGATOR_TYPE_LABELS[configResult.type] : undefined

  return (
    <Card>
      {/* Header: address, status, permission, type */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <AddressDisplay address={navigator.navigator_address} />
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                navigator.is_active
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
            >
              {navigator.is_active ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-dao-text-hint">Permission:</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colorClass}`}>
              {formatPermissionLabel(permLabel)}
            </span>
          </div>

          {typeLabel && (
            <p className="text-xs text-dao-text-hint mt-2">{typeLabel}</p>
          )}
          {configLoading && navigator.is_active && (
            <p className="text-xs text-dao-text-hint mt-2">Detecting navigator type...</p>
          )}
        </div>
      </div>

      {/* Interaction section -- only for active navigators with detected type */}
      {navigator.is_active && configResult && configResult.type === 'OnboarderNavigator' && (
        <OnboarderSection
          navigatorAddress={navigator.navigator_address}
          config={configResult.config}
          connected={connected}
        />
      )}
      {navigator.is_active && configResult && configResult.type === 'ERC20TributeNavigator' && (
        <ERC20TributeSection
          navigatorAddress={navigator.navigator_address}
          config={configResult.config}
          connected={connected}
        />
      )}
      {navigator.is_active && configResult && configResult.type === 'unknown' && (
        <div className="mt-4 pt-3 border-t border-dao-border">
          <p className="text-xs text-dao-text-hint">
            {navigator.permission >= 4
              ? 'This navigator can submit and process proposals on behalf of the DAO.'
              : navigator.permission >= 2
                ? 'This navigator can mint/burn shares and loot tokens.'
                : navigator.permission >= 1
                  ? 'This navigator has admin access to the DAO contract.'
                  : 'This navigator has no active permissions.'}
          </p>
        </div>
      )}
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OnboarderSection -- Multiplier or fixed-price onboarding
// ═══════════════════════════════════════════════════════════════════════════

function OnboarderSection({
  navigatorAddress,
  config,
  connected,
}: {
  navigatorAddress: string
  config: OnboarderNavigatorConfig
  connected: boolean
}) {
  const [amount, setAmount] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const amountBigInt = amount ? parseTokenAmount(amount) : 0n
  const isFixedPrice = config.mode === 'fixedPrice'

  const isValid = isFixedPrice
    ? amountBigInt > 0n && config.pricePerUnit > 0n && amountBigInt >= config.pricePerUnit
    : amountBigInt >= config.minTribute && amountBigInt > 0n

  // Preview math: multiplier uses basis points (10000 = 1x), fixed-price uses units
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

  const handleOnboard = async () => {
    if (!isValid) return
    setError(null)
    setSuccess(false)
    setIsOnboarding(true)
    try {
      await navigatorService.onboarderOnboard(navigatorAddress, amountBigInt)
      setAmount('')
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onboarding failed')
    } finally {
      setIsOnboarding(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-dao-border space-y-4">
      <h4 className="text-sm font-semibold text-dao-text">Join DAO</h4>

      {/* Paused banner */}
      {config.paused && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400">This navigator is currently paused.</p>
        </div>
      )}

      {isExpired && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">This onboarding period has expired.</p>
        </div>
      )}

      {mintCapReached && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">Mint cap has been reached.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {isFixedPrice ? (
          <>
            <div>
              <p className="text-dao-text-hint">Price per Unit</p>
              <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.pricePerUnit)} QUAI</p>
            </div>
            <div>
              <p className="text-dao-text-hint">Shares per Unit</p>
              <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.sharesPerUnit)}</p>
            </div>
            {config.lootPerUnit > 0n && (
              <div>
                <p className="text-dao-text-hint">Loot per Unit</p>
                <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.lootPerUnit)}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="text-dao-text-hint">Min Tribute</p>
              <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.minTribute)} QUAI</p>
            </div>
            <div>
              <p className="text-dao-text-hint">Shares per QUAI</p>
              <p className="font-mono text-dao-text-secondary">
                {(Number(config.shareMultiplier) / 10000).toFixed(2)}x
              </p>
            </div>
            {config.lootMultiplier > 0n && (
              <div>
                <p className="text-dao-text-hint">Loot per QUAI</p>
                <p className="font-mono text-dao-text-secondary">
                  {(Number(config.lootMultiplier) / 10000).toFixed(2)}x
                </p>
              </div>
            )}
          </>
        )}

        {/* Mint cap progress */}
        {config.mintCap > 0n && (
          <div>
            <p className="text-dao-text-hint">Mint Cap</p>
            <p className="font-mono text-dao-text-secondary">
              {formatTokenAmount(config.totalMinted)} / {formatTokenAmount(config.mintCap)}
            </p>
          </div>
        )}

        {/* Per-address cap */}
        {config.perAddressCap > 0n && (
          <div>
            <p className="text-dao-text-hint">Per-Address Cap</p>
            <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.perAddressCap)}</p>
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

      {!isExpired && !config.paused && !mintCapReached && (
        <>
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
            />
            {amount && !isValid && (
              <p className="text-xs text-red-400 mt-1">
                {isFixedPrice
                  ? `Minimum is ${formatTokenAmount(config.pricePerUnit)} QUAI (1 unit)`
                  : `Minimum tribute is ${formatTokenAmount(config.minTribute)} QUAI`}
              </p>
            )}
          </div>

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

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">Successfully onboarded!</p>}

          {!connected ? (
            <p className="text-sm text-dao-text-hint text-center py-2">Connect wallet to join</p>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleOnboard}
              loading={isOnboarding}
              disabled={!isValid}
            >
              Join DAO
            </Button>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ERC20TributeSection -- ERC20 token tribute for shares/loot
// ═══════════════════════════════════════════════════════════════════════════

function ERC20TributeSection({
  navigatorAddress,
  config,
  connected,
}: {
  navigatorAddress: string
  config: ERC20TributeNavigatorConfig
  connected: boolean
}) {
  const [sharesToMint, setSharestoMint] = useState('')
  const [lootToMint, setLootToMint] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const sharesBigInt = sharesToMint ? parseTokenAmount(sharesToMint) : 0n
  const lootBigInt = lootToMint ? parseTokenAmount(lootToMint) : 0n
  const isValid = sharesBigInt > 0n || lootBigInt > 0n

  // Calculate tribute cost
  const tributeCost = navigatorService.calculateERC20TributeCost(
    sharesBigInt,
    lootBigInt,
    config.pricePerShare,
    config.pricePerLoot,
  )

  const isExpired = config.expiry > 0n && BigInt(Math.floor(Date.now() / 1000)) > config.expiry
  const mintCapReached = config.mintCap > 0n && config.totalMinted >= config.mintCap

  const handleOnboard = async () => {
    if (!isValid) return
    setError(null)
    setSuccess(false)
    setIsOnboarding(true)
    try {
      await navigatorService.erc20TributeOnboard(navigatorAddress, sharesBigInt, lootBigInt)
      setSharestoMint('')
      setLootToMint('')
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onboarding failed')
    } finally {
      setIsOnboarding(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-dao-border space-y-4">
      <h4 className="text-sm font-semibold text-dao-text">Join DAO (ERC20 Tribute)</h4>

      {/* Paused banner */}
      {config.paused && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400">This navigator is currently paused.</p>
        </div>
      )}

      {isExpired && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">This onboarding period has expired.</p>
        </div>
      )}

      {mintCapReached && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">Mint cap has been reached.</p>
        </div>
      )}

      {/* Tribute token info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-dao-text-hint">Tribute Token</p>
          <p className="font-mono text-dao-text-secondary">
            {config.tributeTokenSymbol}{' '}
            <span className="text-xs text-dao-text-hint">({config.tributeTokenDecimals} decimals)</span>
          </p>
        </div>
        <div>
          <p className="text-dao-text-hint">Price per Share</p>
          <p className="font-mono text-dao-text-secondary">
            {formatTokenAmount(config.pricePerShare, config.tributeTokenDecimals)}{' '}
            {config.tributeTokenSymbol}
          </p>
        </div>
        {config.pricePerLoot > 0n && (
          <div>
            <p className="text-dao-text-hint">Price per Loot</p>
            <p className="font-mono text-dao-text-secondary">
              {formatTokenAmount(config.pricePerLoot, config.tributeTokenDecimals)}{' '}
              {config.tributeTokenSymbol}
            </p>
          </div>
        )}

        {/* Mint cap progress */}
        {config.mintCap > 0n && (
          <div>
            <p className="text-dao-text-hint">Mint Cap</p>
            <p className="font-mono text-dao-text-secondary">
              {formatTokenAmount(config.totalMinted)} / {formatTokenAmount(config.mintCap)}
            </p>
          </div>
        )}

        {/* Per-address cap */}
        {config.perAddressCap > 0n && (
          <div>
            <p className="text-dao-text-hint">Per-Address Cap</p>
            <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.perAddressCap)}</p>
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

      {!isExpired && !config.paused && !mintCapReached && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`erc20-shares-${navigatorAddress}`}
                className="block text-sm font-medium text-dao-text-secondary mb-1.5"
              >
                Shares to Mint
              </label>
              <input
                id={`erc20-shares-${navigatorAddress}`}
                type="text"
                value={sharesToMint}
                onChange={(e) => {
                  if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                    setSharestoMint(e.target.value)
                    setError(null)
                    setSuccess(false)
                  }
                }}
                placeholder="0"
                className="input w-full font-mono"
                disabled={isOnboarding || !connected}
              />
            </div>
            {config.pricePerLoot > 0n && (
              <div>
                <label
                  htmlFor={`erc20-loot-${navigatorAddress}`}
                  className="block text-sm font-medium text-dao-text-secondary mb-1.5"
                >
                  Loot to Mint
                </label>
                <input
                  id={`erc20-loot-${navigatorAddress}`}
                  type="text"
                  value={lootToMint}
                  onChange={(e) => {
                    if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                      setLootToMint(e.target.value)
                      setError(null)
                      setSuccess(false)
                    }
                  }}
                  placeholder="0"
                  className="input w-full font-mono"
                  disabled={isOnboarding || !connected}
                />
              </div>
            )}
          </div>

          {!isValid && (sharesToMint || lootToMint) && (
            <p className="text-xs text-red-400">Enter at least some shares or loot to mint</p>
          )}

          {isValid && tributeCost > 0n && (
            <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-dao-text-secondary mb-1">Tribute cost:</p>
              <p className="font-mono text-primary-400 text-sm">
                {formatTokenAmount(tributeCost, config.tributeTokenDecimals)}{' '}
                {config.tributeTokenSymbol}
              </p>
              <p className="text-xs text-dao-text-hint mt-1">
                You will be prompted to approve the token spend, then onboard.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">Successfully onboarded!</p>}

          {!connected ? (
            <p className="text-sm text-dao-text-hint text-center py-2">Connect wallet to join</p>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleOnboard}
              loading={isOnboarding}
              disabled={!isValid}
            >
              Approve &amp; Join DAO
            </Button>
          )}
        </>
      )}
    </div>
  )
}
