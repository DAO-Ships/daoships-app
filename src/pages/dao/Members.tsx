import { useState, useMemo, useCallback } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Dao, Member } from '@/types'
import { useMembers } from '@/hooks/useMembers'
import { useMember } from '@/hooks/useMember'
import { useMemberProfile, useMemberProfiles } from '@/hooks/useMemberProfile'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { useWallet } from '@/hooks/useWallet'
import { useDelegation } from '@/hooks/useDelegation'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { EmptyState } from '@/components/common/EmptyState'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { Modal } from '@/components/common/Modal'
import { MemberAvatar } from '@/components/member/MemberAvatar'
import { MemberProfileForm } from '@/components/member/MemberProfileForm'
import { RagequitModal } from '@/components/member/RagequitModal'
import { DelegateCard } from '@/components/member/DelegateCard'
import { safeBigInt } from '@/utils/bigint'

type MembersTab = 'all' | 'delegates'

// ═══════════════════════════════════════════════════════════════════════════
// Members - Member list with profiles, delegation and ragequit
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

function formatPct(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '0'
  // Multiply by 10000 first for 2 decimal places, then divide
  const bps = (numerator * 10000n) / denominator
  const whole = bps / 100n
  const frac = bps % 100n
  if (frac === 0n) return `${whole}`
  const fracStr = frac.toString().padStart(2, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

function MemberRow({ member, profile, totalShares }: { member: Member; profile?: MemberProfile; totalShares: bigint }) {
  const shares = safeBigInt(member.shares)
  const votingPower = safeBigInt(member.voting_power)
  const pct = formatPct(votingPower, totalShares)

  return (
    <div className="flex items-center justify-between py-3 border-b border-dao-border last:border-0">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <MemberAvatar avatar={profile?.avatar} size={8} />
        <div className="min-w-0">
          {/* Name + address */}
          {profile?.name ? (
            <div>
              <p className="text-sm font-medium text-dao-text truncate">{profile.name}</p>
              <AddressDisplay address={member.member_address} />
            </div>
          ) : (
            <AddressDisplay address={member.member_address} />
          )}

          {/* Delegation info */}
          {member.delegating_to && member.delegating_to !== member.member_address && (
            <p className="text-xs text-dao-text-hint mt-0.5">
              Delegating to <AddressDisplay address={member.delegating_to} showCopy={false} />
            </p>
          )}

        </div>
      </div>
      <div className="flex items-center gap-6 text-sm flex-shrink-0">
        <div className="text-right">
          <p className="text-dao-text-hint text-xs">Shares</p>
          <TokenAmount amount={member.shares} />
        </div>
        <div className="text-right">
          <p className="text-dao-text-hint text-xs">Loot</p>
          <TokenAmount amount={member.loot} />
        </div>
        <div className="text-right">
          <p className="text-dao-text-hint text-xs">Voting Power</p>
          <TokenAmount amount={member.voting_power || '0'} />
        </div>
        <div className="text-right">
          <p className="text-dao-text-hint text-xs">Power %</p>
          <span className="font-mono text-accent-400">{pct}%</span>
        </div>
      </div>
    </div>
  )
}

export function Members() {
  const { dao } = useOutletContext<DaoContext>()
  const { connected, address } = useWallet()
  const { data: members, isLoading, error } = useMembers(dao.id)
  const { data: currentMember, isLoading: memberLoading } = useMember(dao.id, address ?? undefined)
  const { data: profiles } = useMemberProfiles(dao.id)
  const { data: myProfile } = useMemberProfile(dao.id, address ?? undefined)
  const { delegate, isDelegating } = useDelegation(dao.id)
  const { data: guildTokens } = useTreasury(dao.id)
  const { data: treasuryBalances } = useTreasuryBalances(dao.avatar, guildTokens)
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<MembersTab>('all')
  const [delegateAddress, setDelegateAddress] = useState('')
  const [showRagequitModal, setShowRagequitModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Refetch treasury and DAO data when ragequit modal opens for fresh previews
  const openRagequitModal = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['treasuryBalances', dao.avatar] })
    queryClient.invalidateQueries({ queryKey: ['treasury', dao.id] })
    queryClient.invalidateQueries({ queryKey: ['dao', dao.id] })
    setShowRagequitModal(true)
  }, [queryClient, dao.id, dao.avatar])

  // Total shares across all members (denominator for voting power %)
  const totalShares = useMemo(() => {
    if (!members) return 0n
    return members.reduce((sum, m) => sum + safeBigInt(m.shares), 0n)
  }, [members])

  // Compute delegates: members who have other members delegating to them
  const delegates = useMemo(() => {
    if (!members) return []

    // Build a map of delegate address → delegators
    const delegateMap = new Map<string, Member[]>()
    for (const m of members) {
      if (m.delegating_to && m.delegating_to.toLowerCase() !== m.member_address.toLowerCase()) {
        const key = m.delegating_to.toLowerCase()
        const existing = delegateMap.get(key) ?? []
        existing.push(m)
        delegateMap.set(key, existing)
      }
    }

    // Also include members whose voting_power > shares (received delegations from outside visible list)
    for (const m of members) {
      const key = m.member_address.toLowerCase()
      if (!delegateMap.has(key)) {
        const vp = safeBigInt(m.voting_power)
        const shares = safeBigInt(m.shares)
        if (vp > shares) {
          delegateMap.set(key, [])
        }
      }
    }

    // Build delegate entries sorted by total voting power descending
    const membersByAddress = new Map(members.map((m) => [m.member_address.toLowerCase(), m]))
    return Array.from(delegateMap.entries())
      .map(([addr, delegators]) => ({
        member: membersByAddress.get(addr)!,
        delegators,
      }))
      .filter((d) => d.member) // only include delegates who are still active members
      .sort((a, b) => Number(safeBigInt(b.member.voting_power) - safeBigInt(a.member.voting_power)))
  }, [members])

  const handleDelegate = async () => {
    if (!delegateAddress) return
    await delegate({
      sharesAddress: dao.shares_address,
      to: delegateAddress,
    })
    setDelegateAddress('')
  }


  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-hint">
        <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
          {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
        </Link>
        <span>/</span>
        <span className="text-dao-text-secondary">Members</span>
      </nav>

      <h1 className="text-2xl font-bold font-display text-dao-text">Members</h1>

      {/* Connected user controls */}
      {connected && address && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Profile widget — always visible for connected members */}
          <Card header={<h3 className="text-sm font-semibold text-dao-text">Your Profile</h3>}>
            {myProfile?.name ? (
              <div className="flex items-center gap-3 mb-3">
                <MemberAvatar avatar={myProfile.avatar} size={10} />
                <div>
                  <p className="text-sm font-medium text-dao-text">{myProfile.name}</p>
                  {myProfile.bio && (
                    <p className="text-xs text-dao-text-muted line-clamp-2">{myProfile.bio}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-dao-text-muted mb-3">
                Set a profile so other members can identify you.
              </p>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowProfileModal(true)}
            >
              {myProfile ? 'Edit Profile' : 'Set Profile'}
            </Button>
          </Card>

          {/* Delegation widget — only when member data loaded */}
          {currentMember && (
          <Card header={<h3 className="text-sm font-semibold text-dao-text">Delegate Shares</h3>}>
            <p className="text-sm text-dao-text-muted mb-3">
              Delegate your voting power to another member.
              {currentMember.delegating_to &&
                currentMember.delegating_to !== currentMember.member_address && (
                  <span className="block mt-1">
                    Currently delegating to{' '}
                    <AddressDisplay address={currentMember.delegating_to} showCopy={false} />
                  </span>
                )}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={delegateAddress}
                onChange={(e) => setDelegateAddress(e.target.value)}
                placeholder="Delegate to address (0x...)"
                className="input flex-1 font-mono text-sm"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleDelegate}
                loading={isDelegating}
                disabled={!delegateAddress || isDelegating}
              >
                Delegate
              </Button>
            </div>
          </Card>
          )}

          {/* Ragequit button — only when member data loaded */}
          {currentMember && (
          <Card header={<h3 className="text-sm font-semibold text-dao-text">Ragequit</h3>}>
            <p className="text-sm text-dao-text-muted mb-3">
              Burn shares/loot to withdraw proportional treasury tokens.
            </p>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-dao-text-hint">Shares: </span>
                <TokenAmount amount={currentMember.shares} />
                <span className="text-dao-text-hint mx-2">|</span>
                <span className="text-dao-text-hint">Loot: </span>
                <TokenAmount amount={currentMember.loot} />
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={openRagequitModal}
                disabled={
                  safeBigInt(currentMember.shares) === 0n &&
                  safeBigInt(currentMember.loot) === 0n
                }
              >
                Ragequit
              </Button>
            </div>
          </Card>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-dao-border">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'all'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-dao-text-muted hover:text-dao-text-secondary hover:border-dao-border'
          }`}
        >
          All Members{members ? ` (${members.length})` : ''}
        </button>
        <button
          onClick={() => setActiveTab('delegates')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'delegates'
              ? 'border-accent-500 text-accent-400'
              : 'border-transparent text-dao-text-muted hover:text-dao-text-secondary hover:border-dao-border'
          }`}
        >
          Delegates{delegates.length > 0 ? ` (${delegates.length})` : ''}
        </button>
      </div>

      {/* Tab content */}
      {isLoading ? (
        <Loading fullPage />
      ) : error ? (
        <EmptyState
          title="Failed to load members"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        />
      ) : activeTab === 'all' ? (
        members && members.length > 0 ? (
          <Card>
            <div className="divide-y divide-dao-border">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  profile={profiles?.get(member.member_address.toLowerCase())}
                  totalShares={totalShares}
                />
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No members"
            description="This DAO has no active members."
          />
        )
      ) : delegates.length > 0 ? (
        <div className="space-y-3">
          {delegates.map(({ member, delegators }) => (
            <DelegateCard
              key={member.id}
              member={member}
              profile={profiles?.get(member.member_address.toLowerCase())}
              delegators={delegators.map((d) => ({
                member: d,
                profile: profiles?.get(d.member_address.toLowerCase()),
              }))}
              totalShares={totalShares}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No delegates"
          description="No members have received delegated voting power yet."
        />
      )}

      {/* Profile edit modal */}
      <Modal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        title="Member Profile"
      >
        <MemberProfileForm
          daoId={dao.id}
          currentProfile={myProfile}
          onClose={() => setShowProfileModal(false)}
        />
      </Modal>

      {/* Ragequit modal with token payout preview */}
      {currentMember && (
        <RagequitModal
          isOpen={showRagequitModal}
          onClose={() => setShowRagequitModal(false)}
          daoId={dao.id}
          daoShipAddress={dao.id}
          userAddress={address!}
          userShares={safeBigInt(currentMember.shares)}
          userLoot={safeBigInt(currentMember.loot)}
          guildTokens={(treasuryBalances?.tokenBalances ?? []).map((tb) => ({
            address: tb.address,
            symbol: tb.symbol,
            name: tb.name,
            balance: tb.balance.toString(),
            decimals: tb.decimals,
          }))}
          totalSupply={safeBigInt(dao.total_shares) + safeBigInt(dao.total_loot)}
        />
      )}
    </div>
  )
}
