import type { Member } from '@/types'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { MemberAvatar } from './MemberAvatar'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'
import { formatTokenAmount } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'
import { safeHref } from '@/utils/url'
import { formatIndexerDate } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// DelegateCard - Expanded profile for members receiving delegations
// ═══════════════════════════════════════════════════════════════════════════

interface DelegateCardProps {
  member: Member
  profile?: MemberProfile
  /** Members who are delegating to this delegate */
  delegators: { member: Member; profile?: MemberProfile }[]
  /** Sum of all shares in the DAO, used for percentage calculation */
  totalShares: bigint
  /** Number of active proposals this member is sponsoring */
  sponsoredCount?: number
}

function formatPct(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '0'
  const bps = (numerator * 10000n) / denominator
  const whole = bps / 100n
  const frac = bps % 100n
  if (frac === 0n) return `${whole}`
  const fracStr = frac.toString().padStart(2, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

export function DelegateCard({ member, profile, delegators, totalShares, sponsoredCount = 0 }: DelegateCardProps) {
  const shares = safeBigInt(member.shares)
  const votingPower = safeBigInt(member.voting_power)
  const totalPower = votingPower > shares ? votingPower : shares
  const delegatedShares = totalPower > shares ? totalPower - shares : 0n
  const pct = formatPct(totalPower, totalShares)

  return (
    <div className="card px-5 py-4 space-y-4">
      {/* Header: Avatar + Identity */}
      <div className="flex items-start gap-4">
        <MemberAvatar avatar={profile?.avatar} size={14} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {profile?.name ? (
                <>
                  <p className="text-base font-semibold text-dao-text truncate">{profile.name}</p>
                  <AddressDisplay address={member.member_address} />
                </>
              ) : (
                <AddressDisplay address={member.member_address} />
              )}
              {profile?.bio && (
                <p className="text-sm text-dao-text-muted mt-1 line-clamp-2">
                  <SafeMarkdown>{profile.bio}</SafeMarkdown>
                </p>
              )}
            </div>

            {/* Voting power badge */}
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-dao-text-hint">Total Voting Power</p>
              <p className="text-lg font-bold font-mono text-accent-400">
                {formatTokenAmount(totalPower)}
              </p>
              <p className="text-sm font-mono text-accent-400/70">{pct}%</p>
            </div>
          </div>


          {/* Social links */}
          {profile?.links && Object.keys(profile.links).length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              {Object.entries(profile.links).map(([label, url]) => (
                <a
                  key={label}
                  href={safeHref(url)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-xs text-primary-400 hover:text-primary-300 transition-colors hover:underline"
                >
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 bg-dao-dark-2 rounded-lg p-3">
        <div className="text-center">
          <p className="text-xs text-dao-text-hint">Own Shares</p>
          <p className="text-sm font-mono text-primary-400 mt-0.5">
            <TokenAmount amount={member.shares} />
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dao-text-hint">Delegated</p>
          <p className="text-sm font-mono text-accent-400 mt-0.5">
            {delegatedShares > 0n ? `+${formatTokenAmount(delegatedShares)}` : '0'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dao-text-hint">Loot</p>
          <p className="text-sm font-mono text-dao-text-secondary mt-0.5">
            <TokenAmount amount={member.loot} />
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dao-text-hint">Votes Cast</p>
          <p className="text-sm font-mono text-dao-text-secondary mt-0.5">{member.votes ?? 0}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dao-text-hint">Sponsored</p>
          <p className={`text-sm font-mono mt-0.5 ${sponsoredCount > 0 ? 'text-primary-400' : 'text-dao-text-hint'}`}>
            {sponsoredCount || '—'}
          </p>
        </div>
      </div>

      {/* Voting power bar */}
      {delegatedShares > 0n && totalPower > 0n && (
        <div className="h-2 bg-dao-dark-3 rounded-full overflow-hidden flex">
          <div
            className="bg-primary-500 transition-all duration-500"
            style={{ width: `${Number((shares * 100n) / totalPower)}%` }}
          />
          <div
            className="bg-accent-500 transition-all duration-500"
            style={{ width: `${Number((delegatedShares * 100n) / totalPower)}%` }}
          />
        </div>
      )}

      {/* Delegators list */}
      {delegators.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-dao-text-muted uppercase tracking-wider mb-2">
            Delegators ({delegators.length})
          </p>
          <div className="space-y-1.5">
            {delegators.map(({ member: delegator, profile: delegatorProfile }) => (
              <div
                key={delegator.id}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-dao-dark-2/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MemberAvatar avatar={delegatorProfile?.avatar} size={6} />
                  {delegatorProfile?.name ? (
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-dao-text truncate">
                        {delegatorProfile.name}
                      </p>
                      <AddressDisplay
                        address={delegator.member_address}
                        showExplorer={false}
                        prefixLen={4}
                        suffixLen={3}
                      />
                    </div>
                  ) : (
                    <AddressDisplay address={delegator.member_address} />
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-dao-text-hint">Shares</p>
                  <p className="text-xs font-mono text-primary-400">
                    <TokenAmount amount={delegator.shares} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last active */}
      {member.last_activity_at && (
        <p className="text-xs text-dao-text-hint">
          Last active: {formatIndexerDate(member.last_activity_at)}
        </p>
      )}
    </div>
  )
}
