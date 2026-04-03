import { useParams, useOutletContext, Link } from 'react-router-dom'
import type { Dao, NavigatorEvent } from '@/types'
import { NAVIGATOR_PERMISSION_LABELS, type NavigatorPermissionLabel } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { useNavigators } from '@/hooks/useNavigators'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useNavigatorEvents } from '@/hooks/useNavigatorEvents'
import { useWallet } from '@/hooks/useWallet'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'
import { getNavigatorPlugin, UnknownPlugin } from '@/components/navigator/plugins'
import { Card } from '@/components/common/Card'
import { Loading } from '@/components/common/Loading'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount } from '@/utils/format'
import { getNavigatorIcon, getCatalogEntry } from '@/config/navigatorCatalog'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorDetail - Shell page that loads type-specific plugin components
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

const NAVIGATOR_TYPE_LABELS: Record<string, string> = {
  OnboarderNavigator: 'Onboarder Navigator',
  ERC20TributeNavigator: 'ERC20 Tribute Navigator',
  unknown: 'Custom Navigator',
}

const PERMISSION_COLORS: Record<string, string> = {
  none: 'bg-dao-surface text-dao-text-hint',
  admin: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  manager: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  admin_manager: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
  governor: 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400',
  admin_governor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400',
  manager_governor: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400',
  all: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
}

function formatPermissionLabel(label: string): string {
  return label
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' + ')
}

