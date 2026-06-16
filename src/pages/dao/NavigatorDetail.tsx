import { useParams, useOutletContext, Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import type { Dao, NavigatorEvent } from '@/types'
import { NAVIGATOR_PERMISSION_LABELS, NavigatorPermission } from '@/types'
import { NAVIGATOR_TRUST_CONFIG, isNavigatorVisible } from '@/types/trust'
import { useNavigators } from '@/hooks/useNavigators'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useNavigatorEvents } from '@/hooks/useNavigatorEvents'
import { useMember } from '@/hooks/useMember'
import { useWallet } from '@/hooks/useWallet'
import { getNavigatorPlugin, UnknownPlugin } from '@/components/navigator/plugins'
import { NavigatorActivationPrompt } from '@/components/navigator/NavigatorActivationPrompt'
import { Card } from '@/components/common/Card'
import { Loading } from '@/components/common/Loading'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'
import { getCatalogEntry } from '@/config/navigatorCatalog'
import { NavigatorGlyph } from '@/components/navigator/NavigatorGlyph'
import { PERMISSION_COLORS, formatPermissionLabel } from '@/utils/navigatorPermissions'
import { isNavigatorExpired } from '@/utils/navigatorExpiry'
import { getNavigatorSanctionInfo, getNavigatorUnsanctionInfo } from '@/utils/navigatorSanction'

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

