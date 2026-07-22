import { useMutation, useQueryClient } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'

/**
 * Mutation hook for submitting a vote on a proposal.
 * Invalidates both the individual proposal and the proposals list on success
 * so the UI reflects updated vote tallies immediately.
 */
export function useVoting(daoId: string, proposalId: string) {
  const queryClient = useQueryClient()

  const voteMutation = useMutation({
    mutationFn: (approved: boolean) => daoService.submitVote(daoId, Number(proposalId), approved),
    onSuccess: () => {
      const run = () => {
        queryClient.invalidateQueries({ queryKey: ['proposal', daoId, proposalId] })
        queryClient.invalidateQueries({ queryKey: ['proposals', daoId] })
        queryClient.invalidateQueries({ queryKey: ['hasVoted', daoId] })
        // Matches useProposalVotes' key; ['votes', ...] matched no registered query.
        queryClient.invalidateQueries({ queryKey: ['proposalVotes', `${daoId}-${proposalId}`] })
      }
      run()
      setTimeout(run, 4000)
    },
  })

  return {
    vote: voteMutation.mutateAsync,
    isVoting: voteMutation.isPending,
    error: voteMutation.error,
  }
}
