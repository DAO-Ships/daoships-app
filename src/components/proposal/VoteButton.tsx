import { useVoting } from '@/hooks/useVoting'
import { Button } from '@/components/common/Button'

// ═══════════════════════════════════════════════════════════════════════════
// VoteButton - Yes/No vote buttons
// ═══════════════════════════════════════════════════════════════════════════

interface VoteButtonProps {
  daoId: string
  proposalId: string
  disabled?: boolean
  onVote?: (approved: boolean) => void
}

export function VoteButton({ daoId, proposalId, disabled = false, onVote }: VoteButtonProps) {
  const { vote, isVoting, error } = useVoting(daoId, proposalId)

  const handleVote = async (approved: boolean) => {
    try {
      await vote(approved)
      onVote?.(approved)
    } catch {
      // Error is captured in the hook's error state
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={disabled || isVoting}
          loading={isVoting}
          onClick={() => handleVote(true)}
          className="flex-1 bg-green-600 hover:bg-green-700 border-green-500"
        >
          Vote Yes
        </Button>
        <Button
          variant="danger"
          size="md"
          disabled={disabled || isVoting}
          loading={isVoting}
          onClick={() => handleVote(false)}
          className="flex-1"
        >
          Vote No
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-400 text-center">
          {error.message || 'Vote failed'}
        </p>
      )}
    </div>
  )
}
