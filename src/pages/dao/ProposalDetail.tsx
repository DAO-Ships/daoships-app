import { useMemo, useState, useCallback, useEffect } from 'react'
import { useParams, useOutletContext, Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import type { Dao } from '@/types'
import { extractDaoExpiryConfig } from '@/types'
import { ProposalStatus, willProposalPass } from '@/types/proposal'
import { useProposal } from '@/hooks/useProposal'
import { useProposalStatus } from '@/hooks/useProposalStatus'
import { useVoting } from '@/hooks/useVoting'
import { useProposalActions } from '@/hooks/useProposalActions'
import { useMember } from '@/hooks/useMember'
import { useMemberProfile, useMemberProfiles } from '@/hooks/useMemberProfile'
import { useWallet } from '@/hooks/useWallet'
import { useHasVoted } from '@/hooks/useHasVoted'
import { usePriorVotes } from '@/hooks/usePriorVotes'
import { useVoteReasons } from '@/hooks/useVoteReasons'
import { useRealtimeProposal } from '@/hooks/useRealtimeProposal'
import { useRealtimeVotes } from '@/hooks/useRealtimeVotes'
import { useProposalVotes } from '@/hooks/useProposalVotes'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { ProposalActionSummary } from '@/components/proposal/ProposalActionSummary'
import { decodeProposalActions } from '@/services/utils/ProposalDecoder'
import { VotingSidebar } from '@/components/proposal/VotingSidebar'
import { ProposalVotes, VoteReasonModal } from '@/components/proposal/VoteReasons'
import { MemberIdentity } from '@/components/member/MemberIdentity'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { formatTimeAgo } from '@/utils/time'
import { parseProposalDetails } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'
import { safeHref } from '@/utils/url'
import { NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalDetail - Two-column proposal view with sticky voting sidebar
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

const TERMINAL_STATUSES = new Set([
  ProposalStatus.Processed,
  ProposalStatus.Defeated,
  ProposalStatus.ActionFailed,
  ProposalStatus.Cancelled,
  ProposalStatus.Expired,
])

export function ProposalDetail() {
  const { daoId, proposalId } = useParams()
  const { dao } = useOutletContext<DaoContext>()
  const { data: proposal, isLoading, error, refetch } = useProposal(daoId, proposalId)
  const { data: profiles } = useMemberProfiles(daoId)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- extractDaoExpiryConfig reads only these three fields; depending on the whole `dao` over-recomputes on every poll
  const daoConfig = useMemo(() => extractDaoExpiryConfig(dao), [dao.voting_period, dao.grace_period, dao.default_expiry_window])
  const status = useProposalStatus(proposal, daoConfig)

  // A timelock-routed governance change only ENQUEUES when the proposal is processed — the
  // config isn't live until a second `executeChange` after the delay. Detect it so we can guide
  // the user to that step (decoded from the actions, not the details tag, so it's authoritative).
  const timelockQueue = useMemo(() => {
    const action = decodeProposalActions(proposal?.proposal_data, daoId)
      .find((a) => a.type === 'queueGovernanceConfig')
    return action ? { timelockAddress: action.details.timelock as string | undefined } : null
  }, [proposal?.proposal_data, daoId])
  const { connected, address, connect } = useWallet()
  const { vote, isVoting, error: voteError } = useVoting(daoId!, proposalId!)
  const actions = useProposalActions(daoId!, proposalId!)
  const { data: member } = useMember(daoId, address ?? undefined)
  const { data: hasVoted = false } = useHasVoted(daoId, proposalId ? Number(proposalId) : undefined, address ?? undefined)
  const { data: proposalVotes } = useProposalVotes(daoId, proposalId ? Number(proposalId) : undefined)
  // Contract gate: getPriorVotes(voter, votingStarts) must be non-zero to vote.
  const { data: priorVotes } = usePriorVotes(daoId, address ?? undefined, proposal?.voting_starts)
  const { data: voteReasonsList } = useVoteReasons(daoId, proposalId ? Number(proposalId) : undefined)

  // Sponsor threshold check
  const sponsorAddress = proposal?.sponsor ?? null
  const { data: sponsorMember } = useMember(daoId, sponsorAddress ?? undefined)
  const sponsorBelowThreshold = useMemo(() => {
    if (!proposal?.sponsored || !sponsorAddress || !sponsorMember) return false
    const sponsorVotes = safeBigInt(sponsorMember.voting_power)
    const threshold = safeBigInt(dao.sponsor_threshold)
    return threshold > 0n && sponsorVotes < threshold
  }, [proposal?.sponsored, sponsorAddress, sponsorMember, dao.sponsor_threshold])

  // Delegation
  const delegatingTo = member?.delegating_to ?? null
  const hasDelegated = delegatingTo && address && delegatingTo.toLowerCase() !== address.toLowerCase()
  const { data: delegateProfile } = useMemberProfile(daoId, hasDelegated ? delegatingTo : undefined)
  const delegateVote = hasDelegated && proposalVotes
    ? proposalVotes.find((v) => v.voter.toLowerCase() === delegatingTo.toLowerCase()) ?? null
    : null
  const delegateVoteReason = hasDelegated && delegateVote && voteReasonsList
    ? voteReasonsList.find((r) => r.voterAddress.toLowerCase() === delegatingTo.toLowerCase())?.reason ?? null
    : null

  // Vote reason modal
  const [showVoteReasonModal, setShowVoteReasonModal] = useState(false)
  const [lastVoteDirection, setLastVoteDirection] = useState<boolean | null>(null)
  const handleVote = useCallback(async (approved: boolean) => {
    await vote(approved)
    setLastVoteDirection(approved)
    setShowVoteReasonModal(true)
  }, [vote])
  const closeVoteReasonModal = useCallback(() => setShowVoteReasonModal(false), [])
  const proposalIdNum = Number(proposalId)

  // Realtime subscriptions — must stay in parent to affect all child queries
  useRealtimeProposal(daoId, proposalId)
  useRealtimeVotes(daoId, proposalId)

  // Grace window for the indexer. A just-created proposal (post-submit redirect,
  // shared link, or refresh) may not be indexed yet — show a "syncing" state and
  // retry quickly rather than flashing a false "not found". Falls back to the
  // not-found state once the window elapses with still no proposal.
  const [syncTimedOut, setSyncTimedOut] = useState(false)
  useEffect(() => {
    if (proposal) {
      setSyncTimedOut(false)
      return
    }
    setSyncTimedOut(false)
    const fast = setInterval(() => { void refetch() }, 3000)
    const giveUp = setTimeout(() => setSyncTimedOut(true), 15000)
    return () => {
      clearInterval(fast)
      clearTimeout(giveUp)
    }
  }, [proposal, refetch])

  const details = useMemo(
    () => proposal ? parseProposalDetails(proposal.details) : { title: '', description: '' },
    [proposal],
  )
  usePageTitle(details.title, dao.name)

  if (isLoading) return <Loading fullPage />

  // Still waiting on the indexer within the grace window — not an error yet.
  if (!proposal && !syncTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loading size="lg" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-dao-text-secondary mb-1">Proposal is syncing…</h2>
          <p className="text-dao-text-muted text-sm">
            Waiting for the indexer to catch up. This usually takes a few seconds.
          </p>
        </div>
      </div>
    )
  }

  if (error || !proposal) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-dao-text-secondary mb-2">Proposal not found</h2>
        <p className="text-dao-text-muted mb-6">
          {error instanceof Error ? error.message : 'This proposal does not exist.'}
        </p>
        <Link to={`/dao/${daoId}/proposals`}>
          <Button variant="secondary">Back to Proposals</Button>
        </Link>
      </div>
    )
  }

  const isTerminal = TERMINAL_STATUSES.has(status as ProposalStatus)
  const yesBalance = safeBigInt(proposal.yes_balance)
  const noBalance = safeBigInt(proposal.no_balance)
  const totalBalance = yesBalance + noBalance
  const yesPercent = totalBalance > 0n ? Number((yesBalance * 100n) / totalBalance) : 0
  const noPercent = totalBalance > 0n ? 100 - yesPercent : 0

  // Contract requires defeated proposals be processed with empty data.
  // Predict the outcome locally and route process() accordingly.
  // A Ready (passing) proposal must be processed with its original action bytes; a
  // defeated one must be closed with '0x'. willProposalPass mirrors the contract's
  // quorum+majority Ready decision so we send the data the contract expects.
  // A Ready (passing) proposal must be processed with its ORIGINAL action bytes; a
  // defeated one must be closed with '0x'. The contract checks
  // keccak256(abi.encode(data)) against the stored hash, so the wrong branch reverts
  // with HashMismatch and burns the caller's gas.
  //
  // Two ways this used to go wrong, both silent:
  //   - `proposal.proposal_data ?? '0x'` sent '0x' on the PASSING branch whenever the
  //     data was unavailable — a guaranteed HashMismatch.
  //   - willProposalPass now throws rather than evaluating quorum against an absent
  //     snapshot, which would white-screen this render body.
  // Both now resolve to a blocked Process button with a stated reason.
  const processPlan: { data: string | null; blockedReason: string | null } = (() => {
    let willPass: boolean
    try {
      willPass = willProposalPass(proposal, dao.quorum_percent)
    } catch (err) {
      return {
        data: null,
        blockedReason: err instanceof Error
          ? err.message
          : 'Cannot determine whether this proposal passed.',
      }
    }
    if (!willPass) return { data: '0x', blockedReason: null }
    if (proposal.proposal_data == null) {
      return {
        data: null,
        blockedReason: 'This proposal passed, but its action data is unavailable — '
          + 'processing now would revert with HashMismatch. Retry once the indexer catches up.',
      }
    }
    return { data: proposal.proposal_data, blockedReason: null }
  })()
  const processData = processPlan.data

  const actionErrors = [
    voteError,
    actions.sponsorError,
    actions.processError,
    actions.cancelError,
    // Surface WHY Process is unavailable rather than leaving a silently inert button.
    processPlan.blockedReason,
  ].filter(Boolean)

  // Can the user vote? (for mobile action bar)
  const canVote = status === ProposalStatus.Voting && !hasVoted && connected && address
    && !(delegatingTo && delegatingTo.toLowerCase() !== address.toLowerCase())

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: dao.name || `DAO ${dao.id.slice(0, 8)}...`, href: `/dao/${daoId}` },
        { label: 'Proposals', href: `/dao/${daoId}/proposals` },
        { label: `#${proposal.proposal_id}` },
      ]} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-dao-text-hint">#{proposal.proposal_id}</span>
          <StatusBadge status={status} />
        </div>
        <h1 className="text-2xl font-bold font-display text-dao-text">
          {details.title}
        </h1>
        {details.description && (
          <p className="text-dao-text-muted mt-2 max-w-3xl whitespace-pre-wrap">{details.description}</p>
        )}

        {details.discussionUrl && (
          <a href={safeHref(details.discussionUrl)} target="_blank" rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 transition-colors mt-2">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Discussion
          </a>
        )}
      </div>

      {/* Result banner for all terminal proposals */}
      {isTerminal && (
        <div className={`rounded-xl px-6 py-4 border ${
          status === ProposalStatus.ActionFailed ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700/50'
            : status === ProposalStatus.Processed ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50'
            : status === ProposalStatus.Expired ? 'bg-dao-surface border-dao-border'
            : status === ProposalStatus.Cancelled ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-semibold ${
                status === ProposalStatus.ActionFailed ? 'text-orange-600 dark:text-orange-400'
                  : status === ProposalStatus.Processed ? 'text-emerald-600 dark:text-emerald-400'
                  : status === ProposalStatus.Expired ? 'text-dao-text-muted'
                  : status === ProposalStatus.Cancelled ? 'text-red-600 dark:text-red-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {status === ProposalStatus.ActionFailed ? 'Proposal Passed — Action Failed'
                  : status === ProposalStatus.Processed ? `Proposal Passed (${yesPercent}% yes)`
                  : status === ProposalStatus.Expired ? 'Proposal Expired'
                  : status === ProposalStatus.Cancelled ? `Proposal Cancelled${proposal.cancelled_by ? '' : ''}`
                  : `Proposal Defeated (${yesPercent}% yes)`}
              </p>
              {status === ProposalStatus.ActionFailed && (
                <p className="text-sm text-orange-500/80 dark:text-orange-400/80 mt-1">
                  The vote passed but the on-chain action reverted during processing.
                </p>
              )}
              {status === ProposalStatus.Expired && (
                <p className="text-sm text-dao-text-hint mt-1">
                  This proposal was not processed before its expiration and can no longer be executed.
                </p>
              )}
              {status === ProposalStatus.Cancelled && proposal.cancelled_by && (
                <p className="text-sm text-dao-text-hint mt-1">
                  Cancelled by <AddressDisplay address={proposal.cancelled_by} showExplorer={false} />
                  {proposal.cancelled_tx_at && <span className="ml-2">{formatTimeAgo(new Date(proposal.cancelled_tx_at).getTime())}</span>}
                </p>
              )}
            </div>
            {proposal.process_tx_hash && (
              <a href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${proposal.process_tx_hash}`}
                target="_blank" rel="noopener noreferrer nofollow"
                className="text-xs font-mono text-dao-text-hint hover:text-primary-400 transition-colors flex-shrink-0">
                {proposal.process_tx_hash.slice(0, 10)}...
              </a>
            )}
          </div>
          {proposal.processed_by && (
            <p className="text-xs text-dao-text-hint mt-2">
              Processed by <AddressDisplay address={proposal.processed_by} showExplorer={false} />
              {proposal.process_tx_at && <span className="ml-2">{formatTimeAgo(new Date(proposal.process_tx_at).getTime())}</span>}
            </p>
          )}
        </div>
      )}

      {/* Timelock-routed change: passed ≠ live. Guide the user to the second execution step. */}
      {status === ProposalStatus.Processed && timelockQueue && (
        <div className="rounded-xl px-6 py-4 border border-accent-500/30 bg-accent-500/10">
          <p className="text-sm font-semibold text-accent-400">Change queued in the timelock — one step left</p>
          <p className="text-sm text-dao-text-muted mt-1">
            This proposal passed and <strong>queued</strong> the governance-config change — it is{' '}
            <strong>not live yet</strong>. After the timelock delay (a second window for members to
            ragequit), anyone can execute it within the execution window. If it isn't executed in time
            it expires and must be re-proposed.
          </p>
          {timelockQueue.timelockAddress && (
            <Link
              to={`/dao/${daoId}/navigators/${timelockQueue.timelockAddress}`}
              className="btn-primary text-sm mt-3 inline-block"
            >
              Track &amp; execute on the timelock →
            </Link>
          )}
        </div>
      )}

      {/* Compact vote summary — shown on terminal proposals below the result banner */}
      {isTerminal && proposal.sponsored && totalBalance > 0n && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-dao-dark-2 border border-dao-border">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <div className="flex-1 h-2 rounded-full bg-dao-surface overflow-hidden flex">
              <div className="h-full bg-emerald-500/60" style={{ width: `${yesPercent}%` }} />
              <div className="h-full bg-red-500/60" style={{ width: `${noPercent}%` }} />
            </div>
            <span className="text-xs font-mono text-dao-text-muted whitespace-nowrap">{yesPercent}% yes</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dao-text-hint flex-shrink-0">
            <span><span className="text-emerald-400 font-medium">{proposal.yes_votes}</span> yes</span>
            <span><span className="text-red-400 font-medium">{proposal.no_votes}</span> no</span>
          </div>
        </div>
      )}

      {/* ══ Two-column layout ══════════════════════════════════════════ */}
      <div className={`${isTerminal ? '' : 'lg:grid lg:grid-cols-[1fr,360px] lg:gap-6'}`}>

        {/* Left column: proposal content */}
        <div className="space-y-6 min-w-0">
          {/* Proposed Actions */}
          <ProposalActionSummary proposalData={proposal.proposal_data} daoId={daoId} />

          {/* Metadata */}
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-dao-text-hint mb-1">Created by</p>
                {proposal.submitter ? (
                  <MemberIdentity
                    address={proposal.submitter}
                    profile={profiles?.get(proposal.submitter.toLowerCase())}
                  />
                ) : (
                  <p className="text-dao-text-secondary">Unknown</p>
                )}
              </div>
              <div>
                <p className="text-dao-text-hint mb-1">Submitted</p>
                <p className="text-dao-text-secondary">{formatTimeAgo(new Date(proposal.created_at).getTime())}</p>
              </div>
              {proposal.sponsored && proposal.sponsor && (
                <div>
                  <p className="text-dao-text-hint mb-1">Sponsored by</p>
                  <MemberIdentity address={proposal.sponsor} profile={profiles?.get(proposal.sponsor.toLowerCase())} />
                </div>
              )}
              {proposal.proposal_offering && safeBigInt(proposal.proposal_offering) > 0n && (
                <div>
                  <p className="text-dao-text-hint mb-1">Proposal Offering</p>
                  <TokenAmount amount={proposal.proposal_offering} symbol="QUAI" />
                </div>
              )}
            </div>
          </Card>

          {/* Votes */}
          <ProposalVotes daoId={daoId!} proposalId={proposalIdNum} />
        </div>

        {/* Right column: voting sidebar (desktop) */}
        {!isTerminal && (
          <div className="hidden lg:block">
            <div className="sticky top-4">
              <VotingSidebar
                proposal={proposal}
                dao={dao}
                status={status}
                daoId={daoId!}
                daoConfig={daoConfig}
                connected={connected}
                userAddress={address}
                userShares={member ? safeBigInt(member.voting_power) : 0n}
                hasVoted={hasVoted}
                delegatingTo={delegatingTo}
                delegateVote={delegateVote}
                delegateVoteReason={delegateVoteReason}
                delegateProfile={delegateProfile ?? null}
                priorVotes={priorVotes}
                sponsorBelowThreshold={sponsorBelowThreshold}
                onSponsor={() => actions.sponsor()}
                onVote={handleVote}
                onProcess={() => { if (processData !== null) actions.process(processData) }}
                onCancel={() => actions.cancel()}
                onConnect={connect}
                proposalDataMissing={!proposal.proposal_data || processData === null}
                isSponsorPending={actions.isSponsorPending}
                isVotePending={isVoting}
                isProcessPending={actions.isProcessPending}
                isCancelPending={actions.isCancelPending}
                actionErrors={actionErrors}
              />
            </div>
          </div>
        )}

        {/* Mobile voting sidebar — shown above content on non-desktop */}
        {!isTerminal && (
          <div className="lg:hidden order-first mb-6">
            <VotingSidebar
              proposal={proposal}
              dao={dao}
              status={status}
              daoId={daoId!}
              daoConfig={daoConfig}
              connected={connected}
              userAddress={address}
              userShares={member ? safeBigInt(member.voting_power) : 0n}
              hasVoted={hasVoted}
              delegatingTo={delegatingTo}
              delegateVote={delegateVote}
              delegateVoteReason={delegateVoteReason}
              delegateProfile={delegateProfile ?? null}
                priorVotes={priorVotes}
              sponsorBelowThreshold={sponsorBelowThreshold}
              onSponsor={() => actions.sponsor()}
              onVote={handleVote}
              onProcess={() => { if (processData !== null) actions.process(processData) }}
              onCancel={() => actions.cancel()}
              onConnect={connect}
              proposalDataMissing={!proposal.proposal_data || processData === null}
              isSponsorPending={actions.isSponsorPending}
              isVotePending={isVoting}
              isProcessPending={actions.isProcessPending}
              isCancelPending={actions.isCancelPending}
              actionErrors={actionErrors}
            />
          </div>
        )}

      </div>

      {/* Mobile sticky action bar — vote buttons fixed at bottom */}
      {canVote && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-dao-dark-2 border-t border-dao-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 border-emerald-500"
            loading={isVoting}
            onClick={() => handleVote(true)}
          >
            Vote Yes
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="flex-1"
            loading={isVoting}
            onClick={() => handleVote(false)}
          >
            Vote No
          </Button>
        </div>
      )}
      {/* Bottom padding to prevent content being hidden behind sticky bar */}
      {canVote && <div className="lg:hidden" style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }} />}

      {/* Vote Reason Modal */}
      <VoteReasonModal
        isOpen={showVoteReasonModal}
        onClose={closeVoteReasonModal}
        daoId={daoId!}
        proposalId={proposalIdNum}
        voteDirection={lastVoteDirection}
      />
    </div>
  )
}
