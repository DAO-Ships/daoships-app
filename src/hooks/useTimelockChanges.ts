import { useQuery } from '@tanstack/react-query'
import { timelockIndexerService } from '@/services/indexer/TimelockIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a DAO's timelock changes (ds_timelock_changes), optionally scoped to one
 * navigator. Polls every 30s when visible (status transitions are time + event driven).
 */
export function useTimelockChanges(daoId: string | undefined, navigatorAddress: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['timelockChanges', daoId, navigatorAddress?.toLowerCase()],
    queryFn: () => timelockIndexerService.listChanges(daoId!, navigatorAddress!),
    enabled: !!daoId && !!navigatorAddress,
    refetchInterval: isVisible ? 30000 : false,
  })
}

/**
 * Config changes that bypassed an active timelock (ds_governance_config_history) — the
 * trust warning surfaced on the DAO governance/settings pages.
 */
export function useBypassedConfigChanges(daoId: string | undefined) {
  return useQuery({
    queryKey: ['bypassedConfigChanges', daoId],
    queryFn: () => timelockIndexerService.listBypassedConfigChanges(daoId!),
    enabled: !!daoId,
    staleTime: 60_000,
  })
}
