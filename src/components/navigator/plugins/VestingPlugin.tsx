import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NavigatorPluginProps } from './index'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useMember } from '@/hooks/useMember'
import { useVestingSchedules, useVestingClaimsByNavigator } from '@/hooks/useVestingSchedules'
import { useRealtimeVestingSchedules } from '@/hooks/useRealtimeVestingSchedules'
import { navigatorService } from '@/services/core/NavigatorService'
import { baseService } from '@/services/core/BaseService'
import type { VestingNavigatorConfig } from '@/services/core/NavigatorService'
import type { VestingScheduleRow, VestingClaimRow } from '@/types'
import { computeVestingStatus, vestedAmount, claimable } from '@/types'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'
import { addressesEqual } from '@/services/utils/AddressUtils'
import { mapContractError } from './pluginErrors'
import { Field, ContinueToProposal } from './pluginShared'
import {
  buildCreateScheduleAction,
  buildRevokeScheduleAction,
  buildVestingPauseAction,
  buildVestingUnpauseAction,
  buildVestingProposalHref,
  type CreateScheduleParams,
} from '@/utils/vestingProposals'

const DAY = 86400

// ═══════════════════════════════════════════════════════════════════════════
// VestingPlugin - Cliff + linear vesting of shares/loot (MANAGER navigator)
// ───────────────────────────────────────────────────────────────────────────
// Schedules are created/revoked by governance (avatar-only → proposal deep-links);
// the beneficiary (or governance) claims DIRECTLY, minting vested-but-unclaimed tokens
// to the beneficiary. No escrow: unvested tokens carry no power until claimed.
// ═══════════════════════════════════════════════════════════════════════════

const ERROR_MAP: Record<string, string> = {
  NothingToClaim: 'Nothing has vested yet (or it has all been claimed).',
  ScheduleDoesNotExist: 'No such vesting schedule.',
  AlreadyRevoked: 'This schedule was revoked.',
  NotAuthorized: 'Only the beneficiary or the DAO can claim.',
  CliffExceedsVesting: 'The cliff cannot be longer than the vesting duration.',
  InvalidConfig: 'Invalid schedule — the vesting duration must be greater than zero.',
  InvalidBeneficiary: 'Enter a valid beneficiary address.',
  ZeroAmount: 'The vesting amount must be greater than zero.',
  IsPaused: 'New schedules are paused on this navigator.',
}

function mapError(err: unknown): string {
  return mapContractError(err, ERROR_MAP)
}