export function NavigatorDetail() {
  const { dao } = useOutletContext<DaoContext>()
  const { navigatorAddress } = useParams<{ navigatorAddress: string }>()
  const { address: userAddress, connected } = useWallet()
  const { data: navigators, isLoading: navigatorsLoading } = useNavigators(dao.id)

  // Find the navigator from the list
  const navigator = navigators?.find(
    (n) => n.navigator_address.toLowerCase() === navigatorAddress?.toLowerCase(),
  )

  // Detect type via on-chain config
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator?.is_active ? navigator.navigator_address : undefined,
  )

  // Event history
  const { data: events, isLoading: eventsLoading } = useNavigatorEvents(
    dao.id,
    navigatorAddress,
  )

  if (navigatorsLoading) {
    return <Loading fullPage size="lg" />
  }

  if (!navigator) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-2 text-sm text-dao-text-hint">
          <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
            {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
          </Link>
          <span>/</span>
          <Link to={`/dao/${dao.id}/navigators`} className="hover:text-primary-400 transition-colors">
            Navigators
          </Link>
          <span>/</span>
          <span className="text-dao-text-secondary">Not Found</span>
        </nav>
        <Card>
          <div className="text-center py-8">
            <p className="text-dao-text-muted">Navigator not found at address {navigatorAddress}</p>
            <Link
              to={`/dao/${dao.id}/navigators`}
              className="text-sm text-primary-400 hover:text-primary-300 mt-2 inline-block"
            >
              Back to navigators
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const detectedType = configResult?.type || 'unknown'
  const catalogEntry = getCatalogEntry(detectedType)
  const typeLabel = catalogEntry?.name || NAVIGATOR_TYPE_LABELS[detectedType] || navigator.navigator_type || 'Navigator'
  const iconPath = getNavigatorIcon(detectedType)
  const permLabel =
    navigator.permission_label ||
    NAVIGATOR_PERMISSION_LABELS[navigator.permission as keyof typeof NAVIGATOR_PERMISSION_LABELS] ||
    'unknown'
  const colorClass = PERMISSION_COLORS[permLabel] || 'bg-dao-surface text-dao-text-muted'
  const daoName = dao.name || `DAO ${dao.id.slice(0, 8)}...`

  // Type-specific hero messaging
  const heroTitle = navigator.name
    || (detectedType === 'OnboarderNavigator' ? `Join ${daoName}`
      : detectedType === 'ERC20TributeNavigator' ? `Join ${daoName} with Token Tribute`
      : typeLabel)

  const heroSubtitle = navigator.description
    || (detectedType === 'OnboarderNavigator' ? 'Purchase shares to become a member and participate in governance.'
      : detectedType === 'ERC20TributeNavigator' ? 'Contribute tokens to receive shares and join the community.'
      : catalogEntry?.shortDescription || 'Interact with this navigator.')

  // Resolve the plugin component
  const PluginComponent = getNavigatorPlugin(detectedType) || UnknownPlugin

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-hint" aria-label="Breadcrumb">
        <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
          {daoName}
        </Link>
        <span>/</span>
        <Link to={`/dao/${dao.id}/navigators`} className="hover:text-primary-400 transition-colors">
          Navigators
        </Link>
        <span>/</span>
        <span className="text-dao-text-secondary">{typeLabel}</span>
      </nav>

      {/* Hero header — welcoming landing page for new members */}
      <div className="card px-6 py-6">
        <div className="flex items-center gap-5">
          {/* Navigator icon */}
          <div className="w-14 h-14 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-7 h-7 text-accent-400" viewBox="0 0 24 24" fill="currentColor">
              <path d={iconPath} />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold font-display text-dao-text">{heroTitle}</h1>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  navigator.is_active && !navigator.paused
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : navigator.paused
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
              >
                {navigator.paused ? 'Paused' : navigator.is_active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <p className="text-sm text-dao-text-muted mb-2">{heroSubtitle}</p>
            <div className="flex items-center gap-3 text-xs text-dao-text-hint">
              <AddressDisplay address={navigator.navigator_address} />
              <span className={`font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
                {formatPermissionLabel(permLabel)}
              </span>
            </div>
            {configLoading && navigator.is_active && (
              <p className="text-xs text-dao-text-hint mt-2">Loading configuration...</p>
            )}
          </div>
        </div>
      </div>

      {/* Direct-send warning (subtle, not alarming for new members) */}
      <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-2.5 flex items-center gap-2">
        <svg className="w-4 h-4 text-dao-text-hint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-dao-text-hint">
          Always use the form below to onboard. Do not send QUAI directly to the contract address.
        </p>
      </div>

      {/* Plugin component */}
      {navigator.is_active && !configLoading && (
        <PluginComponent
          navigator={navigator}
          daoId={dao.id}
          userAddress={userAddress}
          connected={connected}
        />
      )}

      {!navigator.is_active && (
        <Card>
          <p className="text-sm text-dao-text-hint text-center py-4">
            This navigator is disabled and cannot be interacted with.
          </p>
        </Card>
      )}

      {/* Event history */}
      <Card header={<h2 className="text-sm font-semibold text-dao-text">Event History</h2>}>
        {eventsLoading ? (
          <Loading size="sm" />
        ) : events && events.length > 0 ? (
          <div className="divide-y divide-dao-border">
            {events.map((event: NavigatorEvent) => (
              <div key={event.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                        {event.event_type}
                      </span>
                      <span className="font-mono text-xs text-dao-text-hint truncate" title={event.contributor}>
                        {event.contributor.slice(0, 6)}...{event.contributor.slice(-4)}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-dao-text-hint">
                      {event.shares_minted && BigInt(event.shares_minted) > 0n && (
                        <span>+{formatTokenAmount(BigInt(event.shares_minted))} shares</span>
                      )}
                      {event.loot_minted && BigInt(event.loot_minted) > 0n && (
                        <span>+{formatTokenAmount(BigInt(event.loot_minted))} loot</span>
                      )}
                      {event.amount && BigInt(event.amount) > 0n && (
                        <span className="text-dao-text-hint">
                          ({formatTokenAmount(BigInt(event.amount))} tribute)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-dao-text-hint flex-shrink-0" title={event.created_at}>
                    {(() => {
                      const d = new Date(event.created_at)
                      // Detect invalid or far-future dates (indexer timestamp bug)
                      return d.getFullYear() > 2100 || isNaN(d.getTime())
                        ? `Block #${event.block_number}`
                        : d.toLocaleString()
                    })()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-dao-text-hint text-center py-4">No events recorded yet.</p>
        )}
      </Card>
    </div>
  )
}
