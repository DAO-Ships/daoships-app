import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useDao } from '@/hooks/useDao'
import { useDaoProfile } from '@/hooks/useDaoProfile'
import { useDaoTheme } from '@/hooks/useDaoTheme'
import { useDaoStore } from '@/store/daoStore'
import { useRealtimeMembers } from '@/hooks/useRealtimeMembers'
import { useRealtimeProposals } from '@/hooks/useRealtimeProposals'
import { useRealtimeRecords } from '@/hooks/useRealtimeRecords'
import { Loading } from '@/components/common/Loading'

// ═══════════════════════════════════════════════════════════════════════════
// DaoLayout - Wrapper for DAO routes: loads DAO data + renders sub-routes
// ═══════════════════════════════════════════════════════════════════════════

export function DaoLayout() {
  const { daoId } = useParams<{ daoId: string }>()
  const { data: dao, isLoading, error } = useDao(daoId)
  const { data: profile } = useDaoProfile(daoId)
  const { setCurrentDao, clearCurrentDao } = useDaoStore()

  // Apply the DAO's posted color scheme across the UI while on its routes.
  useDaoTheme(profile)

  // DAO-scoped realtime subscriptions — active for all sub-pages
  useRealtimeMembers(daoId)
  useRealtimeProposals(daoId)
  useRealtimeRecords(daoId)

  useEffect(() => {
    if (daoId) {
      setCurrentDao(daoId, dao?.name ?? undefined)
    }
    return () => {
      clearCurrentDao()
    }
  }, [daoId, dao?.name, setCurrentDao, clearCurrentDao])

  if (isLoading) {
    return <Loading fullPage size="lg" />
  }

  // Only show the not-found / error state when we have NO DAO at all. If a DAO was already
  // loaded, keep rendering it through a transient background refetch error (e.g. the indexer
  // briefly blipped and the wallet-dependent fallback couldn't run) so the user's flow isn't
  // interrupted by a momentary "DAO Not Found".
  if (!dao) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card p-8 text-center max-w-md">
          <svg
            aria-hidden="true"
            className="w-12 h-12 text-red-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-dao-text mb-2">DAO Not Found</h2>
          <p className="text-sm text-dao-text-muted">
            {error
              ? `Failed to load DAO: ${error instanceof Error ? error.message : 'Unknown error'}`
              : `Could not find DAO with address ${daoId}`}
          </p>
        </div>
      </div>
    )
  }

  return <Outlet context={{ dao, daoId, profile }} />
}
