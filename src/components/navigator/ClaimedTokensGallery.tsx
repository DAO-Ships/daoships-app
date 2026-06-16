import { useState } from 'react'
import { Card } from '@/components/common/Card'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount } from '@/utils/format'
import { resolveUrl } from '@/utils/url'
import { useNftClaims } from '@/hooks/useNftClaims'
import { useNftTokenImage } from '@/hooks/useNftTokenImage'
import { useMemberProfiles } from '@/hooks/useMemberProfile'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { safeBigInt } from '@/utils/bigint'

// ═══════════════════════════════════════════════════════════════════════════
// ClaimedTokensGallery - collapsible gallery of which gate tokens have been claimed
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A drop-down (collapsed by default) gallery of the per-token claim history for an
 * NFTGatedNavigator, sourced from the indexer (ds_nft_claims, realtime). Each entry pairs the
 * claimed tokenId with the claimer (enriched with their DAO member profile), and renders the
 * token's artwork via the public ipfs.io gateway when its metadata has one — falling back to a
 * numeric badge otherwise. Images load lazily, only once the gallery is expanded.
 *
 * `holder` is the claimer AT CLAIM TIME — the NFT may have moved since, so this is labeled
 * "claimed by", not "owner".
 */
export function ClaimedTokensGallery({
  daoId,
  navigatorAddress,
  gateToken,
}: {
  daoId: string
  navigatorAddress: string
  /** The gated ERC-721 collection — used to read each token's image via tokenURI. */
  gateToken?: string
}) {
  const { data: claims, isLoading } = useNftClaims(daoId, navigatorAddress)
  const { data: profiles } = useMemberProfiles(daoId)
  const [open, setOpen] = useState(false)

  const count = claims?.length ?? 0

  const header = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex items-center justify-between w-full gap-2"
      aria-expanded={open}
    >
      <span className="flex items-center gap-2">
        <svg
          aria-hidden="true"
          className={`w-4 h-4 text-dao-text-hint transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-dao-text">Claimed Tokens</span>
      </span>
      <span className="text-xs text-dao-text-hint font-mono">
        {isLoading ? '…' : `${count} claimed`}
      </span>
    </button>
  )

  return (
    <Card header={header}>
      {!open ? null : isLoading ? (
        <p className="text-sm text-dao-text-hint">Loading claims…</p>
      ) : count === 0 ? (
        <p className="text-sm text-dao-text-hint">No NFTs have been claimed yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {claims!.map((claim) => (
            <ClaimCard
              key={claim.id}
              gateToken={gateToken}
              tokenId={claim.token_id}
              holder={claim.holder}
              shares={claim.shares}
              loot={claim.loot}
              createdAt={claim.created_at}
              profile={profiles?.get(claim.holder.toLowerCase())}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function ClaimCard({
  gateToken,
  tokenId,
  holder,
  shares,
  loot,
  createdAt,
  profile,
}: {
  gateToken?: string
  tokenId: string
  holder: string
  shares: string
  loot: string
  createdAt: string
  profile?: MemberProfile
}) {
  const { data: imageUrl } = useNftTokenImage(gateToken, tokenId)
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!imageUrl && !imgFailed

  const avatarUrl = profile?.avatar ? resolveUrl(profile.avatar) : null
  const lootBig = safeBigInt(loot)

  return (
    <div className="flex items-start gap-3 bg-dao-dark-3 rounded-lg px-4 py-3">
      {/* Token artwork (ipfs.io) when available, else a numeric badge */}
      <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-dao-surface overflow-hidden flex items-center justify-center">
        {showImage ? (
          <img
            src={imageUrl!}
            alt={`Token #${tokenId}`}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="font-mono text-xs text-primary-400">#{tokenId}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Claimer */}
        <div className="flex items-center gap-2">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt=""
              className="w-5 h-5 rounded-full object-cover flex-shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
          {profile?.name ? (
            <span className="text-sm font-medium text-dao-text-secondary truncate">{profile.name}</span>
          ) : (
            <AddressDisplay address={holder} showExplorer={false} />
          )}
        </div>
        {profile?.name && (
          <div className="mt-0.5">
            <AddressDisplay address={holder} showCopy={false} prefixLen={6} suffixLen={4} />
          </div>
        )}

        {/* Token id + amounts + date */}
        <p className="text-xs text-dao-text-hint mt-1">
          <span className="font-mono text-dao-text-muted">#{tokenId}</span>
          {' · '}
          <span className="text-dao-text-muted font-mono">{formatTokenAmount(shares)}</span> shares
          {lootBig > 0n && (
            <>
              {' · '}
              <span className="text-dao-text-muted font-mono">{formatTokenAmount(loot)}</span> loot
            </>
          )}
          {' · '}
          {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