export function NavigatorDetail() {
  const { dao } = useOutletContext<DaoContext>()
  usePageTitle('Navigator', dao.name)
  const { navigatorAddress } = useParams<{ navigatorAddress: string }>()
  const { address: userAddress, connected } = useWallet()
  const { data: navigators, isLoading: navigatorsLoading } = useNavigators(dao.id)

  // Find the navigator from the list
  const navigator = navigators?.find(
    (n) => n.navigator_address.toLowerCase() === navigatorAddress?.toLowerCase(),
  )

  // Module-class navigators (e.g. Budget) are born is_active=false until the vault
  // enables them — but we still want to render their plugin (which surfaces the
  // "enable treasury access" flow), so don't gate them on is_active like permissioned ones.
  const isModuleNav = navigator?.navigator_type === 'BudgetNavigator'

  // Detect type via on-chain config (config reads work regardless of is_active).
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator && (navigator.is_active || isModuleNav) ? navigator.navigator_address : undefined,
  )

  // Event history
  const { data: events, isLoading: eventsLoading } = useNavigatorEvents(
    dao.id,
    navigatorAddress,
  )

  // Membership — only members can propose activating an unsanctioned navigator.
  const { data: currentMember } = useMember(dao.id, userAddress ?? undefined)
  const isMember = currentMember ? (safeBigInt(currentMember.shares) > 0n || safeBigInt(currentMember.loot) > 0n) : false

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

  const detectedType = configResult?.type || navigator.navigator_type || 'unknown'
  const catalogEntry = getCatalogEntry(detectedType)
  const typeLabel = catalogEntry?.name || NAVIGATOR_TYPE_LABELS[detectedType] || navigator.navigator_type || 'Navigator'
  const permLabel =
    navigator.permission_label ||
    NAVIGATOR_PERMISSION_LABELS[navigator.permission as keyof typeof NAVIGATOR_PERMISSION_LABELS] ||
    'unknown'
  const colorClass = PERMISSION_COLORS[permLabel] || 'bg-dao-surface text-dao-text-muted'
  const daoName = dao.name || `DAO ${dao.id.slice(0, 8)}...`

  // Anyone can deploy a navigator claiming this DAO and set its name/description. Only honor
  // attacker-controllable name/description in the hero when the navigator is trusted by default
  // (sanctioned or permissioned); otherwise fall back to neutral type copy so an unsanctioned
  // navigator can't present a spoofed, legitimate-looking title. The page still loads (with its
  // trust warning + sanction prompt) so members can review and sanction it.
  const isTrusted = isNavigatorVisible(navigator, false)
  const trustedName = isTrusted ? navigator.name : null
  const trustedDescription = isTrusted ? navigator.description : null

  // Type-specific hero messaging
  const heroTitle = trustedName
    || (detectedType === 'OnboarderNavigator' ? `Join ${daoName}`
      : detectedType === 'ERC20TributeNavigator' ? `Join ${daoName} with Token Tribute`
      : typeLabel)

  const heroSubtitle = trustedDescription
    || (detectedType === 'OnboarderNavigator' ? 'Purchase shares to become a member and participate in governance.'
      : detectedType === 'ERC20TributeNavigator' ? 'Contribute tokens to receive shares and join the community.'
      : catalogEntry?.shortDescription || 'Interact with this navigator.')

  // Resolve the plugin component
  const PluginComponent = getNavigatorPlugin(detectedType) || UnknownPlugin

  const expiry = (configResult?.config as { expiry?: bigint } | null)?.expiry
  const expired = isNavigatorExpired(expiry)
  const removalHref = `/dao/${dao.id}/proposals/new?type=navigator&addAddress=${navigator.navigator_address}&addPermission=0${navigator.name ? `&addName=${encodeURIComponent(navigator.name)}` : ''}`

  // Read-only navigators (no permission, never granted) carry a self-asserted DAO binding.
  // Warn when this DAO has not sanctioned the navigator via governance.
  const isReadOnly = navigator.permission === NavigatorPermission.None && !navigator.permission_ever_granted
  const showTrustWarning = isReadOnly && navigator.trust_status !== 'sanctioned'

  // Listed-but-not-actionable detection + the class-correct "propose to activate it" CTA.
  const sanctionInfo = getNavigatorSanctionInfo(navigator, { daoId: dao.id, vaultAddress: dao.avatar })
  // The inverse, on-page: a sanctioned read-only navigator can be unsanctioned here too.
  const unsanctionInfo = getNavigatorUnsanctionInfo(navigator, { daoId: dao.id })

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
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Navigator icon */}
          <NavigatorGlyph type={detectedType} size="lg" tone="accent" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold font-display text-dao-text min-w-0 break-words">{heroTitle}</h1>
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
              {expired && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                  Expired
                </span>
              )}
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

      {/* Listed but not actionable — let any member propose the class-correct activation. */}
      {sanctionInfo?.needsSanction && (
        <NavigatorActivationPrompt info={sanctionInfo} isMember={isMember} connected={connected} />
      )}

      {/* Sanctioned read-only navigator — let any member propose unsanctioning it here (subtle,
          since the navigator is already working). */}
      {unsanctionInfo && (
        <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-dao-text">{unsanctionInfo.title}</p>
            <p className="text-xs text-dao-text-muted mt-0.5">{unsanctionInfo.description}</p>
            {(!connected || !isMember) && (
              <p className="text-xs text-dao-text-hint mt-1">
                {!connected
                  ? 'Connect your wallet and join the DAO to propose changes.'
                  : 'Only DAO members can propose changes.'}
              </p>
            )}
          </div>
          {connected && isMember && (
            <Link to={unsanctionInfo.href} className="btn-secondary text-sm whitespace-nowrap flex-shrink-0">
              {unsanctionInfo.ctaLabel}
            </Link>
          )}
        </div>
      )}

      {/* Expired callout — offer removal via governance proposal */}
      {expired && navigator.is_active && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-red-400 font-medium">This navigator has expired.</p>
            <p className="text-xs text-dao-text-muted mt-0.5">
              No further actions can be taken through it. You may propose removing it via governance.
            </p>
          </div>
          {connected && (
            <Link
              to={removalHref}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              Propose Removal
            </Link>
          )}
        </div>
      )}

      {/* Trust warning — read-only navigator the DAO hasn't sanctioned via governance */}
      {showTrustWarning && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400 font-medium">
            {navigator.trust_status === 'self_asserted'
              ? 'This navigator has not been sanctioned by the DAO.'
              : 'The DAO revoked its endorsement of this navigator.'}
          </p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            {NAVIGATOR_TRUST_CONFIG[navigator.trust_status].description}. Anyone can deploy a contract
            claiming to belong to this DAO — treat its activity as unverified until the DAO endorses it
            through a governance proposal.
          </p>
        </div>
      )}

      {/* Direct-send warning (subtle, not alarming for new members) */}
      <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-2.5 flex items-center gap-2">
        <svg aria-hidden="true" className="w-4 h-4 text-dao-text-hint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-dao-text-hint">
          Always use the form below to onboard. Do not send QUAI directly to the contract address.
        </p>
      </div>

      {/* Plugin component */}
      {(navigator.is_active || isModuleNav) && !configLoading && (
        <PluginComponent
          navigator={navigator}
          daoId={dao.id}
          userAddress={userAddress}
          connected={connected}
        />
      )}

      {!navigator.is_active && !isModuleNav && !sanctionInfo?.needsSanction && (
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
