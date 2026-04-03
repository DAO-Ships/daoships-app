import { useState, useEffect, useCallback } from 'react'
import { quais } from 'quais'
import type { NavigatorPluginProps } from './index'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { navigatorService } from '@/services/core/NavigatorService'
import { baseService } from '@/services/core/BaseService'
import type { ERC20TributeNavigatorConfig } from '@/services/core/NavigatorService'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { useNavigatorAllowlist } from '@/hooks/useNavigatorAllowlist'
import { useMember } from '@/hooks/useMember'
import { isOpenAllowlist } from '@/utils/allowlist'
import { safeBigInt } from '@/utils/bigint'
import { AllowlistDownloadButton, AllowlistRestore } from '@/components/navigator/AllowlistActions'

const ERC20_BALANCE_ABI = [
  'function balanceOf(address account) view returns (uint256)',
]

// ═══════════════════════════════════════════════════════════════════════════
// ERC20TributePlugin - ERC20 token tribute for shares/loot
// ═══════════════════════════════════════════════════════════════════════════

/** Known revert reasons mapped to user-friendly messages */
const ERROR_MAP: Record<string, string> = {
  'ERC20TributeNavigator: paused': 'This navigator is currently paused by the DAO.',
  'ERC20TributeNavigator: expired': 'The onboarding period has expired.',
  'ERC20TributeNavigator: mint cap reached': 'The total mint cap has been reached.',
  'ERC20TributeNavigator: per-address cap reached': 'You have reached the per-address mint cap.',
  'ERC20TributeNavigator: not allowlisted': 'Your address is not on the allowlist.',
  'ERC20TributeNavigator: zero tribute': 'Tribute amount is zero.',
  'ERC20: insufficient allowance': 'Insufficient token allowance. Please approve the token spend first.',
  'ERC20: transfer amount exceeds balance': 'Insufficient token balance.',
}

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

