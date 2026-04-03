import { useMutation, useQueryClient } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'

/**
 * Mutation hook for delegating shares to another member.
 * Invalidates the members list on success so delegation changes are reflected.
 */
export function useDelegation(daoId: string) {
  const queryClient = useQueryClient()

  const delegateMutation = useMutation({
    mutationFn: ({ sharesAddress, to }: { sharesAddress: string; to: string }) =>
      daoService.delegate(sharesAddress, to),
    onSuccess: () => {
      const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ['members', daoId] })
        queryClient.invalidateQueries({ queryKey: ['member', daoId] })
        queryClient.invalidateQueries({ queryKey: ['dao', daoId] })
      }
      invalidateAll()
      // Re-fetch after a delay to catch indexer lag
      setTimeout(invalidateAll, 4000)
    },
  })

  return {
    delegate: delegateMutation.mutateAsync,
    isDelegating: delegateMutation.isPending,
  }
}
