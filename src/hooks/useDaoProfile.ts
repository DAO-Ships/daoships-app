import { useQuery } from '@tanstack/react-query'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'

/**
 * Fetches the latest DAO profile record from ds_records.
 * Returns content_json with links, tags, and other profile metadata.
 * Falls back to null if no profile record exists.
 */
export function useDaoProfile(daoId: string | undefined) {
  return useQuery({
    queryKey: ['daoProfile', daoId],
    queryFn: () => recordIndexerService.getDaoProfile(daoId!),
    enabled: !!daoId,
    staleTime: 60_000,
  })
}
