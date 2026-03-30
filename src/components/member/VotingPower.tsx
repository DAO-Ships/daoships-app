import { formatTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// VotingPower - Display total voting power (own shares + delegated)
// ═══════════════════════════════════════════════════════════════════════════

interface VotingPowerProps {
  votes: bigint
  shares: bigint
}

export function VotingPower({ votes, shares }: VotingPowerProps) {
  const delegatedPower = votes > shares ? votes - shares : 0n
  const hasDelegations = delegatedPower > 0n

  return (
    <div className="card px-5 py-4">
      <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
        Voting Power
      </h3>

      {/* Total voting power */}
      <div className="text-center mb-4">
        <p className="text-3xl font-bold text-accent-400 font-mono">
          {formatTokenAmount(votes)}
        </p>
        <p className="text-xs text-dao-text-hint mt-1">Total Voting Power</p>
      </div>

      {/* Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-dao-text-muted">Own Shares</span>
          <span className="font-mono text-primary-400">{formatTokenAmount(shares)}</span>
        </div>
        {hasDelegations && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-dao-text-muted">Delegated to You</span>
            <span className="font-mono text-accent-400">+{formatTokenAmount(delegatedPower)}</span>
          </div>
        )}
      </div>

      {/* Visual bar */}
      {hasDelegations && votes > 0n && (
        <div className="mt-3 h-2 bg-dao-dark-3 rounded-full overflow-hidden flex">
          <div
            className="bg-primary-500 transition-all duration-500"
            style={{
              width: `${Number((shares * 100n) / votes)}%`,
            }}
          />
          <div
            className="bg-accent-500 transition-all duration-500"
            style={{
              width: `${Number((delegatedPower * 100n) / votes)}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}
