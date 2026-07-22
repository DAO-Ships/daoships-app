import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useQueryClient } from '@tanstack/react-query'
import type { Dao, Member } from '@/types'
import { extractDaoExpiryConfig } from '@/types'
import { isAddress } from '@/services/utils/AddressUtils'
import { useMembers } from '@/hooks/useMembers'
import { useMember } from '@/hooks/useMember'
import { useMemberProfile, useMemberProfiles } from '@/hooks/useMemberProfile'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { useWallet } from '@/hooks/useWallet'
import { useDelegation } from '@/hooks/useDelegation'
import { useProposals } from '@/hooks/useProposals'
import { ProposalStatus, deriveProposalStatus } from '@/types/proposal'
import { parseProposalDetails } from '@/utils/format'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { SkeletonMemberRow } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { Modal } from '@/components/common/Modal'
import { MemberAvatar } from '@/components/member/MemberAvatar'
import { MemberProfileForm } from '@/components/member/MemberProfileForm'
import { RagequitModal } from '@/components/member/RagequitModal'
import { DelegateCard } from '@/components/member/DelegateCard'
import { safeBigInt } from '@/utils/bigint'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { useDebounce } from '@/hooks/useDebounce'

type MembersTab = 'all' | 'delegates'

const MEMBERS_PER_PAGE = 25

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

