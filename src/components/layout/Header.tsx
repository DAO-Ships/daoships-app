import { ConnectWallet } from '@/components/common/ConnectWallet'
import { StatusDot } from '@/components/common/StatusDot'
import { useIndexerConnection } from '@/hooks/useIndexerConnection'
import { NETWORK_CONFIG } from '@/config/contracts'
import { useUiStore } from '@/store/uiStore'

// ═══════════════════════════════════════════════════════════════════════════
// Header - App title, network indicator, wallet connect
// ═══════════════════════════════════════════════════════════════════════════

export function Header() {
  const { status, isLoading, isEnabled } = useIndexerConnection()
  const { toggleSidebar } = useUiStore()

  const indexerStatus = isLoading || !isEnabled
    ? 'unknown'
    : status?.healthy
      ? 'healthy'
      : 'error'

  return (
    <header className="flex items-center justify-between h-16 px-6 bg-dao-dark-2 border-b border-dao-border flex-shrink-0">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden text-dao-text-muted hover:text-dao-text transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-lg font-bold font-display text-dao-text tracking-wide">
          DAO Ships
        </h1>
      </div>

      {/* Center: network + indexer status */}
      <div className="hidden sm:flex items-center gap-3">
        <span className="text-sm text-dao-text-muted">{NETWORK_CONFIG.chainName}</span>
        {isEnabled && (
          <StatusDot
            status={indexerStatus}
            label={indexerStatus === 'healthy' ? 'Indexer' : 'Indexer offline'}
          />
        )}
      </div>

      {/* Right: wallet */}
      <ConnectWallet />
    </header>
  )
}
