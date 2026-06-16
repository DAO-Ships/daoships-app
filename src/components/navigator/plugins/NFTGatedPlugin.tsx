import { useState, useEffect, useCallback } from 'react'
import { quais } from 'quais'
import type { NavigatorPluginProps } from './index'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { navigatorService } from '@/services/core/NavigatorService'
import { baseService } from '@/services/core/BaseService'
import type { NFTGatedNavigatorConfig } from '@/services/core/NavigatorService'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount } from '@/utils/format'
import { parseBigIntInput } from '@/utils/bigint'
import { useNavigatorAllowlist } from '@/hooks/useNavigatorAllowlist'
import { useMember } from '@/hooks/useMember'
import { isOpenAllowlist } from '@/utils/allowlist'
import { safeBigInt } from '@/utils/bigint'
import { addressesEqual } from '@/services/utils/AddressUtils'
import { MintCapProgress } from '@/components/navigator/MintCapProgress'
import { NavigatorAllowlistStatus } from '@/components/navigator/NavigatorAllowlistStatus'
import { ClaimedTokensGallery } from '@/components/navigator/ClaimedTokensGallery'
import { NavigatorAdminActions } from '@/components/navigator/NavigatorAdminActions'

// Minimal ERC-721 surface for the gate collection (untrusted external contract —
// every call site wraps these in try/catch). Includes the optional Enumerable +
// metadata extensions, probed defensively.
const ERC721_GATE_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

const ERC721_ENUMERABLE_INTERFACE_ID = '0x780e9d63'
// Cap auto-enumeration so a hostile/huge balanceOf can't hang the client.
const MAX_ENUMERATE = 24

// ═══════════════════════════════════════════════════════════════════════════
// NFTGatedPlugin - Claim membership by proving ERC-721 ownership
// ═══════════════════════════════════════════════════════════════════════════

/** Contract custom errors → user-friendly copy. */
const ERROR_MAP: Record<string, string> = {
  NotHolder: "You don't own this NFT (or it doesn't exist).",
  AlreadyClaimed: 'Membership has already been claimed for this NFT.',
  IncorrectTribute: 'Send exactly the required tribute amount.',
  NoTributeRequired: "This is a free claim — don't send QUAI.",
  MintCapExceeded: "This navigator's membership cap has been reached.",
  PerAddressCapExceeded: "You've reached the per-wallet claim limit.",
  NotAllowlisted: "Your wallet isn't on the allowlist.",
  IsPaused: 'Onboarding is currently paused.',
  Expired: 'The onboarding period has ended.',
}

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