function MemberRow({ member, profile, totalShares, sponsoredCount, isCurrentUser }: {
  member: Member; profile?: MemberProfile; totalShares: bigint; sponsoredCount: number; isCurrentUser: boolean
}) {
  const votingPower = safeBigInt(member.voting_power)
  const pct = formatPct(votingPower, totalShares)

  return (
    <tr className={`border-b border-dao-border last:border-0 ${isCurrentUser ? 'bg-primary-500/5' : ''}`}>
      {/* Identity */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <MemberAvatar avatar={profile?.avatar} size={8} />
          <div className="min-w-0">
            {profile?.name ? (
              <>
                <p className="text-sm font-medium text-dao-text truncate">{profile.name}</p>
                <AddressDisplay address={member.member_address} />
              </>
            ) : (
              <AddressDisplay address={member.member_address} />
            )}
            {member.delegating_to && member.delegating_to.toLowerCase() !== member.member_address.toLowerCase() && (
              <p className="text-2xs text-dao-text-hint mt-0.5">
                Delegating to <AddressDisplay address={member.delegating_to} showCopy={false} prefixLen={4} suffixLen={3} />
              </p>
            )}
          </div>
        </div>
      </td>
      {/* Stats — hidden on mobile, visible on md+ */}
      <td className="hidden md:table-cell text-right py-3 font-mono text-sm">
        <TokenAmount amount={member.shares} />
      </td>
      <td className="hidden md:table-cell text-right py-3 font-mono text-sm">
        <TokenAmount amount={member.loot} />
      </td>
      <td className="text-right py-3 font-mono text-sm">
        <TokenAmount amount={member.voting_power || '0'} className="whitespace-nowrap" />
      </td>
      <td className="text-right py-3">
        <span className="font-mono text-accent-400 text-sm">{pct}%</span>
      </td>
      <td className="hidden md:table-cell text-right py-3">
        <span className={`font-mono text-sm ${sponsoredCount > 0 ? 'text-primary-400' : 'text-dao-text-hint'}`}>
          {sponsoredCount || '—'}
        </span>
      </td>
    </tr>
  )
}

export function Members() {
  const { dao } = useOutletContext<DaoContext>()
  usePageTitle('Members', dao.name)
  const { connected, address } = useWallet()
  const { data: members, isLoading, error } = useMembers(dao.id)
  const { data: currentMember } = useMember(dao.id, address ?? undefined)
  const { data: profiles } = useMemberProfiles(dao.id)
  const { data: myProfile } = useMemberProfile(dao.id, address ?? undefined)
  const { delegate, isDelegating } = useDelegation(dao.id)
  const { data: proposals } = useProposals(dao.id)
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<MembersTab>('all')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSort, setMemberSort] = useState<'power' | 'shares' | 'sponsored'>('power')
  const [delegateAddress, setDelegateAddress] = useState('')
  const [delegateInput, setDelegateInput] = useState('')
  const [showDelegateDropdown, setShowDelegateDropdown] = useState(false)
  const [delegateError, setDelegateError] = useState<string | null>(null)
  const [showRagequitModal, setShowRagequitModal] = useState(false)
  // Defer treasury fetches until ragequit modal is first opened
  const [ragequitOpened, setRagequitOpened] = useState(false)
  const {
    data: guildTokens,
    isError: guildTokensError,
    isLoading: guildTokensLoading,
  } = useTreasury(ragequitOpened ? dao.id : undefined)
  const {
    data: treasuryBalances,
    isError: treasuryBalancesError,
    isLoading: treasuryBalancesLoading,
  } = useTreasuryBalances(ragequitOpened ? dao.avatar : undefined, guildTokens)

  // "No tokens" and "could not load" must not look the same to the ragequit flow.
  const guildTokensStatus: 'ok' | 'loading' | 'error' =
    guildTokensError || treasuryBalancesError
      ? 'error'
      : guildTokensLoading || treasuryBalancesLoading
        ? 'loading'
        : 'ok'
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Refetch treasury and DAO data when ragequit modal opens for fresh previews
  const openRagequitModal = useCallback(() => {
    setRagequitOpened(true)
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- extractDaoExpiryConfig reads only these three fields; depending on the whole `dao` over-recomputes on every poll
  const daoConfig = useMemo(() => extractDaoExpiryConfig(dao), [dao.voting_period, dao.grace_period, dao.default_expiry_window])

  // Count sponsored proposals per member (lifetime total for display, active for delegation warning)
  const activeStatuses = useMemo(() => new Set([ProposalStatus.Voting, ProposalStatus.Grace, ProposalStatus.Ready]), [])

  const { sponsoredCountMap, sponsoredActiveProposals } = useMemo(() => {
    const countMap = new Map<string, number>()
    const myActive: typeof proposals = []
    if (!proposals) return { sponsoredCountMap: countMap, sponsoredActiveProposals: myActive ?? [] }

    for (const p of proposals) {
      if (!p.sponsor) continue
      const key = p.sponsor.toLowerCase()
      // Lifetime total for display
      countMap.set(key, (countMap.get(key) ?? 0) + 1)
      // Active only for delegation warning
      if (address && key === address.toLowerCase() && activeStatuses.has(deriveProposalStatus(p, daoConfig))) {
        myActive.push(p)
      }
    }
    return { sponsoredCountMap: countMap, sponsoredActiveProposals: myActive }
  }, [proposals, daoConfig, activeStatuses, address])

  // Filtered members for delegation dropdown
  const delegateOptions = useMemo(() => {
    if (!members) return []
    const lowerInput = delegateInput.toLowerCase()
    return members
      .filter((m) => {
        if (address && m.member_address.toLowerCase() === address.toLowerCase()) return false
        if (!delegateInput) return true
        const profile = profiles?.get(m.member_address.toLowerCase())
        return (
          m.member_address.toLowerCase().includes(lowerInput) ||
          (profile?.name && profile.name.toLowerCase().includes(lowerInput))
        )
      })
      .slice(0, 20) // limit dropdown size
  }, [members, delegateInput, address, profiles])

  const selectDelegate = (addr: string) => {
    setDelegateAddress(addr)
    const p = profiles?.get(addr.toLowerCase())
    setDelegateInput(p?.name ? `${p.name} (${addr.slice(0, 6)}...${addr.slice(-4)})` : addr)
    setShowDelegateDropdown(false)
    setDelegateError(null)
  }

  // Verify a pasted/typed address is a member
  const verifyDelegateAddress = (input: string) => {
    setDelegateInput(input)
    setDelegateError(null)
    // If it looks like an address, validate membership
    const trimmed = input.trim()
    if (isAddress(trimmed)) {
      const isMemberAddr = members?.some(
        (m) => m.member_address.toLowerCase() === trimmed.toLowerCase(),
      )
      if (!isMemberAddr) {
        setDelegateAddress('')
        setDelegateError('This address is not a member of this DAO')
      } else if (address && trimmed.toLowerCase() === address.toLowerCase()) {
        setDelegateAddress('')
        setDelegateError('You cannot delegate to yourself')
      } else {
        setDelegateAddress(trimmed)
      }
    } else {
      setDelegateAddress('')
    }
  }

  const handleDelegate = async () => {
    if (!delegateAddress) return
    setDelegateError(null)
    try {
      await delegate({
        sharesAddress: dao.shares_address,
        to: delegateAddress,
      })
      setDelegateAddress('')
      setDelegateInput('')
    } catch (e: unknown) {
      setDelegateError(e instanceof Error ? e.message : 'Delegation failed')
    }
  }

  // Search and sort members
  const debouncedSearch = useDebounce(memberSearch, 300)
  const filteredSortedMembers = useMemo(() => {
    if (!members) return []
    let filtered = members
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase()
      filtered = members.filter((m) => {
        const profile = profiles?.get(m.member_address.toLowerCase())
        return m.member_address.toLowerCase().includes(lower) ||
          profile?.name?.toLowerCase().includes(lower)
      })
    }
    return [...filtered].sort((a, b) => {
      if (memberSort === 'shares') {
        const diff = safeBigInt(b.shares) - safeBigInt(a.shares)
        return diff > 0n ? 1 : diff < 0n ? -1 : 0
      }
      if (memberSort === 'sponsored') {
        const as = sponsoredCountMap.get(a.member_address.toLowerCase()) ?? 0
        const bs = sponsoredCountMap.get(b.member_address.toLowerCase()) ?? 0
        return bs - as
      }
      const diff = safeBigInt(b.voting_power) - safeBigInt(a.voting_power)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })
  }, [members, debouncedSearch, memberSort, profiles, sponsoredCountMap])

  // Paginate the "all members" table so a large DAO doesn't mount thousands of rows.
  const [memberPage, setMemberPage] = useState(1)
  useEffect(() => { setMemberPage(1) }, [debouncedSearch, memberSort, activeTab])
  const memberTotalPages = Math.max(1, Math.ceil(filteredSortedMembers.length / MEMBERS_PER_PAGE))
  const paginatedMembers = useMemo(
    () => filteredSortedMembers.slice((memberPage - 1) * MEMBERS_PER_PAGE, memberPage * MEMBERS_PER_PAGE),
    [filteredSortedMembers, memberPage],
  )

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: dao.name || `DAO ${dao.id.slice(0, 8)}...`, href: `/dao/${dao.id}` },
        { label: 'Members' },
      ]} />

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
            {currentMember.delegating_to &&
              currentMember.delegating_to.toLowerCase() !== currentMember.member_address.toLowerCase() ? (
              <div className="mb-3">
                <p className="text-sm text-dao-text-muted">
                  Currently delegating to{' '}
                  <AddressDisplay address={currentMember.delegating_to} showCopy={false} />
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => delegate({ sharesAddress: dao.shares_address, to: address! })}
                  loading={isDelegating}
                  disabled={isDelegating}
                >
                  Reclaim Votes
                </Button>
              </div>
            ) : (
              <p className="text-sm text-dao-text-muted mb-3">
                Delegate your voting power to another member.
              </p>
            )}
            {sponsoredActiveProposals.length > 0 && delegateAddress && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-3">
                <p className="text-sm text-amber-400 font-medium">
                  You are the sponsor of {sponsoredActiveProposals.length} active proposal{sponsoredActiveProposals.length > 1 ? 's' : ''}.
                </p>
                <p className="text-xs text-amber-400/80 mt-1">
                  Delegating your voting power could cause {sponsoredActiveProposals.length > 1 ? 'these proposals' : 'this proposal'} to be cancelled if your shares drop below the sponsor threshold.
                </p>
                <ul className="mt-2 space-y-1">
                  {sponsoredActiveProposals.slice(0, 5).map((p) => (
                    <li key={p.id} className="text-xs text-amber-400/70">
                      <Link to={`/dao/${dao.id}/proposals/${p.proposal_id}`} className="hover:underline">
                        #{p.proposal_id} — {parseProposalDetails(p.details ?? null).title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={delegateInput}
                  onChange={(e) => {
                    verifyDelegateAddress(e.target.value)
                    setShowDelegateDropdown(true)
                  }}
                  onFocus={() => setShowDelegateDropdown(true)}
                  onBlur={() => {
                    // Delay to allow click on dropdown option
                    setTimeout(() => setShowDelegateDropdown(false), 200)
                  }}
                  placeholder="Search members or paste address (0x...)"
                  className="input w-full text-sm font-mono"
                  disabled={isDelegating}
                />
                {showDelegateDropdown && delegateOptions.length > 0 && !delegateAddress && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-dao-dark-2 border border-dao-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {delegateOptions.map((m) => {
                      const p = profiles?.get(m.member_address.toLowerCase())
                      const vp = safeBigInt(m.voting_power)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectDelegate(m.member_address)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-dao-dark-3 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            {p?.name && <span className="text-dao-text mr-1">{p.name}</span>}
                            <span className="text-dao-text-muted font-mono">{m.member_address.slice(0, 10)}...{m.member_address.slice(-4)}</span>
                          </span>
                          <span className="text-xs text-dao-text-hint flex-shrink-0">{formatPct(vp, totalShares)}%</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                className="flex-shrink-0"
                onClick={handleDelegate}
                loading={isDelegating}
                disabled={!delegateAddress || isDelegating}
              >
                Delegate
              </Button>
            </div>
            {delegateError && (
              <p className="text-xs text-red-400 mt-2">{delegateError}</p>
            )}
          </Card>
          )}

          {/* Ragequit button — only when member data loaded */}
          {currentMember && (
          <Card header={<h3 className="text-sm font-semibold text-dao-text">Ragequit</h3>}>
            <p className="text-sm text-dao-text-muted mb-3">
              Burn shares/loot to withdraw proportional treasury tokens.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm min-w-0">
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

      {/* Search + sort (only for All Members tab) */}
      {activeTab === 'all' && members && members.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dao-text-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search by name or address..."
              className="input w-full pl-9"
            />
          </div>
          <select
            value={memberSort}
            onChange={(e) => setMemberSort(e.target.value as 'power' | 'shares' | 'sponsored')}
            className="input w-full sm:w-44"
          >
            <option value="power">Sort: Voting Power</option>
            <option value="shares">Sort: Shares</option>
            <option value="sponsored">Sort: Sponsored</option>
          </select>
        </div>
      )}

      {/* Tab content */}
      {isLoading ? (
        <Card>
          <div className="space-y-1">
            {Array.from({ length: 5 }, (_, i) => <SkeletonMemberRow key={i} />)}
          </div>
        </Card>
      ) : error ? (
        <EmptyState
          title="Failed to load members"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        />
      ) : activeTab === 'all' ? (
        filteredSortedMembers.length > 0 ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-2xs font-semibold text-dao-text-hint uppercase tracking-wider border-b border-dao-border">
                    <th className="text-left py-2 pr-4">Member</th>
                    <th className="hidden md:table-cell text-right py-2">Shares</th>
                    <th className="hidden md:table-cell text-right py-2">Loot</th>
                    <th className="text-right py-2">Power</th>
                    <th className="text-right py-2">%</th>
                    <th className="hidden md:table-cell text-right py-2">Sponsored</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      profile={profiles?.get(member.member_address.toLowerCase())}
                      totalShares={totalShares}
                      sponsoredCount={sponsoredCountMap.get(member.member_address.toLowerCase()) ?? 0}
                      isCurrentUser={!!address && member.member_address.toLowerCase() === address.toLowerCase()}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {memberTotalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4 mt-3 border-t border-dao-border">
                <button onClick={() => setMemberPage((p) => Math.max(1, p - 1))} disabled={memberPage === 1}
                  className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">Previous</button>
                <span className="text-sm text-dao-text-muted">Page {memberPage} of {memberTotalPages}</span>
                <button onClick={() => setMemberPage((p) => Math.min(memberTotalPages, p + 1))} disabled={memberPage === memberTotalPages}
                  className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">Next</button>
              </div>
            )}
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
              sponsoredCount={sponsoredCountMap.get(member.member_address.toLowerCase()) ?? 0}
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
          guildTokensStatus={guildTokensStatus}
          totalSupply={safeBigInt(dao.total_shares) + safeBigInt(dao.total_loot)}
        />
      )}
    </div>
  )
}
