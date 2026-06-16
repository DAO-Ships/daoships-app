import { useQuery } from '@tanstack/react-query'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'
import type { DaoRecord, TrustLevel } from '@/types'

/**
 * Parsed vote reason from Poster content_json.
 */
export interface VoteReason {
  voterAddress: string
  reason: string
  /** Self-reported vote direction — NOT canonical. Use ds_votes.approved for truth. */
  vote?: boolean
  proposalId?: number
  createdAt: string
  /** Indexer-assigned trust level at posting time. */
  trustLevel?: TrustLevel
}

/**
 * Extract only known fields from a raw vote reason record.
 */
function extractVoteReason(record: DaoRecord): VoteReason {
  const json = (record.content_json ?? {}) as Record<string, unknown>
  return {
    voterAddress: record.user_address,
    reason: typeof json.reason === 'string' ? json.reason : '',
    vote: typeof json.vote === 'boolean' ? json.vote : undefined,
    proposalId: typeof json.proposalId === 'number' ? json.proposalId : undefined,
    createdAt: record.created_at,
    trustLevel: record.trust_level,
  }
}

/**
 * Fetches vote reasons for a specific proposal.
 */
export function useVoteReasons(daoId: string | undefined, proposalId: number | undefined) {
  return useQuery({
    queryKey: ['voteReasons', daoId, proposalId],
    queryFn: async (): Promise<VoteReason[]> => {
      const records = await recordIndexerService.getVoteReasons(daoId!, proposalId!)
      return records.map(extractVoteReason)
    },
    enabled: !!daoId && proposalId !== undefined,
    staleTime: 30_000,
  })
}
