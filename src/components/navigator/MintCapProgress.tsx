import { formatTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// MintCapProgress - Shared mint-cap progress bar for membership navigators
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders the "X / Y minted" progress bar shown inside a navigator's config card.
 * Returns null when there is no cap (mintCap === 0n → unlimited).
 *
 * Used by OnboarderPlugin, ERC20TributePlugin, and NFTGatedPlugin.
 */
export function MintCapProgress({
  mintCap,
  totalMinted,
}: {
  mintCap: bigint
  totalMinted: bigint
}) {
  if (mintCap <= 0n) return null

  const reached = totalMinted >= mintCap
  const percent = Number((totalMinted * 10000n) / mintCap) / 100

  return (
    <div className="mt-4 pt-3 border-t border-dao-border">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-dao-text-hint">Mint Cap Progress</span>
        <span className="font-mono text-dao-text-muted">
          {formatTokenAmount(totalMinted)} / {formatTokenAmount(mintCap)}
        </span>
      </div>
      <div className="w-full bg-dao-dark-3 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${reached ? 'bg-red-500' : 'bg-accent-500'}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-dao-text-hint mt-1">{percent.toFixed(1)}% minted</p>
    </div>
  )
}
