import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { NavigatorPluginProps } from './index'
import { mapContractError } from './pluginErrors'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useMember } from '@/hooks/useMember'
import { useTimelockChanges } from '@/hooks/useTimelockChanges'
import { useRealtimeTimelockChanges } from '@/hooks/useRealtimeTimelockChanges'
import { navigatorService } from '@/services/core/NavigatorService'
import type { TimelockNavigatorConfig } from '@/services/core/NavigatorService'
import type { TimelockChangeRow } from '@/types'
import { computeTimelockStatus } from '@/types'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatDuration, formatCountdown } from '@/utils/time'
import { safeBigInt } from '@/utils/bigint'
import {
  buildCancelChangeAction,
  buildEmergencyCancelAllAction,
  buildTimelockPauseAction,
  buildTimelockUnpauseAction,
  buildTimelockProposalHref,
} from '@/utils/timelockProposals'

// ═══════════════════════════════════════════════════════════════════════════
// TimelockPlugin - Delayed governance-config changes (GOVERNOR navigator)
// ───────────────────────────────────────────────────────────────────────────
// Changes are QUEUED by governance (a passed proposal calling queueChange) and become
// executable after `delay` seconds (a second ragequit window). Execution is PERMISSIONLESS
// once matured — anyone cranks it. cancel/emergencyCancelAll/pause are avatar-only → deep-links.
// ═══════════════════════════════════════════════════════════════════════════

const ERROR_MAP: Record<string, string> = {
  ChangeNotReady: 'This change is still in its delay window.',
  ChangeExpired: "This change's execution window has passed — it can only be cancelled now.",
  ChangeAlreadyExecuted: 'This change was already executed.',
  ChangeAlreadyCancelled: 'This change was cancelled.',
  ConfigHashMismatch: "Config bytes don't match the queued change.",
  IsPaused: 'Queueing is paused on this timelock.',
  ChangeDoesNotExist: 'No such change.',
}

function mapError(err: unknown): string {
  return mapContractError(err, ERROR_MAP)
}

