import { Link } from 'react-router-dom'
import { ConnectWallet } from '@/components/common/ConnectWallet'
import { StatusDot } from '@/components/common/StatusDot'
import { useIndexerConnection } from '@/hooks/useIndexerConnection'
import { useIndexerState } from '@/hooks/useIndexerState'
import { NETWORK_CONFIG, IS_MAINNET } from '@/config/contracts'
import { useUiStore } from '@/store/uiStore'
import { useDaoStore } from '@/store/daoStore'

// ═══════════════════════════════════════════════════════════════════════════
// Header - App title, network indicator, wallet connect
// ═══════════════════════════════════════════════════════════════════════════

export function Header() {
  const { status, isLoading, isEnabled } = useIndexerConnection()
  const { data: indexerState } = useIndexerState()
  const { toggleSidebar } = useUiStore()
  const { currentDaoId, currentDaoName } = useDaoStore()

  const isSyncing = indexerState?.is_syncing === true
  const indexerStatus = isLoading || !isEnabled
    ? 'unknown'
    : !status?.healthy
      ? 'error'
      : isSyncing
        ? 'warning'
        : 'healthy'
  const indexerLabel = indexerStatus === 'healthy'
    ? 'Indexer'
    : indexerStatus === 'warning'
      ? `Syncing${indexerState?.last_block_number ? ` — block ${indexerState.last_block_number}` : ''}`
      : 'Indexer offline'

  return (
    <header className="flex items-center justify-between h-16 px-4 sm:px-6 bg-dao-dark-2 border-b border-dao-border flex-shrink-0">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={toggleSidebar}
          className="lg:hidden text-dao-text-muted hover:text-dao-text transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg aria-hidden="true" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-lg font-bold font-display text-dao-text tracking-wide hover:text-primary-400 transition-colors">
            DAOShips
          </Link>
          {currentDaoId && currentDaoName && (
            <>
              <span className="text-dao-text-hint">/</span>
              <Link
                to={`/dao/${currentDaoId}`}
                className="text-sm font-semibold text-dao-text-secondary hover:text-primary-400 transition-colors truncate max-w-[120px] sm:max-w-[200px]"
              >
                {currentDaoName}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Center: network + indexer status */}
      <div className="hidden sm:flex items-center gap-3">
        {!IS_MAINNET && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {NETWORK_CONFIG.chainName}
          </span>
        )}
        {isEnabled && (
          <StatusDot status={indexerStatus} label={indexerLabel} />
        )}
      </div>

      {/* Right: compact indexer status (mobile only) + wallet */}
      <div className="flex items-center gap-3">
        {isEnabled && (
          <span className="sm:hidden" title={indexerLabel}>
            <StatusDot status={indexerStatus} />
          </span>
        )}
        <ConnectWallet />
      </div>
    </header>
  )
}
