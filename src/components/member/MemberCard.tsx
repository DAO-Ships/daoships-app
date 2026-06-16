import type { Member } from '@/types'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { MemberAvatar } from './MemberAvatar'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'
import { formatTokenAmount } from '@/utils/format'
import { formatIndexerDate } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// MemberCard - Member address/profile, shares, loot, voting power
// ═══════════════════════════════════════════════════════════════════════════

interface MemberCardProps {
  member: Member
  daoId: string
  profile?: MemberProfile
}

export function MemberCard({ member, daoId: _daoId, profile }: MemberCardProps) {
  const shares = BigInt(member.shares || '0')
  const loot = BigInt(member.loot || '0')
  const votingPower = BigInt(member.voting_power || '0')
  const totalPower = shares + votingPower
  const delegatedShares = votingPower > 0n ? votingPower - shares : 0n

  return (
    <div className="card px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left side: Avatar + Name/Address + delegation info */}
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {/* Avatar */}
          <MemberAvatar avatar={profile?.avatar} size={9} />

          <div className="min-w-0">
            {/* Name / Address */}
            {profile?.name ? (
              <>
                <p className="text-sm font-medium text-dao-text truncate">{profile.name}</p>
                <p className="font-mono text-xs text-dao-text-hint truncate" title={member.member_address}>
                  {member.member_address.slice(0, 6)}...{member.member_address.slice(-4)}
                </p>
              </>
            ) : (
              <p className="font-mono text-sm text-dao-text truncate" title={member.member_address}>
                {member.member_address.slice(0, 6)}...{member.member_address.slice(-4)}
              </p>
            )}

            {/* Bio snippet */}
            {profile?.bio && (
              <p className="text-xs text-dao-text-muted mt-0.5 line-clamp-1">
                <SafeMarkdown>{profile.bio}</SafeMarkdown>
              </p>
            )}

            {/* Delegation info */}
            {member.delegating_to && member.delegating_to !== member.member_address && (
              <p className="text-xs text-dao-text-hint mt-1 truncate">
                Delegating to:{' '}
                <span className="font-mono text-accent-400" title={member.delegating_to}>
                  {member.delegating_to.slice(0, 6)}...{member.delegating_to.slice(-4)}
                </span>
              </p>
            )}

            {delegatedShares > 0n && (
              <p className="text-xs text-dao-text-hint mt-0.5">
                Received delegations: <span className="text-accent-400 font-mono">{formatTokenAmount(delegatedShares)}</span>
              </p>
            )}
          </div>
        </div>

        {/* Right side: Stats */}
        <div className="flex items-center gap-4 flex-shrink-0 text-right">
          <div>
            <p className="text-xs text-dao-text-hint">Shares</p>
            <p className="text-sm font-mono text-primary-400">{formatTokenAmount(shares)}</p>
          </div>
          <div>
            <p className="text-xs text-dao-text-hint">Loot</p>
            <p className="text-sm font-mono text-dao-text-secondary">{formatTokenAmount(loot)}</p>
          </div>
          <div>
            <p className="text-xs text-dao-text-hint">Voting Power</p>
            <p className="text-sm font-mono text-accent-400 font-semibold">{formatTokenAmount(totalPower)}</p>
          </div>
        </div>
      </div>

      {/* Activity info */}
      {member.last_activity_at && (
        <p className="text-xs text-dao-text-hint mt-2">
          Last active: {formatIndexerDate(member.last_activity_at)}
        </p>
      )}
    </div>
  )
}
