import { useMutation, useQueryClient } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'

/**
 * Mutation hooks for proposal lifecycle actions: sponsor, process, cancel.
 * Follows the same pattern as useVoting.ts.
 * Each mutation invalidates the proposal and proposals list caches on success.
 */
export function useProposalActions(daoId: string, proposalId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['proposal', daoId, proposalId] })
    queryClient.invalidateQueries({ queryKey: ['proposals', daoId] })
  }

  const sponsorMutation = useMutation({
    mutationFn: () => daoService.sponsorProposal(daoId, Number(proposalId)),
    onSuccess: invalidate,
  })

  const processMutation = useMutation({
    mutationFn: (proposalData: string) =>
      daoService.processProposal(daoId, Number(proposalId), proposalData),
    onSuccess: invalidate,
  })

  const cancelMutation = useMutation({
    mutationFn: () => daoService.cancelProposal(daoId, Number(proposalId)),
    onSuccess: invalidate,
  })

  return {
    sponsor: sponsorMutation.mutateAsync,
    process: processMutation.mutateAsync,
    cancel: cancelMutation.mutateAsync,
    isSponsorPending: sponsorMutation.isPending,
    isProcessPending: processMutation.isPending,
    isCancelPending: cancelMutation.isPending,
    sponsorError: sponsorMutation.error,
    processError: processMutation.error,
    cancelError: cancelMutation.error,
  }
}
