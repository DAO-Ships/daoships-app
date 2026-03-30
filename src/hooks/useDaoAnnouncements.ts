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
    createdAt: record.created_at,
  }
}

/**
 * Fetches DAO announcements. Only VERIFIED trust (governance-approved).
 */
export function useDaoAnnouncements(daoId: string | undefined) {
  return useQuery({
    queryKey: ['daoAnnouncements', daoId],
    queryFn: async (): Promise<DaoAnnouncement[]> => {
      const records = await recordIndexerService.getDaoAnnouncements(daoId!)
      return records.map(extractAnnouncement)
    },
    enabled: !!daoId,
    staleTime: 60_000,
  })
}
