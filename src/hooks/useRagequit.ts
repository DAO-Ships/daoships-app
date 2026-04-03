import { useMutation, useQueryClient } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'

/**
 * Parameters for the ragequit operation.
 */
interface RagequitParams {
  daoShipAddress: string
  to: string
  sharesToBurn: bigint
  lootToBurn: bigint
  tokens: string[]
}

/**
 * Mutation hook for ragequitting from a DAO.
 * Burns shares/loot and withdraws proportional treasury tokens.
 * Invalidates members, treasury, and DAO data on success.
 */
export function useRagequit(daoId: string) {
  const queryClient = useQueryClient()

  const ragequitMutation = useMutation({
    mutationFn: (params: RagequitParams) =>
      daoService.ragequit(
        params.daoShipAddress,
        params.to,
        params.sharesToBurn,
        params.lootToBurn,
        params.tokens
      ),
    onSuccess: () => {
      const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ['members', daoId] })
        queryClient.invalidateQueries({ queryKey: ['member', daoId] })
        queryClient.invalidateQueries({ queryKey: ['treasury', daoId] })
        queryClient.invalidateQueries({ queryKey: ['treasuryBalances'] })
        queryClient.invalidateQueries({ queryKey: ['dao', daoId] })
      }
      invalidateAll()
      // Re-fetch after a delay to catch indexer lag
      setTimeout(invalidateAll, 4000)
    },
  })

  return {
    ragequit: ragequitMutation.mutateAsync,
    isRagequitting: ragequitMutation.isPending,
  }
}
