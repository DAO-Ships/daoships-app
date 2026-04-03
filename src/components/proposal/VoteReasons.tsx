import { useState, useCallback, memo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useVoteReasons } from '@/hooks/useVoteReasons'
import { useMemberProfiles } from '@/hooks/useMemberProfile'
import { posterService } from '@/services/core/PosterService'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { MemberAvatar } from '@/components/member/MemberAvatar'
import { formatTimeAgo } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// VoteReasons - Display + post-vote reason modal (isolated from parent re-renders)
// ═══════════════════════════════════════════════════════════════════════════

interface VoteReasonsProps {
  daoId: string
  proposalId: number
}

/**
 * Displays vote reasons for a proposal and provides the post-vote reason modal.
 * Memoized to prevent parent re-renders (countdown ticks, realtime updates)
 * from stealing focus in the textarea.
 */
export const VoteReasons = memo(function VoteReasons({ daoId, proposalId }: VoteReasonsProps) {
  const { data: voteReasons } = useVoteReasons(daoId, proposalId)
  const { data: profiles } = useMemberProfiles(daoId)

  return (
    <Card header={<h2 className="text-lg font-semibold text-dao-text">Vote Reasons</h2>}>
      {voteReasons && voteReasons.length > 0 ? (
        <div className="divide-y divide-dao-border">
          {voteReasons.map((reason, i) => {
            const profile = profiles?.get(reason.voterAddress.toLowerCase())
            return (
              <div key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <MemberAvatar avatar={profile?.avatar} size={6} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {profile?.name ? (
                        <span className="text-sm font-medium text-dao-text truncate">{profile.name}</span>
                      ) : (
                        <AddressDisplay address={reason.voterAddress} showExplorer={false} />
                      )}
                      {reason.vote !== undefined && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          reason.vote
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {reason.vote ? 'Yes' : 'No'}
                        </span>
                      )}
                      <span className="text-xs text-dao-text-hint ml-auto flex-shrink-0">
                        {formatTimeAgo(new Date(reason.createdAt).getTime())}
                      </span>
                    </div>
                    {profile?.name && (
                      <AddressDisplay address={reason.voterAddress} showExplorer={false} prefixLen={4} suffixLen={3} />
                    )}
                  </div>
                </div>
                <p className="text-sm text-dao-text-secondary whitespace-pre-wrap pl-8">{reason.reason}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-dao-text-hint text-center py-4">
          No vote reasons submitted yet.
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    }
  }, [handleClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-dao-dark-3 border border-dao-border rounded-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dao-border">
          <h2 className="text-lg font-semibold text-dao-text">Share Your Reasoning</h2>
          <button
            onClick={handleClose}
            className="text-dao-text-muted hover:text-dao-text transition-colors p-1 rounded hover:bg-dao-surface"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
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
      </div>
    </div>
  )
}
