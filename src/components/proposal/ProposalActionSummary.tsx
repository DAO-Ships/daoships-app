import { useMemo } from 'react'
import { decodeProposalActions, type DecodedAction } from '@/services/utils/ProposalDecoder'
import { useNavigators } from '@/hooks/useNavigators'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { Card } from '@/components/common/Card'
import { CustomActionDetail } from './CustomActionDetail'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'
import { safeHref } from '@/utils/url'
import { formatDuration } from '@/utils/time'
import { formatTokenAmount, bpsToPercent } from '@/utils/format'
import { extractTheme } from '@/utils/daoTheme'
import type { Navigator } from '@/types/navigator'

// Theme swatches to preview, in display order (keys mirror DaoTheme).
const THEME_SWATCH_KEYS: Array<['primary' | 'secondary' | 'accent' | 'background' | 'surface' | 'text', string]> = [
  ['primary', 'Primary'],
  ['accent', 'Accent'],
  ['background', 'Background'],
  ['surface', 'Surface'],
  ['text', 'Text'],
  ['secondary', 'Secondary'],
]

// ═══════════════════════════════════════════════════════════════════════════
// ProposalActionSummary - Decodes and displays proposal actions for voters
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalActionSummaryProps {
  proposalData?: string | null
  daoId?: string
}

/**
 * Surfaces the two per-entry facts the decoder used to discard.
 *
 * Both are attacker-controllable and neither is implied by the action label, so an
 * entry could send the treasury or execute in the DAO's own storage context while
 * rendering as a routine governance action.
 */
function ActionRiskFlags({ action }: { action: DecodedAction }) {
  // The native-QUAI transfer branch already renders this value as its amount.
  const isNativeTransfer = action.type === 'transfer' && action.details.token === 'QUAI'
  const carriesValue = action.nativeValue !== '0' && !isNativeTransfer
  const isDelegateCall = action.operation === 1

  if (!carriesValue && !isDelegateCall) return null

  return (
    <div className="mt-1 space-y-1">
      {carriesValue && (
        <p className="text-xs font-medium text-red-400">
          ⚠ Also sends {formatTokenAmount(action.nativeValue)} QUAI of native value
        </p>
      )}
      {isDelegateCall && (
        <p className="text-xs font-medium text-red-400">
          ⚠ DELEGATECALL — this code executes in the DAO&apos;s own context and can
          modify its storage
        </p>
      )}
    </div>
  )
}

function ActionIcon({ type }: { type: DecodedAction['type'] }) {
  const paths: Record<string, string> = {
    transfer: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    mintShares: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    burnShares: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6',
    mintLoot: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    burnLoot: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6',
    setGovernanceConfig: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    queueGovernanceConfig: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    setNavigators: 'M13 10V3L4 14h7v7l9-11h-7z',
    setGuildTokens: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    posterPost: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    custom: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  }
  return (
    <svg aria-hidden="true" className="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[type] || paths.custom} />
    </svg>
  )
}

