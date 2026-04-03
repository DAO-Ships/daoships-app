import { useQuery } from '@tanstack/react-query'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'
import type { DaoRecord } from '@/types'

/**
 * Parsed DAO announcement from Poster content_json.
 */
export interface DaoAnnouncement {
  title: string
  body?: string
  severity: 'info' | 'warning' | 'critical'
  url?: string
  expiresAt?: string
  createdAt: string
}

/**
 * Extract only known fields from a raw announcement record.
 */
function extractAnnouncement(record: DaoRecord): DaoAnnouncement {
  const json = (record.content_json ?? {}) as Record<string, unknown>
  const severity = typeof json.severity === 'string' && ['info', 'warning', 'critical'].includes(json.severity)
    ? json.severity as 'info' | 'warning' | 'critical'
    : 'info'
  return {
    title: typeof json.title === 'string' ? json.title : 'Untitled',
    body: typeof json.body === 'string' ? json.body : undefined,
    severity,
    url: typeof json.url === 'string' && /^https?:\/\//i.test(json.url) ? json.url : undefined,
    expiresAt: typeof json.expiresAt === 'string' ? json.expiresAt : undefined,
    createdAt: record.created_at,
  }
}

/**
 * Returns true if an announcement is still active (not expired and not dismissed).
 */
function isActiveAnnouncement(a: DaoAnnouncement): boolean {
  // Empty title = explicit dismissal
  if (!a.title.trim()) return false
  // Check expiration
  if (a.expiresAt) {
    const expires = new Date(a.expiresAt).getTime()
    if (!isNaN(expires) && Date.now() > expires) return false
  }
  return true
}

/**
 * Fetches DAO announcements. Only VERIFIED trust (governance-approved).
 * Filters out expired and dismissed announcements.
 */
export function useDaoAnnouncements(daoId: string | undefined) {
  return useQuery({
    queryKey: ['daoAnnouncements', daoId],
    queryFn: async (): Promise<DaoAnnouncement[]> => {
      const records = await recordIndexerService.getDaoAnnouncements(daoId!)
      return records.map(extractAnnouncement).filter(isActiveAnnouncement)
    },
    enabled: !!daoId,
    staleTime: 60_000,
  })
}