export function NFTGatedPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator.is_active ? navigator.navigator_address : undefined,
  )
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

  if (configLoading) {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Loading navigator configuration...</p>
      </Card>
    )
  }

  if (!configResult || configResult.type !== 'NFTGatedNavigator') {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Unable to load NFT-Gated configuration.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <NFTGatedInteraction
        navigatorAddress={navigator.navigator_address}
        indexerPaused={navigator.paused}
        config={configResult.config}
        daoId={daoId}
        userAddress={userAddress}
        connected={connected}
      />
      <NavigatorAdminActions
        daoId={daoId}
        navigatorAddress={navigator.navigator_address}
        isPaused={navigator.paused}
        connected={connected}
        isMember={isMember}
        withdraw="none"
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// NFTGatedInteraction - Config display, token discovery, claim
// ═══════════════════════════════════════════════════════════════════════════

interface TokenCandidate {
  tokenId: bigint
  owned: boolean      // does the user currently own it?
  claimed: boolean    // has this tokenId ever been claimed?
  claimable: boolean  // canOnboard(): owned & !claimed & !paused & !expired
}

type DiscoveryState = 'idle' | 'loading' | 'enumerable' | 'manual' | 'error'

function NFTGatedInteraction({
  navigatorAddress,
  indexerPaused,
  config,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  indexerPaused: boolean
  config: NFTGatedNavigatorConfig
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const isPaused = indexerPaused || config.paused
  const isExpired = config.expiry > 0n && BigInt(Math.floor(Date.now() / 1000)) > config.expiry
  const mintCapReached = config.mintCap > 0n && config.totalMinted >= config.mintCap
  const tributeValue = config.requireTribute ? config.tributeAmount : 0n

  // Allowlist (composes on top of the gate)
  const allowlist = useNavigatorAllowlist(daoId, navigatorAddress, config.allowlistRoot)
  const hasAllowlist = !isOpenAllowlist(config.allowlistRoot)
  const userAllowlisted = !userAddress ? false : allowlist.checkAddress(userAddress)
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

  // Discovery + claim state
  const [discovery, setDiscovery] = useState<DiscoveryState>('idle')
  const [tokens, setTokens] = useState<TokenCandidate[]>([])
  const [truncated, setTruncated] = useState(false)
  const [gateMeta, setGateMeta] = useState<{ name?: string; symbol?: string }>({})
  const [mintedTo, setMintedTo] = useState<bigint>(0n)
  const [quaiBalance, setQuaiBalance] = useState<bigint | null>(null)

  // Manual tokenId entry (non-enumerable collections or "check another")
  const [manualId, setManualId] = useState('')
  const [manualToken, setManualToken] = useState<TokenCandidate | null>(null)
  const [manualChecking, setManualChecking] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  // Submit state
  const [claimingId, setClaimingId] = useState<bigint | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<bigint | null>(null)

  const canRead = connected && baseService.hasProvider() && !!userAddress
  const perAddressCapReached = config.perAddressCap > 0n && mintedTo >= config.perAddressCap

  // Preflight one token: [canOnboard, claimed]; ownership is folded into canOnboard
  // for the enumerable path (we already know it's owned). Never throws.
  const preflightToken = useCallback(
    async (tokenId: bigint, owned: boolean): Promise<TokenCandidate> => {
      const [claimable, claimed] = await Promise.all([
        navigatorService.nftGatedCanOnboard(navigatorAddress, userAddress!, tokenId).catch(() => false),
        navigatorService.nftGatedClaimed(navigatorAddress, tokenId).catch(() => false),
      ])
      return { tokenId, owned, claimed, claimable }
    },
    [navigatorAddress, userAddress],
  )

  // Auto-discover owned tokens (enumerable collections only). Connected-only.
  useEffect(() => {
    if (!canRead) {
      setDiscovery('idle')
      setTokens([])
      return
    }
    let cancelled = false

    async function discover() {
      setDiscovery('loading')
      setTruncated(false)
      const provider = baseService.getProvider()
      const gate = new quais.Contract(config.gateToken, ERC721_GATE_ABI, provider)

      // Best-effort gate metadata (hostile gates may revert — ignore).
      Promise.all([
        gate.name().catch(() => undefined),
        gate.symbol().catch(() => undefined),
      ]).then(([name, symbol]) => {
        if (!cancelled) setGateMeta({ name: name as string | undefined, symbol: symbol as string | undefined })
      })

      // Is the collection enumerable? A lying supportsInterface is caught by the
      // tokenOfOwnerByIndex try/catch below (we fall back to manual entry).
      let enumerable = false
      try {
        enumerable = await gate.supportsInterface(ERC721_ENUMERABLE_INTERFACE_ID)
      } catch {
        enumerable = false
      }

      if (!enumerable) {
        if (!cancelled) { setTokens([]); setDiscovery('manual') }
        return
      }

      try {
        const balance = BigInt(await gate.balanceOf(quais.getAddress(userAddress!)))
        const count = balance > BigInt(MAX_ENUMERATE) ? MAX_ENUMERATE : Number(balance)
        if (balance > BigInt(MAX_ENUMERATE) && !cancelled) setTruncated(true)

        const ids = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            gate.tokenOfOwnerByIndex(quais.getAddress(userAddress!), i).then((t: unknown) => BigInt(t as bigint)),
          ),
        )
        const candidates = await Promise.all(ids.map((id) => preflightToken(id, true)))
        if (!cancelled) { setTokens(candidates); setDiscovery('enumerable') }
      } catch (e) {
        // Enumeration failed (lying supportsInterface, gas grief, non-standard) →
        // degrade to manual entry rather than dead-ending the page.
        console.warn('[NFTGatedPlugin] Token enumeration failed, falling back to manual:', e)
        if (!cancelled) { setTokens([]); setDiscovery('manual') }
      }
    }

    discover()
    return () => { cancelled = true }
  }, [canRead, config.gateToken, userAddress, successId, preflightToken])

  // Native balance (tribute mode only) + per-address minted
  useEffect(() => {
    if (!canRead) return
    if (config.requireTribute) {
      baseService.getProvider().getBalance(quais.getAddress(userAddress!))
        .then((b) => setQuaiBalance(BigInt(b)))
        .catch(() => {})
    }
    if (config.perAddressCap > 0n) {
      navigatorService.getNFTGatedMintedTo(navigatorAddress, userAddress!).then(setMintedTo).catch(() => {})
    }
  }, [canRead, navigatorAddress, userAddress, config.requireTribute, config.perAddressCap, successId])

  const checkManual = useCallback(async () => {
    setManualError(null)
    setManualToken(null)
    let tokenId: bigint
    try {
      tokenId = parseBigIntInput(manualId)
    } catch {
      setManualError('Enter a valid token ID (a non-negative whole number).')
      return
    }
    if (!canRead) return
    setManualChecking(true)
    try {
      const gate = new quais.Contract(config.gateToken, ERC721_GATE_ABI, baseService.getProvider())
      let owned = false
      try {
        const owner = (await gate.ownerOf(tokenId)) as string
        owned = addressesEqual(owner, userAddress)
      } catch {
        owned = false // token doesn't exist or gate reverted
      }
      const candidate = await preflightToken(tokenId, owned)
      setManualToken(candidate)
    } catch (e) {
      setManualError(mapError(e))
    } finally {
      setManualChecking(false)
    }
  }, [manualId, canRead, config.gateToken, userAddress, preflightToken])

  const handleClaim = useCallback(async (tokenId: bigint) => {
    setError(null)
    setSuccessId(null)
    setClaimingId(tokenId)
    try {
      // Pre-submit re-check: state can change between preflight and submit.
      const fresh = await navigatorService.getNFTGatedConfig(navigatorAddress)
      if (fresh.paused) { setError('This navigator has been paused since you loaded the page.'); return }
      const now = BigInt(Math.floor(Date.now() / 1000))
      if (fresh.expiry > 0n && now > fresh.expiry) { setError('This onboarding period has expired.'); return }
      if (fresh.mintCap > 0n && fresh.totalMinted >= fresh.mintCap) { setError('The mint cap has been reached.'); return }

      // Per-token race: token could have been claimed by someone else, or moved.
      const [alreadyClaimed, owner] = await Promise.all([
        navigatorService.nftGatedClaimed(navigatorAddress, tokenId),
        new quais.Contract(config.gateToken, ERC721_GATE_ABI, baseService.getProvider())
          .ownerOf(tokenId).then((o: unknown) => String(o)).catch(() => ''),
      ])
      if (alreadyClaimed) { setError(`Token #${tokenId} was just claimed by someone else.`); return }
      if (!addressesEqual(owner, userAddress)) {
        setError(`You no longer own token #${tokenId}.`); return
      }

      // Allowlist: choose the overload from the on-chain root (audit M-04).
      let proof: string[] | null = null
      if (hasAllowlist) {
        const p = userAddress ? allowlist.getProof(userAddress) : null
        if (!p) { setError("Your wallet isn't on the allowlist (or allowlist data is unavailable)."); return }
        proof = p
      }

      // Exact tribute, read from on-chain config verbatim (no decimal math).
      const value = fresh.requireTribute ? fresh.tributeAmount : 0n
      await navigatorService.nftGatedOnboard(navigatorAddress, tokenId, value, proof)
      setSuccessId(tokenId)
      setManualToken(null)
      setManualId('')
    } catch (e) {
      setError(mapError(e))
    } finally {
      setClaimingId(null)
    }
  }, [navigatorAddress, config.gateToken, userAddress, hasAllowlist, allowlist])

  const claimBlocked = isPaused || isExpired || mintCapReached || perAddressCapReached ||
    (hasAllowlist && !userAllowlisted)

  const insufficientTribute = config.requireTribute && quaiBalance !== null && quaiBalance < tributeValue

  return (
    <div className="space-y-5">
      {/* Status banners */}
      {isPaused && (
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
        {/* Gate collection */}
        <div className="mb-4 pb-4 border-b border-dao-border text-sm">
          <p className="text-dao-text-hint text-xs mb-0.5">Gate Collection (ERC-721)</p>
          {(gateMeta.name || gateMeta.symbol) && (
            <p className="font-medium text-dao-text-secondary">
              {gateMeta.name}
              {gateMeta.symbol && <span className="text-xs text-dao-text-hint ml-1.5">({gateMeta.symbol})</span>}
            </p>
          )}
          <div className="mt-1">
            <AddressDisplay address={config.gateToken} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Shares per Claim</p>
            <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.sharesPerHolder)}</p>
          </div>
          {config.lootPerHolder > 0n && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Loot per Claim</p>
              <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.lootPerHolder)}</p>
            </div>
          )}
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Claim Cost</p>
            <p className="font-mono text-dao-text-secondary">
              {config.requireTribute ? `${formatTokenAmount(tributeValue)} QUAI` : 'Free'}
            </p>
          </div>
          {config.expiry > 0n && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Expiry</p>
              <p className="font-mono text-dao-text-secondary">
                {isExpired ? <span className="text-red-400">Expired</span>
                  : new Date(Number(config.expiry) * 1000).toLocaleDateString()}
              </p>
            </div>
          )}
          {config.perAddressCap > 0n && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Per-Wallet Cap</p>
              <p className="font-mono text-dao-text-secondary">{formatTokenAmount(config.perAddressCap)}</p>
            </div>
          )}
        </div>

        <MintCapProgress mintCap={config.mintCap} totalMinted={config.totalMinted} />

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

        {/* Claim-ticket caveat — surface before claiming */}
        <div className="mt-4 pt-3 border-t border-dao-border">
          <p className="text-xs text-dao-text-hint">
            Membership is a <strong>one-time claim ticket per NFT</strong>. Each token can be claimed
            exactly once, ever. If you sell the NFT after claiming, you keep the shares and the buyer
            gets nothing.
          </p>
        </div>
      </Card>

      {/* Allowlist status */}
      <NavigatorAllowlistStatus
        allowlist={allowlist}
        allowlistRoot={config.allowlistRoot}
        userAddress={userAddress}
        isMember={isMember}
        daoId={daoId}
        navigatorAddress={navigatorAddress}
      />

      {/* Claim section */}
      {!claimBlocked && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Claim Membership</h3>}>
          <div className="space-y-4">
            {!connected ? (
              <p className="text-sm text-dao-text-hint text-center py-2">Connect your wallet to check your NFTs.</p>
            ) : (
              <>
                {config.requireTribute && quaiBalance !== null && (
                  <p className={`text-xs ${insufficientTribute ? 'text-red-400' : 'text-dao-text-hint'}`}>
                    Claim cost {formatTokenAmount(tributeValue)} QUAI · Your balance {formatTokenAmount(quaiBalance)} QUAI
                  </p>
                )}

                {/* Auto-discovered tokens (enumerable collections) */}
                {discovery === 'loading' && (
                  <p className="text-sm text-dao-text-hint">Looking up your NFTs…</p>
                )}
                {discovery === 'enumerable' && tokens.length === 0 && (
                  <p className="text-sm text-dao-text-hint">
                    You don't own any NFTs from this collection.
                  </p>
                )}
                {tokens.map((t) => (
                  <TokenClaimRow
                    key={t.tokenId.toString()}
                    token={t}
                    requireTribute={config.requireTribute}
                    insufficientTribute={insufficientTribute}
                    claiming={claimingId === t.tokenId}
                    onClaim={() => handleClaim(t.tokenId)}
                  />
                ))}
                {truncated && (
                  <p className="text-xs text-dao-text-hint">
                    Showing your first {MAX_ENUMERATE} tokens. Enter a specific token ID below to check others.
                  </p>
                )}

                {/* Manual tokenId entry (non-enumerable, or check another) */}
                <div className="pt-2 border-t border-dao-border space-y-2">
                  <label htmlFor={`nft-manual-${navigatorAddress}`} className="block text-sm font-medium text-dao-text-secondary">
                    {discovery === 'manual'
                      ? "This collection doesn't support automatic listing — enter a token ID you own."
                      : 'Check a specific token ID'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`nft-manual-${navigatorAddress}`}
                      type="text"
                      inputMode="numeric"
                      value={manualId}
                      onChange={(e) => {
                        if (e.target.value === '' || /^\d*$/.test(e.target.value)) {
                          setManualId(e.target.value)
                          setManualError(null)
                        }
                      }}
                      placeholder="Token ID"
                      className="input flex-1 font-mono"
                      disabled={manualChecking}
                    />
                    <Button variant="secondary" onClick={checkManual} loading={manualChecking} disabled={!manualId}>
                      Check
                    </Button>
                  </div>
                  {manualError && <p className="text-xs text-red-400">{manualError}</p>}
                  {manualToken && (
                    <TokenClaimRow
                      token={manualToken}
                      requireTribute={config.requireTribute}
                      insufficientTribute={insufficientTribute}
                      claiming={claimingId === manualToken.tokenId}
                      onClaim={() => handleClaim(manualToken.tokenId)}
                    />
                  )}
                </div>

                {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
                {successId !== null && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
                    <p className="text-sm text-emerald-400 font-medium" role="status">
                      Membership claimed for #{successId.toString()}.
                    </p>
                    <p className="text-xs text-dao-text-muted mt-1">
                      These shares are yours permanently — even if you sell the NFT.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {/* Claimed tokens gallery */}
      <ClaimedTokensGallery daoId={daoId} navigatorAddress={navigatorAddress} gateToken={config.gateToken} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TokenClaimRow - One owned/checked token with its claim status + action
// ═══════════════════════════════════════════════════════════════════════════

function TokenClaimRow({
  token,
  requireTribute,
  insufficientTribute,
  claiming,
  onClaim,
}: {
  token: TokenCandidate
  requireTribute: boolean
  insufficientTribute: boolean
  claiming: boolean
  onClaim: () => void
}) {
  const { tokenId, owned, claimed, claimable } = token

  return (
    <div className="flex items-center justify-between gap-3 bg-dao-dark-3 rounded-lg px-4 py-3">
      <div className="min-w-0">
        <p className="font-mono text-sm text-dao-text-secondary">#{tokenId.toString()}</p>
        {claimed ? (
          <p className="text-xs text-amber-400">
            {owned
              ? 'Already claimed (by a previous holder) — owning it now grants no shares.'
              : 'Membership already claimed for this NFT.'}
          </p>
        ) : !owned ? (
          <p className="text-xs text-red-400">You don't currently own this token.</p>
        ) : claimable ? (
          <p className="text-xs text-emerald-400">Claimable</p>
        ) : (
          <p className="text-xs text-dao-text-hint">Not currently claimable.</p>
        )}
      </div>
      {owned && !claimed && (
        <Button
          variant="primary"
          size="sm"
          onClick={onClaim}
          loading={claiming}
          disabled={!claimable || (requireTribute && insufficientTribute)}
        >
          {requireTribute && insufficientTribute ? 'Insufficient Balance' : 'Claim'}
        </Button>
      )}
    </div>
  )
}
