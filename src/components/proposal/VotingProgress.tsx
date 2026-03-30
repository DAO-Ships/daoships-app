import { formatTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// VotingProgress - Yes/No vote bar with quorum indicator
// ═══════════════════════════════════════════════════════════════════════════

interface VotingProgressProps {
  yesBalance: bigint
  noBalance: bigint
  quorumPercent: number
  totalShares: bigint
}

export function VotingProgress({
  yesBalance,
  noBalance,
  quorumPercent,
  totalShares,
}: VotingProgressProps) {
  const totalVoted = yesBalance + noBalance

  // Percentages of total voted
  const yesPercent = totalVoted > 0n
    ? Number((yesBalance * 10000n) / totalVoted) / 100
    : 0
  const noPercent = totalVoted > 0n
    ? Number((noBalance * 10000n) / totalVoted) / 100
    : 0

  // Quorum: percentage of total shares that voted yes
  // quorumPercent is stored as basis points (e.g. 500 = 5%)
  const quorumThreshold = quorumPercent / 100
  const currentQuorum = totalShares > 0n
    ? Number((yesBalance * 10000n) / totalShares) / 100
    : 0
  const quorumMet = currentQuorum >= quorumThreshold

  return (
    <div className="space-y-3">
      {/* Vote count labels */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-dao-text-secondary">
            Yes: <span className="font-mono text-green-400">{formatTokenAmount(yesBalance)}</span>
            <span className="text-dao-text-hint ml-1">({yesPercent.toFixed(1)}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-dao-text-secondary">
            No: <span className="font-mono text-red-400">{formatTokenAmount(noBalance)}</span>
            <span className="text-dao-text-hint ml-1">({noPercent.toFixed(1)}%)</span>
          </span>
          <span className="w-3 h-3 rounded-sm bg-red-500" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-4 bg-dao-dark-3 rounded-full overflow-hidden">
        {totalVoted > 0n ? (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-red-500 transition-all duration-500"
              style={{ width: `${noPercent}%` }}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-dao-text-hint">
            No votes yet
          </div>
        )}

        {/* Quorum indicator line */}
        {quorumThreshold > 0 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-yellow-400 z-10"
            style={{ left: `${Math.min(quorumThreshold, 100)}%` }}
            title={`Quorum: ${quorumThreshold}%`}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-yellow-400 whitespace-nowrap">
              Q
            </div>
          </div>
        )}
      </div>

      {/* Quorum status */}
      <div className="flex items-center justify-between text-xs">
        <span className={quorumMet ? 'text-green-400' : 'text-yellow-400'}>
          Quorum: {currentQuorum.toFixed(1)}% / {quorumThreshold}%
          {quorumMet ? ' (met)' : ' (not met)'}
        </span>
        <span className="text-dao-text-hint">
          Total voted: {formatTokenAmount(totalVoted)}
        </span>
      </div>
    </div>
  )
}
