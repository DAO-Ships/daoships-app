import { useState, useCallback, memo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useVoteReasons } from '@/hooks/useVoteReasons'
import { useProposalVotes } from '@/hooks/useProposalVotes'
import { useMemberProfiles } from '@/hooks/useMemberProfile'
import { posterService } from '@/services/core/PosterService'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TrustBadge } from '@/components/common/TrustBadge'
import { MemberAvatar } from '@/components/member/MemberAvatar'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'
import { formatTimeAgo } from '@/utils/time'
import { formatTokenAmount } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalVotes - Lists every voter (canonical from ds_votes), with their
// profile and vote reason when present. Plus the post-vote reason modal below.
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalVotesProps {
  daoId: string
  proposalId: number
}

/**
 * Lists all votes cast on a proposal — the voter (profile name/avatar when
 * available), their canonical Yes/No from ds_votes, voting weight, and their
 * reason if they posted one.
 *
 * Memoized to prevent parent re-renders (countdown ticks, realtime updates)
 * from stealing focus in the textarea of the sibling reason modal.
 */
export const ProposalVotes = memo(function ProposalVotes({ daoId, proposalId }: ProposalVotesProps) {
  const { data: votes } = useProposalVotes(daoId, proposalId)
  const { data: voteReasons } = useVoteReasons(daoId, proposalId)
  const { data: profiles } = useMemberProfiles(daoId)

  // Index reasons by voter so we can attach one to each canonical vote row.
  const reasonByVoter = new Map(
    (voteReasons ?? []).map((r) => [r.voterAddress.toLowerCase(), r]),
  )

  // Sort by voting weight (descending) so the most influential votes lead.
  const sortedVotes = [...(votes ?? [])].sort((a, b) => {
    const diff = safeBigInt(b.balance) - safeBigInt(a.balance)
    return diff > 0n ? 1 : diff < 0n ? -1 : 0
  })

  return (
    <Card header={<h2 className="text-lg font-semibold text-dao-text">Votes</h2>}>
      {sortedVotes.length > 0 ? (
        <div className="divide-y divide-dao-border">
          {sortedVotes.map((vote) => {
            const key = vote.voter.toLowerCase()
            const profile = profiles?.get(key)
            const reason = reasonByVoter.get(key)
            const weight = safeBigInt(vote.balance)
            return (
              <div key={vote.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <MemberAvatar avatar={profile?.avatar} size={6} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {profile?.name ? (
                        <span className="text-sm font-medium text-dao-text truncate">{profile.name}</span>
                      ) : (
                        <AddressDisplay address={vote.voter} showExplorer={false} />
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        vote.approved
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {vote.approved ? 'Yes' : 'No'}
                      </span>
                      {reason?.trustLevel && <TrustBadge level={reason.trustLevel} />}
                      <span className="text-xs text-dao-text-hint ml-auto flex-shrink-0">
                        {formatTimeAgo(new Date(vote.created_at).getTime())}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {profile?.name && (
                        <AddressDisplay address={vote.voter} showExplorer={false} prefixLen={4} suffixLen={3} />
                      )}
                      {weight > 0n && (
                        <span className="text-xs text-dao-text-hint">{formatTokenAmount(weight)} votes</span>
                      )}
                    </div>
                  </div>
                </div>
                {reason?.reason && (
                  <p className="text-sm text-dao-text-secondary pl-8">
                    <SafeMarkdown>{reason.reason}</SafeMarkdown>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-dao-text-hint text-center py-4">
          No votes cast yet.
        </p>
      )}
    </Card>
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// VoteReasonModal - Rendered via portal, fully isolated from parent re-renders.
// All state (textarea value, posting status) is internal.
// ═══════════════════════════════════════════════════════════════════════════

interface VoteReasonModalProps {
  isOpen: boolean
  onClose: () => void
  daoId: string
  proposalId: number
  voteDirection: boolean | null
}

export function VoteReasonModal({
  isOpen,
  onClose,
  daoId,
  proposalId,
  voteDirection,
}: VoteReasonModalProps) {
  // Capture props into refs so the portal content never re-renders from prop changes
  const daoIdRef = useRef(daoId)
  const proposalIdRef = useRef(proposalId)
  const voteDirectionRef = useRef(voteDirection)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    daoIdRef.current = daoId
    proposalIdRef.current = proposalId
    voteDirectionRef.current = voteDirection
    onCloseRef.current = onClose
  })

  if (!isOpen) return null

  return createPortal(
    <VoteReasonModalInner
      daoIdRef={daoIdRef}
      proposalIdRef={proposalIdRef}
      voteDirectionRef={voteDirectionRef}
      onCloseRef={onCloseRef}
    />,
    document.body,
  )
}

/**
 * Inner modal component — rendered in a portal, owns all its own state.
 * Uses refs for parent data so it never re-renders from parent changes.
 */
function VoteReasonModalInner({
  daoIdRef,
  proposalIdRef,
  voteDirectionRef,
  onCloseRef,
}: {
  daoIdRef: React.RefObject<string>
  proposalIdRef: React.RefObject<number>
  voteDirectionRef: React.RefObject<boolean | null>
  onCloseRef: React.RefObject<() => void>
}) {
  const [reasonText, setReasonText] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handlePost = useCallback(async () => {
    if (!reasonText.trim()) return
    setIsPosting(true)
    try {
      await posterService.postVoteReason({
        daoAddress: daoIdRef.current!.toLowerCase(),
        proposalId: proposalIdRef.current!,
        vote: voteDirectionRef.current ?? undefined,
        reason: reasonText.trim(),
      })
    } catch (err) {
      console.warn('[VoteReasonModal] Failed to post vote reason:', err)
    } finally {
      setIsPosting(false)
      setReasonText('')
      onCloseRef.current!()
    }
  }, [reasonText, daoIdRef, proposalIdRef, voteDirectionRef, onCloseRef])

  const handleClose = useCallback(() => {
    setReasonText('')
    onCloseRef.current!()
  }, [onCloseRef])

  return (
    <Modal isOpen onClose={handleClose} title="Share Your Reasoning" size="md">
      <div className="space-y-4">
        <p className="text-sm text-dao-text-muted">
          Your vote has been submitted. Would you like to share your reasoning?
          This will be posted on-chain and is permanent.
        </p>
        <textarea
          ref={textareaRef}
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder="Share your reasoning (optional)..."
          maxLength={2000}
          rows={4}
          className="input w-full resize-none"
        />
        <p className="text-xs text-dao-text-hint text-right">
          {reasonText.length}/2000
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={handlePost}
            loading={isPosting}
            disabled={!reasonText.trim() || isPosting}
          >
            Post Reason
          </Button>
          <Button variant="secondary" onClick={handleClose}>
            Skip
          </Button>
        </div>
      </div>
    </Modal>
  )
}
