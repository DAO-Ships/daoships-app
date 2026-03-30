import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { Dao } from '@/types'
import { useNavigators } from '@/hooks/useNavigators'
import { useWallet } from '@/hooks/useWallet'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { EmptyState } from '@/components/common/EmptyState'
import { NavigatorCard } from '@/components/navigator/NavigatorCard'
import { NavigatorCatalog } from '@/components/navigator/NavigatorCatalog'

// ═══════════════════════════════════════════════════════════════════════════
// Navigators - Navigator list with permission display and interaction UIs
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

export function Navigators() {
  const { dao } = useOutletContext<DaoContext>()
  const { data: navigators, isLoading, error } = useNavigators(dao.id)
  const { connected } = useWallet()
  const [showCatalog, setShowCatalog] = useState(false)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-hint">
        <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
          {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
        </Link>
        <span>/</span>
        <span className="text-dao-text-secondary">Navigators</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold font-display text-dao-text">Navigators</h1>
        <p className="text-dao-text-muted mt-1">
          Navigators are external contracts that have been granted special
          permissions to interact with this DAO.
        </p>
      </div>

      {/* Lock status */}
      <Card header={<h2 className="text-sm font-semibold text-dao-text">Permission Locks</h2>}>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <p className="text-dao-text-hint text-xs mb-1">Admin</p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                dao.admin_locked
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {dao.admin_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <div className="text-center">
            <p className="text-dao-text-hint text-xs mb-1">Manager</p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                dao.manager_locked
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {dao.manager_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <div className="text-center">
            <p className="text-dao-text-hint text-xs mb-1">Governor</p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                dao.governor_locked
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {dao.governor_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
        </div>
      </Card>

      {/* Navigator list */}
      {isLoading ? (
        <Loading fullPage />
      ) : error ? (
        <EmptyState
          title="Failed to load navigators"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        />
      ) : navigators && navigators.length > 0 ? (
        <div className="space-y-3">
          {navigators.map((navigator) => (
            <NavigatorCard key={navigator.id} navigator={navigator} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No navigators"
          description="This DAO has no navigators installed. Navigators can be added through governance proposals."
        />
      )}

      {/* Add Navigator */}
      {connected && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCatalog(!showCatalog)}
          >
            {showCatalog ? 'Hide Catalog' : '+ Add Navigator'}
          </Button>
        </div>
      )}

      {/* Navigator Catalog */}
      {connected && showCatalog && (
        <Card>
          <NavigatorCatalog
            daoAddress={dao.id}
            onClose={() => setShowCatalog(false)}
          />
        </Card>
      )}
    </div>
  )
}

