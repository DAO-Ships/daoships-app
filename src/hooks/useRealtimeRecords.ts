import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's Poster records — profiles, announcements and vote reasons all
 * live in ds_records, so one subscription refreshes every derived view.
 */
export function useRealtimeRecords(daoId: string | undefined) {
  useRealtimeTable({
    channel: `records:${daoId}`,
    table: 'ds_records',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [
      ['voteReasons', daoId],
      ['memberProfile', daoId],
      ['memberProfiles', daoId],
      ['announcements', daoId],
      ['daoProfile', daoId],
    ],
    enabled: !!daoId,
  })
}
