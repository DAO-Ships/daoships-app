import { useQuery } from '@tanstack/react-query'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'

/**
 * Parsed member profile from Poster content_json.
 */
export interface MemberProfile {
  name?: string
  bio?: string
  avatar?: string
}

/**
 * Extract only known fields from a raw JSONB object to prevent prototype pollution.
 */
function extractMemberProfile(json: unknown): MemberProfile {
  if (!json || typeof json !== 'object') return {}
  const obj = json as Record<string, unknown>
  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    bio: typeof obj.bio === 'string' ? obj.bio : undefined,
    avatar: typeof obj.avatar === 'string' ? obj.avatar : undefined,
  }
}

/**
 * Fetches the latest member profile record for a specific member in a DAO.
 */
export function useMemberProfile(daoId: string | undefined, memberAddress: string | undefined) {
  return useQuery({
    queryKey: ['memberProfile', daoId, memberAddress],
    queryFn: async (): Promise<MemberProfile | null> => {
      const record = await recordIndexerService.getMemberProfile(daoId!, memberAddress!)
      if (!record?.content_json) return null
      return extractMemberProfile(record.content_json)
    },
    enabled: !!daoId && !!memberAddress,
    staleTime: 60_000,
  })
}

/**
 * Fetches all member profiles for a DAO in a single query.
 * Returns a map of lowercase address → MemberProfile.
 */
export function useMemberProfiles(daoId: string | undefined) {
  return useQuery({
    queryKey: ['memberProfiles', daoId],
    queryFn: async (): Promise<Map<string, MemberProfile>> => {
      const raw = await recordIndexerService.getMemberProfiles(daoId!)
      const profiles = new Map<string, MemberProfile>()
      for (const [addr, json] of raw) {
        profiles.set(addr, extractMemberProfile(json))
      }
      return profiles
    },
    enabled: !!daoId,
    staleTime: 60_000,
  })
}