export function VestingPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
  useRealtimeVestingSchedules(daoId)
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

  const config = configResult?.type === 'VestingNavigator' ? configResult.config : null

  return (
    <VestingInteraction
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

function VestingInteraction({
  navigatorAddress,
  config,
  permission,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: VestingNavigatorConfig | null
  permission: number
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const { data: schedules, isLoading } = useVestingSchedules(daoId, navigatorAddress)
  // One query for ALL claim feeds (grouped by schedule_id) instead of one per card.
  const { data: claimsBySchedule } = useVestingClaimsByNavigator(navigatorAddress)
  const [showCreate, setShowCreate] = useState(false)

  // Create/pause/revoke run as governance proposals → require DAO membership. The
  // beneficiary's direct claim is unaffected (gated separately on isBeneficiary).
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

  // A vesting navigator must hold MANAGER (bit 2) for claims to mint.
  const hasManager = (permission & 2) !== 0
  const isPaused = config?.paused === true

  // Sort: the connected user's own schedules first, then the rest.
  const mine = userAddress
    ? (schedules ?? []).filter((s) => addressesEqual(s.beneficiary, userAddress))
    : []
  const others = userAddress
    ? (schedules ?? []).filter((s) => !addressesEqual(s.beneficiary, userAddress))
    : (schedules ?? [])

  return (
    <div className="space-y-5">
      {/* No-escrow explainer (always) */}
      <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3">
        <p className="text-xs text-dao-text-hint">
          Vesting <strong>mints as it vests</strong> — there is no escrow. Unvested tokens don't exist yet:
          they carry no voting power and can't be transferred or ragequit until you <strong>claim</strong>.
          A cliff releases everything accrued since the start in a lump the moment it passes, then continues
          linearly.
        </p>
      </div>

      {/* MANAGER permission warning — claims fail without it */}
      {!hasManager && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400 font-medium">
            This navigator does not hold the MANAGER permission.
          </p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            Claims cannot mint until the DAO grants it MANAGER (2) via a navigator proposal. Existing
            schedules are stranded until then. Use the activation prompt at the top of this page to propose it.
          </p>
        </div>
      )}

      {/* Config + create CTA */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Vesting Navigator</h3>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Schedules</p>
            <p className="font-mono text-dao-text-secondary">{config ? config.scheduleCount.toString() : '—'}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">New schedules</p>
            <p className="font-medium text-dao-text-secondary">{isPaused ? 'Paused' : 'Open'}</p>
          </div>
        </div>
        {connected && isMember && (
          <div className="mt-4 pt-3 border-t border-dao-border space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? 'Close' : '+ Create Schedule'}
              </Button>
              {/* Governance pause/unpause — blocks NEW schedules only (claims keep working). */}
              <Link
                to={buildVestingProposalHref(daoId, isPaused ? buildVestingUnpauseAction(navigatorAddress) : buildVestingPauseAction(navigatorAddress))}
                className="btn-secondary text-sm"
              >
                {isPaused ? 'Propose Unpause' : 'Propose Pause (block new schedules)'}
              </Link>
            </div>
            {showCreate && (
              <div>
                <CreateScheduleForm daoId={daoId} navigatorAddress={navigatorAddress} />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Schedules */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Schedules</h3>}>
        {isLoading ? (
          <p className="text-sm text-dao-text-hint">Loading schedules…</p>
        ) : !schedules || schedules.length === 0 ? (
          <p className="text-sm text-dao-text-hint py-2">No vesting schedules yet.</p>
        ) : (
          <div className="space-y-4">
            {mine.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-dao-text-secondary uppercase tracking-wide">Yours</h4>
                {mine.map((s) => (
                  <ScheduleCard key={s.id} schedule={s} daoId={daoId} navigatorAddress={navigatorAddress}
                    userAddress={userAddress} connected={connected} isMember={isMember}
                    claims={claimsBySchedule?.get(s.schedule_id)} />
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="space-y-3">
                {mine.length > 0 && (
                  <h4 className="text-xs font-semibold text-dao-text-secondary uppercase tracking-wide">All schedules</h4>
                )}
                {others.map((s) => (
                  <ScheduleCard key={s.id} schedule={s} daoId={daoId} navigatorAddress={navigatorAddress}
                    userAddress={userAddress} connected={connected} isMember={isMember}
                    claims={claimsBySchedule?.get(s.schedule_id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ScheduleCard - one schedule: vested/claimable progress, claim, revoke
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  vesting: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  fully_vested: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
  revoked: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'pending (cliff)',
  vesting: 'vesting',
  fully_vested: 'fully vested',
  revoked: 'revoked',
}

function ScheduleCard({
  schedule,
  daoId,
  navigatorAddress,
  userAddress,
  connected,
  isMember,
  claims,
}: {
  schedule: VestingScheduleRow
  daoId: string
  navigatorAddress: string
  userAddress: string | null
  connected: boolean
  isMember: boolean
  claims?: VestingClaimRow[]
}) {
  const status = computeVestingStatus(schedule)
  const isBeneficiary = userAddress ? addressesEqual(userAddress, schedule.beneficiary) : false
  const kind = schedule.is_loot ? 'loot' : 'shares'

  // Indexer-derived figures (client-side, time-derived).
  const total = BigInt(schedule.total_amount)
  const vested = vestedAmount(schedule)
  const indexerClaimable = claimable(schedule)
  const claimedSoFar = BigInt(schedule.claimed)
  const vestedPct = total === 0n ? 0 : Number((vested * 10000n) / total) / 100

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const queryClient = useQueryClient()

  // On-chain claimable for the beneficiary's own row (authoritative preflight, lag-free).
  const { data: liveClaimable, refetch } = useQuery({
    queryKey: ['vestingClaimable', navigatorAddress.toLowerCase(), schedule.schedule_id],
    queryFn: () => navigatorService.getVestingClaimable(navigatorAddress, BigInt(schedule.schedule_id)),
    enabled: baseService.hasProvider() && isBeneficiary && status !== 'pending',
    staleTime: 15_000,
  })

  const effectiveClaimable = liveClaimable ?? indexerClaimable

  const handleClaim = useCallback(async () => {
    setError(null)
    setSuccess(false)
    setBusy(true)
    try {
      // Preflight: re-read on-chain claimable so we don't submit a NothingToClaim revert.
      const live = await navigatorService.getVestingClaimable(navigatorAddress, BigInt(schedule.schedule_id))
      if (live <= 0n) { setError('Nothing has vested yet (or it has all been claimed).'); return }
      await navigatorService.vestingClaim(navigatorAddress, BigInt(schedule.schedule_id))
      setSuccess(true)
      refetch()
      // Surface the new mint in the claim history (the feed isn't realtime).
      queryClient.invalidateQueries({
        queryKey: ['vestingClaimsByNavigator', navigatorAddress.toLowerCase()],
      })
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [navigatorAddress, schedule.schedule_id, refetch, queryClient])

  const revokeHref = buildVestingProposalHref(daoId, buildRevokeScheduleAction(navigatorAddress, BigInt(schedule.schedule_id)))

  return (
    <div className="rounded-lg border border-dao-border bg-dao-dark-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dao-text">
            Schedule #{schedule.schedule_id} · <span className="font-mono text-dao-text-secondary">{formatTokenAmount(total)} {kind}</span>
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-dao-text-hint">
            <span>to</span>
            <AddressDisplay address={schedule.beneficiary} />
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Vested progress */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs mb-0.5">
          <span className="text-dao-text-hint">Vested</span>
          <span className="font-mono text-dao-text-secondary">
            {formatTokenAmount(vested)} / {formatTokenAmount(total)} ({vestedPct.toFixed(1)}%)
          </span>
        </div>
        <div
          className="h-2 rounded-full bg-dao-dark-3 overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(vestedPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Vested ${vestedPct.toFixed(1)}%`}
        >
          <div className="h-full bg-accent-500/60" style={{ width: `${Math.min(100, vestedPct)}%` }} />
        </div>
      </div>

      {/* Figures */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3">
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Claimed</p>
          <p className="font-mono text-dao-text-secondary">{formatTokenAmount(claimedSoFar)}</p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Claimable</p>
          <p className="font-mono text-dao-text-secondary">{formatTokenAmount(effectiveClaimable)}</p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Cliff</p>
          <p className="font-mono text-dao-text-secondary">
            {schedule.cliff_end <= schedule.start_time ? 'none' : new Date(schedule.cliff_end * 1000).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Fully vested</p>
          <p className="font-mono text-dao-text-secondary">{new Date(schedule.vesting_end * 1000).toLocaleDateString()}</p>
        </div>
      </div>

      {schedule.revoked && (
        <p className="text-xs text-dao-text-hint mt-2">
          Accrual was frozen on revoke{schedule.revoked_at ? ` (${new Date(schedule.revoked_at * 1000).toLocaleDateString()})` : ''}.
          Already-vested tokens stay claimable; revoke does not claw back minted tokens.
        </p>
      )}

      {/* Beneficiary claim */}
      {isBeneficiary && (
        <div className="mt-3 pt-3 border-t border-dao-border">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-dao-text-hint">
              {effectiveClaimable > 0n
                ? `${formatTokenAmount(effectiveClaimable)} ${kind} ready to claim`
                : 'Nothing to claim right now'}
            </p>
            <Button variant="primary" size="sm" onClick={handleClaim} loading={busy} disabled={!connected || effectiveClaimable <= 0n}>
              Claim
            </Button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2" role="alert">{error}</p>}
          {success && (
            <p className="text-xs text-emerald-400 mt-2" role="status">
              Claimed. These {kind} are now normal tokens — transferable and ragequit-able.
            </p>
          )}
        </div>
      )}

      {/* Claim history (incremental mints) */}
      <ClaimFeed claims={claims} kind={kind} />

      {/* Governance: revoke (members only — creates a proposal) */}
      {connected && isMember && !schedule.revoked && status !== 'fully_vested' && (
        <div className="mt-3 pt-3 border-t border-dao-border flex justify-end">
          <Link to={revokeHref} className="text-xs text-red-400 hover:text-red-300 transition-colors">
            Propose revoking (freeze accrual)
          </Link>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ClaimFeed - the incremental mint history for one schedule (ds_vesting_claims)
// ═══════════════════════════════════════════════════════════════════════════

function ClaimFeed({
  claims,
  kind,
}: {
  claims?: VestingClaimRow[]
  kind: string
}) {
  if (!claims || claims.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-dao-border">
      <p className="text-xs font-medium text-dao-text-secondary mb-1.5">Claim history</p>
      <div className="space-y-1">
        {claims.slice(0, 5).map((c) => {
          const d = new Date(c.created_at)
          const when =
            isNaN(d.getTime()) || d.getFullYear() > 2100 ? `Block #${c.block_number}` : d.toLocaleDateString()
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-dao-text-hint">{when}</span>
              <span className="font-mono text-dao-text-secondary">
                +{formatTokenAmount(c.amount)} {kind}
              </span>
            </div>
          )
        })}
        {claims.length > 5 && (
          <p className="text-xs text-dao-text-hint">+{claims.length - 5} more claim{claims.length - 5 === 1 ? '' : 's'}</p>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CreateScheduleForm - builds a createSchedule governance proposal
// ═══════════════════════════════════════════════════════════════════════════

function CreateScheduleForm({ daoId, navigatorAddress }: { daoId: string; navigatorAddress: string }) {
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'shares' | 'loot'>('shares')
  const [cliffDays, setCliffDays] = useState('0')
  const [vestingDays, setVestingDays] = useState('365')
  const [backdate, setBackdate] = useState('') // optional ISO datetime for startTime
  const [error, setError] = useState<string | null>(null)

  const build = useCallback((): string | null => {
    setError(null)
    if (!beneficiary.trim() || !beneficiary.startsWith('0x') || beneficiary.length !== 42) {
      setError('Enter a valid beneficiary address.')
      return null
    }
    let totalAmount: bigint
    try { totalAmount = parseTokenAmount(amount) } catch { setError('Enter a valid amount.'); return null }
    if (totalAmount <= 0n) { setError('Amount must be greater than zero.'); return null }

    const vestingSec = Math.floor(parseFloat(vestingDays || '0') * DAY)
    const cliffSec = Math.floor(parseFloat(cliffDays || '0') * DAY)
    if (vestingSec <= 0) { setError('Vesting duration must be greater than zero.'); return null }
    if (cliffSec > vestingSec) { setError('Cliff cannot exceed the vesting duration.'); return null }

    let startTime = 0n
    if (backdate) {
      const sec = Math.floor(new Date(backdate).getTime() / 1000)
      if (!Number.isFinite(sec)) { setError('Invalid start time.'); return null }
      startTime = BigInt(sec)
    }

    const params: CreateScheduleParams = {
      beneficiary: beneficiary.trim(),
      totalAmount,
      startTime,
      cliffDuration: BigInt(cliffSec),
      vestingDuration: BigInt(vestingSec),
      isLoot: kind === 'loot',
    }
    return buildVestingProposalHref(daoId, buildCreateScheduleAction(navigatorAddress, params))
  }, [beneficiary, amount, kind, cliffDays, vestingDays, backdate, daoId, navigatorAddress])

  const startIsPast = backdate ? new Date(backdate).getTime() < Date.now() : false

  return (
    <div className="space-y-3">
      <p className="text-xs text-dao-text-hint">
        Schedules are created by a governance proposal. Token amounts use 18 decimals.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Beneficiary address">
          <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="0x… (immutable)" className="input w-full font-mono text-sm" />
        </Field>
        <Field label="Token">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'shares' | 'loot')} className="input w-full text-sm">
            <option value="shares">Shares (voting power on claim)</option>
            <option value="loot">Loot (economic only)</option>
          </select>
        </Field>
        <Field label="Total amount">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 10000" className="input w-full font-mono text-sm" inputMode="decimal" />
        </Field>
        <Field label="Cliff (days, 0 = none)">
          <input value={cliffDays} onChange={(e) => setCliffDays(e.target.value)} placeholder="0" className="input w-full font-mono text-sm" inputMode="decimal" />
        </Field>
        <Field label="Vesting duration (days)">
          <input value={vestingDays} onChange={(e) => setVestingDays(e.target.value)} placeholder="365" className="input w-full font-mono text-sm" inputMode="decimal" />
        </Field>
        <Field label="Start (optional — blank = now)">
          <input type="datetime-local" value={backdate} onChange={(e) => setBackdate(e.target.value)} className="input w-full text-sm" />
        </Field>
      </div>
      {startIsPast && (
        <p className="text-xs text-amber-400">
          ⚠ Back-dated start — this bypasses the cliff and can make the schedule immediately (partly) claimable.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <ContinueToProposal build={build} />
    </div>
  )
}

