import { useQuery } from '@tanstack/react-query'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'

/**
 * Parsed member profile from Poster content_json.
 */
export interface MemberProfile {
  name?: string
  bio?: string
  avatar?: string
  /** Social links, label -> URL. Written by profileUpdate.ts; rendered by DelegateCard. */
  links?: Record<string, string>
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
    links: extractLinks(obj.links),
  }
}

/**
 * Extract a label -> URL map, keeping only own string-valued entries.
 * Mirrors the write shape in profileUpdate.ts. Skips inherited/prototype keys and
 * non-string values so attacker-authored Poster content cannot smuggle objects
 * into the render path. Returns undefined when there is nothing usable.
 */
function extractLinks(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (typeof value === 'string' && value !== '') out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
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