function ProfileChanges({ content }: { content: Record<string, unknown> }) {
  // Extract only known profile fields — ignore any extra keys the proposer
  // may have included. This prevents rendering of unexpected or malicious
  // content (e.g. script URLs dressed up as a "custom" field).
  const { name, description, avatar, banner } = content as {
    name?: unknown
    description?: unknown
    avatar?: unknown
    banner?: unknown
  }
  const links = content.links as Record<string, unknown> | undefined
  const tags = content.tags as unknown[] | undefined
  // Re-validate the theme to strict hex before any color reaches CSS — the proposal
  // content is proposer-supplied and not yet indexer-processed (FRONTEND_SECURITY_GUIDE §2/§5).
  const theme = extractTheme(content)

  const rows: Array<[string, string]> = []
  if (typeof name === 'string' && name) rows.push(['Name', name])
  if (typeof description === 'string' && description) rows.push(['Description', description])
  if (typeof avatar === 'string' && avatar) rows.push(['Avatar', avatar])
  if (typeof banner === 'string' && banner) rows.push(['Banner', banner])

  const hasLinks =
    links && typeof links === 'object' && !Array.isArray(links) && Object.keys(links).length > 0
  const hasTags = Array.isArray(tags) && tags.length > 0

  if (rows.length === 0 && !hasLinks && !hasTags && !theme) return null

  return (
    <div className="mt-2 space-y-2">
      {rows.map(([key, value]) => (
        <div key={key} className="text-xs">
          <span className="text-dao-text-muted font-medium">{key}:</span>{' '}
          <span className="text-dao-text-secondary break-all">
            {value || <em className="text-dao-text-hint">cleared</em>}
          </span>
        </div>
      ))}
      {hasLinks && (
        <div className="text-xs">
          <span className="text-dao-text-muted font-medium">Links:</span>{' '}
          <span className="text-dao-text-secondary font-mono text-2xs">
            {Object.keys(links as Record<string, unknown>)
              .filter((k) => typeof (links as Record<string, unknown>)[k] === 'string')
              .join(', ')}
          </span>
        </div>
      )}
      {hasTags && (
        <div className="text-xs">
          <span className="text-dao-text-muted font-medium">Tags:</span>{' '}
          <span className="text-dao-text-secondary">
            {(tags as unknown[]).filter((t): t is string => typeof t === 'string').join(', ')}
          </span>
        </div>
      )}
      {theme && (
        <div className="text-xs">
          <span className="text-dao-text-muted font-medium">Color scheme:</span>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {THEME_SWATCH_KEYS.map(([key, label]) =>
              theme[key] ? (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-4 w-4 rounded border border-dao-border flex-shrink-0"
                    style={{ background: theme[key] }}
                  />
                  <span className="font-mono text-2xs text-dao-text-secondary">
                    {label} {theme[key]}
                  </span>
                </span>
              ) : null,
            )}
            {theme.mode && (
              <span className="text-2xs text-dao-text-hint">prefers {theme.mode}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Break a decoded governance-config blob into its human-readable parameters. */
function GovernanceConfigChanges({ config }: { config: Record<string, unknown> }) {
  const asNum = (k: string) => (typeof config[k] === 'number' ? config[k] as number : Number(config[k]))
  const asBig = (k: string) => { try { return BigInt(config[k] as string) } catch { return 0n } }

  const defaultExpiry = asNum('defaultExpiryWindow')
  const rows: Array<[string, string]> = [
    ['Voting period', formatDuration(asNum('votingPeriod'))],
    ['Grace period', asNum('gracePeriod') > 0 ? formatDuration(asNum('gracePeriod')) : 'None'],
    ['Quorum', `${bpsToPercent(Number(asBig('quorumPercent')))}%`],
    ['Min retention', `${bpsToPercent(Number(asBig('minRetentionPercent')))}%`],
    ['Proposal offering', `${formatTokenAmount(asBig('proposalOffering'))} QUAI`],
    ['Sponsor threshold', `${formatTokenAmount(asBig('sponsorThreshold'))} shares`],
    ['Default expiry window', defaultExpiry > 0 ? formatDuration(defaultExpiry) : '2×(voting+grace) fallback'],
  ]

  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
      {rows.map(([k, v]) => (
        <div key={k} className="text-xs flex items-baseline justify-between gap-2 border-b border-dao-border/30 py-1">
          <span className="text-dao-text-muted">{k}</span>
          <span className="text-dao-text-secondary font-mono text-right break-all">{v}</span>
        </div>
      ))}
    </div>
  )
}

function ActionDetail({ action, navigatorMap }: { action: DecodedAction; navigatorMap?: Map<string, Navigator> }) {
  const d = action.details

  switch (action.type) {
    case 'transfer':
      return (
        <div className="mt-2 text-xs space-y-1">
          <div><span className="text-dao-text-muted">Recipient:</span> <AddressDisplay address={d.recipient as string} /></div>
          <div><span className="text-dao-text-muted">Amount:</span> <span className="text-dao-text-secondary font-mono">{d.amount as string} {d.token === 'QUAI' ? 'QUAI' : ''}</span></div>
          {typeof d.token === 'string' && d.token !== 'QUAI' && (
            <div><span className="text-dao-text-muted">Token:</span> <AddressDisplay address={d.token as string} /></div>
          )}
        </div>
      )

    case 'mintShares':
    case 'burnShares':
    case 'mintLoot':
    case 'burnLoot': {
      const entries = (d.recipients || d.targets) as Array<{ address: string; amount: string }>
      return (
        <div className="mt-2 space-y-1">
          {entries.map((entry, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <AddressDisplay address={entry.address} />
              <span className="text-dao-text-secondary font-mono">{entry.amount}</span>
            </div>
          ))}
        </div>
      )
    }

    case 'posterPost': {
      const tag = d.tag as string | undefined
      const content = d.content

      // Announcement-specific rendering
      if (tag?.includes('announcement') && typeof content === 'object' && content !== null) {
        const ann = content as Record<string, unknown>
        const severity = (typeof ann.severity === 'string' ? ann.severity : 'info') as string
        const severityStyles: Record<string, string> = {
          info: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700/30',
          warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30',
          critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/30',
        }
        const severityText: Record<string, string> = {
          info: 'text-primary-700 dark:text-primary-300',
          warning: 'text-amber-700 dark:text-amber-300',
          critical: 'text-red-700 dark:text-red-300',
        }
        const severityBody: Record<string, string> = {
          info: 'text-primary-600 dark:text-primary-400/80',
          warning: 'text-amber-600 dark:text-amber-400/80',
          critical: 'text-red-600 dark:text-red-400/80',
        }
        const severityIcons: Record<string, string> = {
          info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
          warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
          critical: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        }
        return (
          <div className={`mt-2 rounded-xl border px-5 py-4 ${severityStyles[severity] || severityStyles.info}`}>
            <div className="flex items-start gap-3">
              <svg
                aria-hidden="true"
                className={`w-5 h-5 flex-shrink-0 mt-0.5 ${severityText[severity] || severityText.info}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={severityIcons[severity] || severityIcons.info} />
              </svg>
              <div className="min-w-0 flex-1">
                {typeof ann.title === 'string' && (
                  <p className={`text-sm font-semibold ${severityText[severity] || severityText.info}`}>
                    {ann.title}
                  </p>
                )}
                {typeof ann.body === 'string' && ann.body && (
                  <p className={`text-sm mt-1 ${severityBody[severity] || severityBody.info}`}>
                    <SafeMarkdown>{ann.body}</SafeMarkdown>
                  </p>
                )}
                {typeof ann.url === 'string' && ann.url && (
                  <a
                    href={safeHref(ann.url as string)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={`inline-flex items-center gap-1 text-sm mt-1.5 hover:underline ${severityText[severity] || severityText.info}`}
                  >
                    Learn more
                    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
                <p className="text-xs text-dao-text-hint mt-2 capitalize">
                  Severity: {severity}
                </p>
              </div>
            </div>
          </div>
        )
      }

      if (typeof content === 'object' && content !== null) {
        return <ProfileChanges content={content as Record<string, unknown>} />
      }
      return <p className="mt-1 text-xs text-dao-text-muted break-all">{String(content)}</p>
    }

    case 'setGuildTokens': {
      const tokens = d.tokens as Array<{ address: string; enabled: boolean }>
      return (
        <div className="mt-2 space-y-1">
          {tokens.map((t, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <AddressDisplay address={t.address} />
              <span className={t.enabled ? 'text-emerald-400' : 'text-red-400'}>
                {t.enabled ? 'Enable' : 'Disable'}
              </span>
            </div>
          ))}
        </div>
      )
    }

    case 'setGovernanceConfig':
      return d.config
        ? <GovernanceConfigChanges config={d.config as Record<string, unknown>} />
        : <p className="mt-1 text-xs text-dao-text-hint">Encoded governance config update</p>

    case 'queueGovernanceConfig':
      return (
        <div className="mt-1">
          <p className="text-xs text-accent-400">
            Queued through the timelock — it does not apply when the proposal passes. After a delay (a
            second ragequit window) anyone must execute it from the timelock’s page before it takes effect.
          </p>
          {d.config
            ? <GovernanceConfigChanges config={d.config as Record<string, unknown>} />
            : <p className="mt-1 text-xs text-dao-text-hint">Encoded governance config update</p>}
        </div>
      )

    case 'setNavigators': {
      const navs = d.navigators as Array<{ address: string; permission: number }>
      const permLabel = (p: number) => {
        const labels: Record<number, string> = {
          0: 'Disable', 1: 'Admin', 2: 'Manager', 3: 'Admin + Manager',
          4: 'Governor', 5: 'Admin + Governor', 6: 'Manager + Governor', 7: 'All',
        }
        return labels[p] ?? `Permission ${p}`
      }
      return (
        <div className="mt-2 space-y-2">
          {navs.map((n, i) => {
            const meta = navigatorMap?.get(n.address.toLowerCase())
            return (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 ${
                  n.permission === 0
                    ? 'border-red-500/30 bg-red-50 dark:bg-red-900/10'
                    : 'border-dao-border bg-dao-dark-2'
                }`}
              >
                <div className="flex items-center gap-2">
                  {meta?.name ? (
                    <span className="text-sm font-medium text-dao-text">{meta.name}</span>
                  ) : (
                    <AddressDisplay address={n.address} />
                  )}
                  {meta?.navigator_type && (
                    <span className="text-2xs bg-dao-dark-3 text-dao-text-hint rounded px-1.5 py-0.5">{meta.navigator_type}</span>
                  )}
                  <span className={`text-xs ml-auto flex-shrink-0 ${n.permission === 0 ? 'text-red-400 font-medium' : 'text-dao-text-secondary'}`}>
                    {permLabel(n.permission)}
                  </span>
                </div>
                {meta?.name && (
                  <p className="text-2xs text-dao-text-hint font-mono mt-0.5">{n.address.slice(0, 10)}...{n.address.slice(-4)}</p>
                )}
                {meta?.description && (
                  <p className="text-xs text-dao-text-muted mt-0.5 line-clamp-2">{meta.description}</p>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    case 'custom':
      return (
        <CustomActionDetail
          target={d.target as string}
          value={d.value as string}
          calldata={d.calldata as string}
          navigatorMap={navigatorMap}
        />
      )

    default:
      return null
  }
}

export function ProposalActionSummary({ proposalData, daoId }: ProposalActionSummaryProps) {
  const actions = useMemo(() => decodeProposalActions(proposalData, daoId), [proposalData, daoId])
  // Fetch the DAO's navigators when there are setNavigators OR custom actions: custom
  // actions need the navigator map to confirm a selector-decoded target's type before
  // rendering a trusted summary (see CustomActionDetail).
  const needsNavigators = actions.some((a) => a.type === 'setNavigators' || a.type === 'custom')
  const { data: navigators } = useNavigators(needsNavigators ? daoId : undefined)
  const navigatorMap = useMemo(() => {
    if (!navigators) return undefined
    const map = new Map<string, Navigator>()
    for (const nav of navigators) {
      map.set(nav.navigator_address.toLowerCase(), nav)
    }
    return map
  }, [navigators])

  if (actions.length === 0) {
    return (
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Proposed Actions</h2>}>
        <p className="text-sm text-dao-text-hint">
          {proposalData ? 'Unable to decode proposal actions' : 'Signal proposal (no on-chain actions)'}
        </p>
      </Card>
    )
  }

  return (
    <Card header={
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dao-text">Proposed Actions</h2>
        <span className="text-xs text-dao-text-hint">{actions.length} action{actions.length === 1 ? '' : 's'}</span>
      </div>
    }>
      <div className="space-y-4">
        {actions.map((action, i) => (
          <div key={i} className="flex gap-3">
            <div className="mt-0.5">
              <ActionIcon type={action.type} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dao-text">{action.label}</p>
              <ActionRiskFlags action={action} />
              <ActionDetail action={action} navigatorMap={navigatorMap} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