export function ERC20TributePlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
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

  if (!configResult || configResult.type !== 'ERC20TributeNavigator') {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Unable to load ERC20 Tribute configuration.</p>
      </Card>
    )
  }

  return (
    <ERC20TributeInteraction
      navigatorAddress={navigator.navigator_address}
      config={configResult.config}
      daoId={daoId}
      userAddress={userAddress}
      connected={connected}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ERC20TributeInteraction - Config display + approve/onboard form
// ═══════════════════════════════════════════════════════════════════════════

function ERC20TributeInteraction({
  navigatorAddress,
  config,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: ERC20TributeNavigatorConfig
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const [sharesToMint, setSharesToMint] = useState('')
  const [lootToMint, setLootToMint] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [mintedTo, setMintedTo] = useState<bigint>(0n)
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null)
  const [supportsPermit, setSupportsPermit] = useState(false)

  // Allowlist
  const allowlist = useNavigatorAllowlist(daoId, navigatorAddress, config.allowlistRoot)
  const userAllowlisted = !userAddress ? false : allowlist.checkAddress(userAddress)
  const hasAllowlist = !isOpenAllowlist(config.allowlistRoot)
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

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

  // Check for truncation (integer division can lose remainder)
  const hasShareTruncation =
    isValid &&
    sharesBigInt > 0n &&
    config.pricePerShare > 0n &&
    (sharesBigInt * config.pricePerShare) % (10n ** 18n) !== 0n

  const hasLootTruncation =
    isValid &&
    lootBigInt > 0n &&
    config.pricePerLoot > 0n &&
    (lootBigInt * config.pricePerLoot) % (10n ** 18n) !== 0n

  const insufficientBalance = tokenBalance !== null && tributeCost > 0n && tributeCost > tokenBalance

  const isExpired = config.expiry > 0n && BigInt(Math.floor(Date.now() / 1000)) > config.expiry
  const mintCapReached = config.mintCap > 0n && config.totalMinted >= config.mintCap

  const mintCapPercent =
    config.mintCap > 0n
      ? Number((config.totalMinted * 10000n) / config.mintCap) / 100
      : 0

  // Fetch tribute token balance and detect permit support
  useEffect(() => {
    if (!userAddress || !config.tributeToken || !baseService.hasProvider()) return
    const provider = baseService.getProvider()
    const checksummed = quais.getAddress(userAddress!)

    // Balance
    const token = new quais.Contract(config.tributeToken, ERC20_BALANCE_ABI, provider)
    token.balanceOf(checksummed).then((bal: bigint) => setTokenBalance(BigInt(bal))).catch((err: unknown) => {
      console.warn('[ERC20TributePlugin] Failed to fetch token balance:', err)
    })

    // Permit support: probe nonces()
    const permitProbe = new quais.Contract(
      config.tributeToken,
      ['function nonces(address owner) view returns (uint256)'],
      provider,
    )
    permitProbe.nonces(checksummed).then(() => setSupportsPermit(true)).catch(() => setSupportsPermit(false))

  }, [userAddress, config.tributeToken, success, connected])

  // Fetch per-address minted amount
  useEffect(() => {
    if (!userAddress || config.perAddressCap === 0n) return
    navigatorService.getERC20TributeMintedTo(navigatorAddress, userAddress).then(setMintedTo).catch(() => {})
  }, [navigatorAddress, userAddress, config.perAddressCap])

  const handleOnboard = useCallback(async () => {
    if (!isValid) return
    setError(null)
    setSuccess(false)
    setIsOnboarding(true)
    try {
      // Pre-submit checks
      const freshConfig = await navigatorService.getERC20TributeConfig(navigatorAddress)
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

      const proof = hasAllowlist && userAddress ? (allowlist.getProof(userAddress) ?? []) : []
      await navigatorService.erc20TributeOnboard(navigatorAddress, sharesBigInt, lootBigInt, proof)
      setSharesToMint('')
      setLootToMint('')
      setSuccess(true)
    } catch (e: unknown) {
      setError(mapError(e))
    } finally {
      setIsOnboarding(false)
    }
  }, [isValid, navigatorAddress, sharesBigInt, lootBigInt])

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
        {/* Tribute token info */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-dao-border text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-dao-text-hint text-xs mb-0.5">Tribute Token</p>
            <p className="font-medium text-dao-text-secondary">
              {config.tributeTokenSymbol}
              <span className="text-xs text-dao-text-hint ml-1.5">({config.tributeTokenDecimals} decimals)</span>
            </p>
            <div className="mt-1">
              <AddressDisplay address={config.tributeToken} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Price per Share</p>
            <p className="font-mono text-dao-text-secondary">
              {formatTokenAmount(config.pricePerShare, config.tributeTokenDecimals)}{' '}
              {config.tributeTokenSymbol}
            </p>
          </div>
          {config.pricePerLoot > 0n && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Price per Loot</p>
              <p className="font-mono text-dao-text-secondary">
                {formatTokenAmount(config.pricePerLoot, config.tributeTokenDecimals)}{' '}
                {config.tributeTokenSymbol}
              </p>
            </div>
          )}

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

      {/* Allowlist status */}
      {hasAllowlist && (
        <div className={`rounded-lg px-4 py-3 space-y-2 ${
          allowlist.dataUnavailable
            ? 'bg-amber-500/10 border border-amber-500/30'
            : userAddress && userAllowlisted
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : userAddress
                ? 'bg-red-500/10 border border-red-500/30'
                : 'bg-primary-500/10 border border-primary-500/30'
        }`}>
          {allowlist.dataUnavailable ? (
            <>
              <p className="text-sm text-amber-400">Allowlist data unavailable. Proofs cannot be generated.</p>
              {isMember && <AllowlistRestore daoId={daoId} navigatorAddress={navigatorAddress} allowlistRoot={config.allowlistRoot} />}
            </>
          ) : (
            <>
              {userAddress && userAllowlisted ? (
                <p className="text-sm text-emerald-400">Your address is on the allowlist ({allowlist.addressCount} addresses).</p>
              ) : userAddress ? (
                <p className="text-sm text-red-400">Your address is not on the allowlist for this navigator.</p>
              ) : (
                <p className="text-sm text-primary-400">This navigator has an allowlist ({allowlist.addressCount} addresses). Connect your wallet to check eligibility.</p>
              )}
              {isMember && allowlist.treeDump && (
                <AllowlistDownloadButton navigatorAddress={navigatorAddress} root={config.allowlistRoot} addresses={allowlist.addresses} treeDump={allowlist.treeDump} />
              )}
            </>
          )}
        </div>
      )}

      {/* Onboard form */}
      {!isExpired && !config.paused && !mintCapReached && (!hasAllowlist || userAllowlisted) && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Join DAO (ERC20 Tribute)</h3>}>
          <div className="space-y-4">
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
                      setSharesToMint(e.target.value)
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

            {insufficientBalance && (
              <p className="text-xs text-red-400">
                Insufficient {config.tributeTokenSymbol} balance. You have{' '}
                {formatTokenAmount(tokenBalance!, config.tributeTokenDecimals)} {config.tributeTokenSymbol}.
              </p>
            )}
            {tokenBalance !== null && connected && (
              <p className="text-xs text-dao-text-hint">
                Your Balance: {formatTokenAmount(tokenBalance, config.tributeTokenDecimals)} {config.tributeTokenSymbol}
              </p>
            )}

            {!isValid && (sharesToMint || lootToMint) && (
              <p className="text-xs text-red-400">Enter at least some shares or loot to mint</p>
            )}

            {/* Tribute cost preview */}
            {isValid && tributeCost === -1n && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400 font-medium">Amount too small</p>
                <p className="text-xs text-dao-text-muted mt-1">
                  The requested mint amount is too small and would result in zero tribute cost
                  after integer division. Increase the number of shares or loot to mint.
                </p>
              </div>
            )}
            {isValid && tributeCost > 0n && (
              <div className={`rounded-lg px-4 py-3 ${
                insufficientBalance
                  ? 'bg-red-500/10 border border-red-500/30'
                  : 'bg-accent-500/10 border border-accent-500/30'
              }`}>
                <p className="text-sm text-dao-text-secondary mb-1">Tribute cost:</p>
                <p className="font-mono text-primary-400 text-sm">
                  {formatTokenAmount(tributeCost, config.tributeTokenDecimals)}{' '}
                  {config.tributeTokenSymbol}
                </p>
                {insufficientBalance && (
                  <p className="text-xs text-red-400 mt-1">
                    Insufficient balance. You have{' '}
                    {formatTokenAmount(tokenBalance!, config.tributeTokenDecimals)}{' '}
                    {config.tributeTokenSymbol}.
                  </p>
                )}
                {(hasShareTruncation || hasLootTruncation) && (
                  <p className="text-xs text-amber-400 mt-1">
                    Note: Integer division may cause a small amount of truncation in the cost calculation.
                  </p>
                )}
                {!insufficientBalance && (
                  <p className="text-xs text-dao-text-hint mt-1">
                    {supportsPermit
                      ? 'You will be prompted to sign a permit, then onboard in a single transaction.'
                      : 'You will be prompted to approve the token spend, then onboard.'}
                  </p>
                )}
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
                disabled={!isValid || tributeCost === -1n || insufficientBalance}
              >
                {insufficientBalance ? 'Insufficient Balance' : supportsPermit ? 'Sign & Join DAO' : 'Approve & Join DAO'}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