export function TimelockPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
  useRealtimeTimelockChanges(daoId)
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator.is_active ? navigator.navigator_address : undefined,
  )

  if (configLoading) {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Loading navigator configuration...</p>
      </Card>
    )
  }

  const config = configResult?.type === 'TimelockNavigator' ? configResult.config : null

  return (
    <TimelockInteraction
      navigatorAddress={navigator.navigator_address}
      config={config}
      permission={navigator.permission}
      daoId={daoId}
      userAddress={userAddress}
      connected={connected}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function TimelockInteraction({
  navigatorAddress,
  config,
  permission,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: TimelockNavigatorConfig | null
  permission: number
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const { data: changes, isLoading } = useTimelockChanges(daoId, navigatorAddress)

  // Queue/pause/cancel run as governance proposals → require DAO membership. The
  // permissionless execute-when-matured action stays open to any connected wallet.
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

  // The timelock must hold GOVERNOR (bit 4) to wrap setGovernanceConfig.
  const hasGovernor = (permission & 4) !== 0
  const isPaused = config?.paused === true

  const pending = (changes ?? []).filter((c) => {
    const s = computeTimelockStatus(c)
    return s === 'queued' || s === 'executable'
  })
  const past = (changes ?? []).filter((c) => {
    const s = computeTimelockStatus(c)
    return s === 'executed' || s === 'cancelled' || s === 'expired'
  })

  return (
    <div className="space-y-5">
      {/* Advisory explainer (always) */}
      <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3">
        <p className="text-xs text-dao-text-hint">
          This timelock is <strong>advisory</strong>: it delays governance-config changes so members get a
          second window to ragequit before a change lands. It can't <em>force</em> all changes through —
          a proposal can still change config directly. The app routes config changes here and flags any
          that bypass it.
        </p>
      </div>

      {/* GOVERNOR permission warning */}
      {!hasGovernor && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400 font-medium">This navigator does not hold the GOVERNOR permission.</p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            It can't queue or apply config changes until the DAO grants it GOVERNOR (4) via a navigator
            proposal. Use the activation prompt at the top of this page to propose it.
          </p>
        </div>
      )}

      {/* Config summary */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Timelock Navigator</h3>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Delay</p>
            <p className="font-mono text-dao-text-secondary">{config ? formatDuration(Number(config.delay)) : '—'}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Execution window</p>
            <p className="font-mono text-dao-text-secondary">{config ? formatDuration(Number(config.expiryWindow)) : '—'}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Changes</p>
            <p className="font-mono text-dao-text-secondary">{config ? config.changeCount.toString() : '—'}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">New queues</p>
            <p className="font-medium text-dao-text-secondary">{isPaused ? 'Paused' : 'Open'}</p>
          </div>
        </div>
        {connected && hasGovernor && isMember && (
          <div className="mt-4 pt-3 border-t border-dao-border flex flex-wrap gap-2">
            <Link to={`/dao/${daoId}/proposals/new?type=governance`} className="btn-primary text-sm">
              Propose a Config Change
            </Link>
            <Link to={buildTimelockProposalHref(daoId, isPaused ? buildTimelockUnpauseAction(navigatorAddress) : buildTimelockPauseAction(navigatorAddress))} className="btn-secondary text-sm">
              {isPaused ? 'Propose Unpause' : 'Propose Pause'}
            </Link>
            <Link to={buildTimelockProposalHref(daoId, buildEmergencyCancelAllAction(navigatorAddress))} className="btn-secondary text-sm">
              Emergency Cancel All
            </Link>
          </div>
        )}
      </Card>

      {/* Pending changes */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Pending Changes</h3>}>
        {isLoading ? (
          <p className="text-sm text-dao-text-hint">Loading changes…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-dao-text-hint py-2">No pending changes.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((c) => (
              <ChangeCard key={c.id} change={c} daoId={daoId} navigatorAddress={navigatorAddress} connected={connected} isMember={isMember} />
            ))}
          </div>
        )}
      </Card>

      {/* History */}
      {past.length > 0 && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">History</h3>}>
          <div className="space-y-2">
            {past.map((c) => {
              const status = computeTimelockStatus(c)
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-dao-text-secondary">Change #{c.change_id}</span>
                  <span className={`font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[status]}`}>{status}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ChangeCard - one queued change: countdown, execute (permissionless), cancel
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  executable: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  expired: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  executed: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

function ChangeCard({
  change,
  daoId,
  navigatorAddress,
  connected,
  isMember,
}: {
  change: TimelockChangeRow
  daoId: string
  navigatorAddress: string
  connected: boolean
  isMember: boolean
}) {
  const status = computeTimelockStatus(change)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleExecute = useCallback(async () => {
    setError(null)
    setSuccess(false)
    if (!change.governance_config) {
      setError('The queued config bytes are not available from the indexer yet — try again shortly.')
      return
    }
    setBusy(true)
    try {
      const ok = await navigatorService.timelockIsExecutable(navigatorAddress, BigInt(change.change_id))
      if (!ok) { setError('This change is not executable right now.'); return }
      await navigatorService.timelockExecuteChange(navigatorAddress, BigInt(change.change_id), change.governance_config)
      setSuccess(true)
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [navigatorAddress, change.change_id, change.governance_config])

  const cancelHref = buildTimelockProposalHref(daoId, buildCancelChangeAction(navigatorAddress, BigInt(change.change_id)))

  return (
    <div className="rounded-lg border border-dao-border bg-dao-dark-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dao-text">Governance-config change #{change.change_id}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-dao-text-hint">
            <span>queued by</span>
            <AddressDisplay address={change.queued_by} />
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </div>

      {/* Countdown / window */}
      <p className="text-xs text-dao-text-hint mb-2">
        {status === 'queued'
          ? `Executable in ${formatCountdown(change.executable_after)} — members can ragequit until then.`
          : status === 'executable'
            ? `Execution window closes in ${formatCountdown(change.expires_at)}.`
            : 'Execution window has passed — this change can only be cancelled.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {status === 'executable' && (
          <Button variant="primary" size="sm" onClick={handleExecute} loading={busy} disabled={!connected}>
            Execute Change
          </Button>
        )}
        {connected && isMember && (status === 'queued' || status === 'executable' || status === 'expired') && (
          <Link to={cancelHref} className="text-xs text-red-400 hover:text-red-300 transition-colors">
            Propose cancelling
          </Link>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mt-2" role="alert">{error}</p>}
      {success && <p className="text-xs text-emerald-400 mt-2" role="status">Change executed — the new governance config is now active.</p>}
    </div>
  )
}
