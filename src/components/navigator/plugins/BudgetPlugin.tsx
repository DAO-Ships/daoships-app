import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { NavigatorPluginProps } from './index'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useDao } from '@/hooks/useDao'
import { useMember } from '@/hooks/useMember'
import { useBudgets, useBudgetDisbursementsByNavigator, useVaultModuleEvents } from '@/hooks/useBudgets'
import { useRealtimeBudgets } from '@/hooks/useRealtimeBudgets'
import { useTokenMetadata } from '@/hooks/useTokenMetadata'
import { navigatorService } from '@/services/core/NavigatorService'
import { baseService } from '@/services/core/BaseService'
import type { BudgetNavigatorConfig } from '@/services/core/NavigatorService'
import type { BudgetRow, BudgetDisbursementRow, VaultModuleEventRow } from '@/types'
import { computeBudgetStatus, ceilingRemaining } from '@/types'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { formatDurationInput as formatDuration } from '@/utils/time'
import { mapContractError } from './pluginErrors'
import { Field, ContinueToProposal } from './pluginShared'
import { safeBigInt } from '@/utils/bigint'
import { addressesEqual } from '@/services/utils/AddressUtils'
import {
  buildDisableModuleAction,
  buildCreateBudgetAction,
  buildCancelBudgetAction,
  buildUpdateManagerAction,
  buildPauseAction,
  buildUnpauseAction,
  buildBudgetProposalHref,
  resolvePrevModule,
  type CreateBudgetParams,
} from '@/utils/budgetProposals'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DAY = 86400

// ═══════════════════════════════════════════════════════════════════════════
// BudgetPlugin - Recurring treasury budgets (MODULE trust class)
// ───────────────────────────────────────────────────────────────────────────
// Authority is being an enabled Zodiac module on the DAO's vault (NOT a DAOShip
// permission). Surface budgets only once trust_status='sanctioned' && is_active;
// admin/governance actions go through proposals (deep-linked into the custom-action
// form); the manager disburses DIRECTLY (the whole point — no proposal per payment).
// ═══════════════════════════════════════════════════════════════════════════

/** Contract custom errors → user-friendly copy. */
const ERROR_MAP: Record<string, string> = {
  AllowanceExceeded: 'That exceeds the remaining allowance for this period.',
  CeilingExceeded: "That exceeds the budget's lifetime ceiling.",
  NotStarted: "This budget hasn't started yet.",
  BudgetEnded: 'This budget has ended.',
  BudgetCancelled_: 'This budget was cancelled.',
  IsPaused: 'Disbursement is paused (treasury freeze).',
  NotEnabledModule: 'The navigator is no longer an enabled vault module — treasury access was revoked.',
  NotAuthorized: 'Only the budget manager can disburse.',
  ZeroAmount: 'Enter an amount greater than zero.',
  InvalidRecipient: 'Enter a valid recipient address.',
  TransferFailed: 'The treasury transfer failed (insufficient vault balance?).',
  LengthMismatch: 'Recipients and amounts must line up.',
  EmptyBatch: 'Add at least one recipient.',
}

function mapError(err: unknown): string {
  return mapContractError(err, ERROR_MAP)
}

export function BudgetPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
  useRealtimeBudgets(daoId)
  // Load config regardless of is_active — a module-class budget navigator is
  // is_active=false until the vault enables it, but its on-chain views read fine.
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator.navigator_address,
  )

  if (configLoading) {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Loading navigator configuration...</p>
      </Card>
    )
  }

  if (!configResult || configResult.type !== 'BudgetNavigator') {
    return (
      <BudgetInteraction
        navigatorAddress={navigator.navigator_address}
        config={null}
        trustStatus={navigator.trust_status}
        isActive={navigator.is_active}
        indexerPaused={navigator.paused}
        daoId={daoId}
        userAddress={userAddress}
        connected={connected}
      />
    )
  }

  return (
    <BudgetInteraction
      navigatorAddress={navigator.navigator_address}
      config={configResult.config}
      trustStatus={navigator.trust_status}
      isActive={navigator.is_active}
      indexerPaused={navigator.paused}
      daoId={daoId}
      userAddress={userAddress}
      connected={connected}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function BudgetInteraction({
  navigatorAddress,
  config,
  trustStatus,
  isActive,
  indexerPaused,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: BudgetNavigatorConfig | null
  trustStatus: string
  isActive: boolean
  indexerPaused: boolean
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const { data: dao } = useDao(daoId)
  const vaultAddress = dao?.avatar ?? null

  const { data: budgets, isLoading: budgetsLoading } = useBudgets(daoId, navigatorAddress)
  // One query for ALL budget disbursement feeds (grouped by budget_id) instead of one per card.
  const { data: disbursementsByBudget } = useBudgetDisbursementsByNavigator(navigatorAddress)
  const { data: moduleEvents } = useVaultModuleEvents(daoId, navigatorAddress)

  // Governance actions here only build proposals, which require DAO membership to sponsor/pass.
  // Gate the proposal CTAs behind membership; the manager's direct disburse is unaffected.
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

  // The module is live only when the DAO has sanctioned it AND it's currently enabled.
  const isEnabled = trustStatus === 'sanctioned' && isActive
  const isPaused = indexerPaused || config?.paused === true

  return (
    <div className="space-y-5">
      {/* Treasury-access warning copy (always) */}
      <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3">
        <p className="text-xs text-dao-text-hint">
          This navigator can move <strong>treasury funds</strong> when enabled as a vault module.
          Spending is capped per budget by an allowance and a lifetime ceiling; a compromised manager
          is bounded to a single period's allowance. Disable the module to fully revoke access.
        </p>
      </div>

      {/* Not-enabled state — module is powerless until the vault enables it */}
      {!isEnabled && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400 font-medium">
            {trustStatus === 'unsanctioned'
              ? 'Treasury access was revoked — the module is disabled.'
              : 'This budget navigator is not yet enabled on the DAO treasury.'}
          </p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            It cannot move any funds until the DAO enables it as a vault module via governance.
            Budgets won't appear here until then (they are backfilled once enabled). Use the activation
            prompt at the top of this page to propose enabling it.
          </p>
        </div>
      )}

      {/* Paused (treasury freeze) */}
      {isEnabled && isPaused && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400 font-medium">Disbursement is paused — treasury freeze in effect.</p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            No budget can disburse while paused. Resume via a governance proposal.
          </p>
        </div>
      )}

      {/* Config summary */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Budget Navigator</h3>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Status</p>
            <p className="font-medium text-dao-text-secondary">
              {isEnabled ? (isPaused ? 'Enabled · Paused' : 'Enabled') : 'Not enabled'}
            </p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Budgets</p>
            <p className="font-mono text-dao-text-secondary">{config ? config.budgetCount.toString() : '—'}</p>
          </div>
          {vaultAddress && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Treasury (vault)</p>
              <AddressDisplay address={vaultAddress} />
            </div>
          )}
        </div>
      </Card>

      {/* Module access timeline — the audit trail behind trust_status */}
      <ModuleTimeline events={moduleEvents ?? []} />

      {/* Governance actions (members only — these create proposals) */}
      {isEnabled && connected && isMember && (
        <GovernanceActions
          daoId={daoId}
          navigatorAddress={navigatorAddress}
          vaultAddress={vaultAddress}
          config={config}
          isPaused={isPaused}
        />
      )}

      {/* Budgets */}
      {isEnabled && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Budgets</h3>}>
          {budgetsLoading ? (
            <p className="text-sm text-dao-text-hint">Loading budgets…</p>
          ) : !budgets || budgets.length === 0 ? (
            <p className="text-sm text-dao-text-hint py-2">
              No budgets yet. Create one via a governance proposal.
            </p>
          ) : (
            <div className="space-y-4">
              {budgets.map((b) => (
                <BudgetCard
                  key={b.id}
                  budget={b}
                  daoId={daoId}
                  navigatorAddress={navigatorAddress}
                  userAddress={userAddress}
                  connected={connected}
                  isMember={isMember}
                  isPaused={isPaused}
                  disbursements={disbursementsByBudget?.get(b.budget_id)}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ModuleTimeline - vault EnabledModule/DisabledModule history (trust audit trail)
// ═══════════════════════════════════════════════════════════════════════════

function ModuleTimeline({ events }: { events: VaultModuleEventRow[] }) {
  if (events.length === 0) return null
  return (
    <Card header={<h3 className="text-sm font-semibold text-dao-text">Treasury Access History</h3>}>
      <div className="divide-y divide-dao-border">
        {events.map((e) => (
          <div key={e.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  e.enabled
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
              >
                {e.enabled ? 'Access granted' : 'Access revoked'}
              </span>
              <span className="text-xs text-dao-text-hint">Block #{e.block_number ?? '—'}</span>
            </div>
            <span className="text-xs text-dao-text-hint" title={e.created_at}>
              {(() => {
                const d = new Date(e.created_at)
                return d.getFullYear() > 2100 || isNaN(d.getTime()) ? '' : d.toLocaleString()
              })()}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-dao-text-hint mt-3 pt-3 border-t border-dao-border">
        The most recent entry is the current state — this is the source of truth for whether the
        module can move treasury funds.
      </p>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GovernanceActions - create budget + emergency controls (proposal deep-links)
// ═══════════════════════════════════════════════════════════════════════════

function GovernanceActions({
  daoId,
  navigatorAddress,
  vaultAddress,
  config,
  isPaused,
}: {
  daoId: string
  navigatorAddress: string
  vaultAddress: string | null
  config: BudgetNavigatorConfig | null
  isPaused: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [disableError, setDisableError] = useState<string | null>(null)

  // Disable module (nuclear) — needs prevModule resolved from the vault first.
  const handleDisable = useCallback(async () => {
    if (!vaultAddress) return
    setDisableError(null)
    setDisabling(true)
    try {
      if (!baseService.hasProvider()) throw new Error('Connect your wallet first.')
      const prev = await resolvePrevModule(vaultAddress, navigatorAddress, baseService.getProvider())
      if (!prev) throw new Error('This navigator is not currently an enabled module.')
      const action = buildDisableModuleAction(vaultAddress, navigatorAddress, prev)
      window.location.href = buildBudgetProposalHref(daoId, action)
    } catch (e) {
      setDisableError(mapError(e))
    } finally {
      setDisabling(false)
    }
  }, [vaultAddress, navigatorAddress, daoId])

  const pauseHref = isPaused
    ? buildBudgetProposalHref(daoId, buildUnpauseAction(navigatorAddress))
    : buildBudgetProposalHref(daoId, buildPauseAction(navigatorAddress))

  return (
    <Card header={<h3 className="text-sm font-semibold text-dao-text">Manage</h3>}>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close' : '+ Create Budget'}
        </Button>
        <Link to={pauseHref} className="btn-secondary text-sm">
          {isPaused ? 'Propose Resume' : 'Propose Pause (freeze)'}
        </Link>
        <Button variant="secondary" size="sm" onClick={handleDisable} loading={disabling}>
          Disable Module (revoke)
        </Button>
      </div>
      {disableError && <p className="text-xs text-red-400 mt-2">{disableError}</p>}

      {showCreate && (
        <div className="mt-4 pt-4 border-t border-dao-border">
          <CreateBudgetForm daoId={daoId} navigatorAddress={navigatorAddress} config={config} />
        </div>
      )}
    </Card>
  )
}

function CreateBudgetForm({
  daoId,
  navigatorAddress,
  config,
}: {
  daoId: string
  navigatorAddress: string
  config: BudgetNavigatorConfig | null
}) {
  const [manager, setManager] = useState('')
  const [token, setToken] = useState('') // empty = native QUAI
  const [allowance, setAllowance] = useState('')
  const [ceiling, setCeiling] = useState('')
  const [periodDays, setPeriodDays] = useState('30')
  const [error, setError] = useState<string | null>(null)

  const minPeriodDays = config ? Number(config.minPeriod) / DAY : 1 / 24 // MIN_PERIOD fallback ~1h
  const maxPeriodDays = config ? Number(config.maxPeriod) / DAY : 3650

  const handleBuild = useCallback((): string | null => {
    setError(null)
    if (!manager.trim() || !manager.startsWith('0x') || manager.length !== 42) {
      setError('Enter a valid manager address.')
      return null
    }
    const tokenAddr = token.trim() === '' ? ZERO_ADDRESS : token.trim()
    if (tokenAddr !== ZERO_ADDRESS && (!tokenAddr.startsWith('0x') || tokenAddr.length !== 42)) {
      setError('Enter a valid token address, or leave blank for native QUAI.')
      return null
    }
    let allowanceWei: bigint
    let ceilingWei: bigint
    try {
      allowanceWei = parseTokenAmount(allowance)
      ceilingWei = parseTokenAmount(ceiling)
    } catch {
      setError('Enter valid amounts.')
      return null
    }
    if (allowanceWei <= 0n) { setError('Allowance per period must be greater than zero.'); return null }
    if (ceilingWei <= 0n) { setError('Lifetime ceiling must be greater than zero.'); return null }
    const periodSec = Math.floor(parseFloat(periodDays || '0') * DAY)
    if (config && (BigInt(periodSec) < config.minPeriod || BigInt(periodSec) > config.maxPeriod)) {
      setError(`Period must be between ${minPeriodDays} and ${maxPeriodDays} days.`)
      return null
    }
    const params: CreateBudgetParams = {
      manager: manager.trim(),
      token: tokenAddr,
      allowancePerPeriod: allowanceWei,
      totalCeiling: ceilingWei,
      periodLength: BigInt(periodSec),
      startTime: 0n, // now
      endTime: 0n, // perpetual
    }
    return buildBudgetProposalHref(daoId, buildCreateBudgetAction(navigatorAddress, params))
  }, [manager, token, allowance, ceiling, periodDays, config, daoId, navigatorAddress, minPeriodDays, maxPeriodDays])

  return (
    <div className="space-y-3">
      <p className="text-xs text-dao-text-hint">
        Budgets are created by a governance proposal. Fill this in, then continue to the proposal
        builder (token amounts use 18 decimals; native QUAI when the token is left blank).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Manager address">
          <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="0x… (who can disburse)" className="input w-full font-mono text-sm" />
        </Field>
        <Field label="Token (blank = native QUAI)">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x… ERC-20, or blank" className="input w-full font-mono text-sm" />
        </Field>
        <Field label="Allowance per period">
          <input value={allowance} onChange={(e) => setAllowance(e.target.value)} placeholder="e.g. 1000" className="input w-full font-mono text-sm" inputMode="decimal" />
        </Field>
        <Field label="Lifetime ceiling">
          <input value={ceiling} onChange={(e) => setCeiling(e.target.value)} placeholder="e.g. 12000" className="input w-full font-mono text-sm" inputMode="decimal" />
        </Field>
        <Field label={`Period length (days, ${minPeriodDays}–${maxPeriodDays})`}>
          <input value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} placeholder="30" className="input w-full font-mono text-sm" inputMode="decimal" />
        </Field>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <ContinueToProposal build={handleBuild} />
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// BudgetCard - one budget: live remaining, manager disburse, feed, gov actions
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  ended: 'bg-dao-surface/60 text-dao-text-hint',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

function BudgetCard({
  budget,
  daoId,
  navigatorAddress,
  userAddress,
  connected,
  isMember,
  isPaused,
  disbursements,
}: {
  budget: BudgetRow
  daoId: string
  navigatorAddress: string
  userAddress: string | null
  connected: boolean
  isMember: boolean
  isPaused: boolean
  disbursements?: BudgetDisbursementRow[]
}) {
  const status = computeBudgetStatus(budget)
  const isNative = addressesEqual(budget.token, ZERO_ADDRESS)
  // Resolve the ERC-20 symbol; fall back to a shortened address while loading or if
  // the token doesn't expose symbol() (or no provider is connected).
  const { data: tokenMeta } = useTokenMetadata(isNative ? undefined : budget.token)
  const tokenLabel = isNative
    ? 'QUAI'
    : tokenMeta?.symbol ?? `${budget.token.slice(0, 6)}…${budget.token.slice(-4)}`
  const isManager = userAddress ? addressesEqual(userAddress, budget.manager) : false

  // Live remaining (resets/accrues lazily on-chain) — refetch periodically.
  const { data: remaining, refetch: refetchRemaining } = useQuery({
    queryKey: ['budgetRemaining', navigatorAddress.toLowerCase(), budget.budget_id],
    queryFn: () => navigatorService.getBudgetRemaining(navigatorAddress, BigInt(budget.budget_id)),
    enabled: baseService.hasProvider() && status === 'active',
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const ceilingLeft = ceilingRemaining(budget)
  const cancelHref = buildBudgetProposalHref(daoId, buildCancelBudgetAction(navigatorAddress, BigInt(budget.budget_id)))

  const [newManager, setNewManager] = useState('')
  const [showManager, setShowManager] = useState(false)
  const managerValid = newManager.startsWith('0x') && newManager.length === 42

  return (
    <div className="rounded-lg border border-dao-border bg-dao-dark-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dao-text">
            Budget #{budget.budget_id} · <span className="font-mono text-dao-text-secondary">{tokenLabel}</span>
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-dao-text-hint">
            <span>manager</span>
            <AddressDisplay address={budget.manager} />
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </div>

      {/* Figures */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mt-2">
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Allowance / period</p>
          <p className="font-mono text-dao-text-secondary">{formatTokenAmount(budget.allowance_per_period)}</p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Remaining this period</p>
          <p className="font-mono text-dao-text-secondary">
            {remaining ? formatTokenAmount(remaining.thisPeriod) : status === 'active' ? '…' : '—'}
          </p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Resets every</p>
          <p className="font-mono text-dao-text-secondary">{formatDuration(budget.period_length)}</p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Spent (lifetime)</p>
          <p className="font-mono text-dao-text-secondary">{formatTokenAmount(budget.total_spent)}</p>
        </div>
        <div>
          <p className="text-dao-text-hint text-xs mb-0.5">Ceiling remaining</p>
          <p className="font-mono text-dao-text-secondary">
            {formatTokenAmount(ceilingLeft)} / {formatTokenAmount(budget.total_ceiling)}
          </p>
        </div>
        {budget.ends_at !== 0 && (
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Ends</p>
            <p className="font-mono text-dao-text-secondary">
              {new Date(budget.ends_at * 1000).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {/* Manager disburse */}
      {isManager && status === 'active' && !isPaused && (
        <DisburseForm
          navigatorAddress={navigatorAddress}
          budgetId={budget.budget_id}
          tokenLabel={tokenLabel}
          remainingThisPeriod={remaining?.thisPeriod ?? null}
          onDisbursed={refetchRemaining}
        />
      )}
      {isManager && (status !== 'active' || isPaused) && (
        <p className="text-xs text-dao-text-hint mt-3 pt-3 border-t border-dao-border">
          You manage this budget, but it can't disburse right now
          {isPaused ? ' (paused)' : status === 'pending' ? " (hasn't started)" : ` (${status})`}.
        </p>
      )}

      {/* Disbursement feed */}
      <DisbursementFeed disbursements={disbursements} tokenLabel={tokenLabel} />

      {/* Governance actions for this budget (members only — these create proposals) */}
      {connected && isMember && status !== 'cancelled' && (
        <div className="mt-3 pt-3 border-t border-dao-border space-y-2">
          {showManager && (
            <div className="flex items-center gap-2">
              <input
                value={newManager}
                onChange={(e) => setNewManager(e.target.value)}
                placeholder="New manager 0x…"
                className="input flex-1 font-mono text-sm"
              />
              <Link
                to={managerValid ? buildBudgetProposalHref(daoId, buildUpdateManagerAction(navigatorAddress, BigInt(budget.budget_id), newManager.trim())) : '#'}
                className={`btn-secondary text-sm whitespace-nowrap ${managerValid ? '' : 'pointer-events-none opacity-50'}`}
              >
                Propose →
              </Link>
            </div>
          )}
          <div className="flex items-center justify-end gap-4">
            <button type="button" onClick={() => setShowManager((v) => !v)} className="text-xs text-dao-text-hint hover:text-dao-text transition-colors">
              {showManager ? 'Cancel' : 'Change manager'}
            </button>
            <Link to={cancelHref} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              Propose cancelling this budget
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function DisburseForm({
  navigatorAddress,
  budgetId,
  tokenLabel,
  remainingThisPeriod,
  onDisbursed,
}: {
  navigatorAddress: string
  budgetId: string
  tokenLabel: string
  remainingThisPeriod: bigint | null
  onDisbursed: () => void
}) {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [batchText, setBatchText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const amountWei = (() => { try { return amount ? parseTokenAmount(amount) : 0n } catch { return 0n } })()
  const overAllowance = remainingThisPeriod !== null && amountWei > remainingThisPeriod
  const singleValid = to.startsWith('0x') && to.length === 42 && amountWei > 0n && !overAllowance

  // Parse "address, amount" lines (one payee per line) → aligned arrays. Validates each
  // address + amount and the total against the remaining period allowance.
  const batch = useMemo(() => {
    const lines = batchText.split('\n').map((l) => l.trim()).filter(Boolean)
    const recipients: string[] = []
    const amounts: bigint[] = []
    let total = 0n
    let err: string | null = null
    for (const line of lines) {
      const [addr, amt] = line.split(/[,\s]+/)
      if (!addr || !addr.startsWith('0x') || addr.length !== 42) { err = `Invalid address: "${line}"`; break }
      let wei: bigint
      try { wei = parseTokenAmount(amt ?? '') } catch { err = `Invalid amount: "${line}"`; break }
      if (wei <= 0n) { err = `Amount must be > 0: "${line}"`; break }
      recipients.push(addr)
      amounts.push(wei)
      total += wei
    }
    const over = remainingThisPeriod !== null && total > remainingThisPeriod
    return { recipients, amounts, total, err, over, count: recipients.length }
  }, [batchText, remainingThisPeriod])

  const batchValid = batch.count > 0 && !batch.err && !batch.over

  const handleDisburse = useCallback(async () => {
    setError(null)
    setSuccess(false)
    setBusy(true)
    try {
      if (mode === 'single') {
        await navigatorService.budgetDisburse(navigatorAddress, BigInt(budgetId), to.trim(), amountWei)
        setTo('')
        setAmount('')
      } else {
        await navigatorService.budgetDisburseBatch(navigatorAddress, BigInt(budgetId), batch.recipients, batch.amounts)
        setBatchText('')
      }
      setSuccess(true)
      onDisbursed()
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [mode, navigatorAddress, budgetId, to, amountWei, batch, onDisbursed])

  return (
    <div className="mt-3 pt-3 border-t border-dao-border space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-dao-text-secondary">Disburse (you are the manager)</p>
        <div className="flex gap-1 text-xs">
          <button type="button" onClick={() => { setMode('single'); setError(null) }} className={mode === 'single' ? 'text-primary-400 font-medium' : 'text-dao-text-hint hover:text-dao-text'}>Single</button>
          <span className="text-dao-text-hint">·</span>
          <button type="button" onClick={() => { setMode('batch'); setError(null) }} className={mode === 'batch' ? 'text-primary-400 font-medium' : 'text-dao-text-hint hover:text-dao-text'}>Batch payroll</button>
        </div>
      </div>

      {mode === 'single' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={to}
              onChange={(e) => { setTo(e.target.value); setError(null); setSuccess(false) }}
              placeholder="Recipient 0x…"
              className="input flex-1 font-mono text-sm"
              disabled={busy}
            />
            <input
              value={amount}
              onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) { setAmount(e.target.value); setError(null); setSuccess(false) } }}
              placeholder={`Amount (${tokenLabel})`}
              className="input sm:w-40 font-mono text-sm"
              inputMode="decimal"
              disabled={busy}
            />
            <Button variant="primary" size="sm" onClick={handleDisburse} loading={busy} disabled={!singleValid}>
              Disburse
            </Button>
          </div>
          {overAllowance && <p className="text-xs text-red-400">Exceeds the remaining allowance this period.</p>}
        </>
      ) : (
        <>
          <textarea
            value={batchText}
            onChange={(e) => { setBatchText(e.target.value); setError(null); setSuccess(false) }}
            placeholder={`One payee per line:\n0xabc… 100\n0xdef… 250`}
            className="input w-full min-h-[80px] resize-y font-mono text-sm"
            disabled={busy}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-dao-text-hint">
              {batch.count > 0 && !batch.err
                ? <>{batch.count} payee{batch.count === 1 ? '' : 's'} · total {formatTokenAmount(batch.total)} {tokenLabel}</>
                : 'Atomic — all paid in one tx, or none.'}
            </p>
            <Button variant="primary" size="sm" onClick={handleDisburse} loading={busy} disabled={!batchValid}>
              Disburse Batch
            </Button>
          </div>
          {batch.err && <p className="text-xs text-red-400">{batch.err}</p>}
          {batch.over && <p className="text-xs text-red-400">Batch total exceeds the remaining allowance this period.</p>}
        </>
      )}
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      {success && <p className="text-xs text-emerald-400" role="status">Disbursed.</p>}
    </div>
  )
}

function DisbursementFeed({
  disbursements,
  tokenLabel,
}: {
  disbursements?: BudgetDisbursementRow[]
  tokenLabel: string
}) {
  if (!disbursements || disbursements.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-dao-border">
      <p className="text-xs font-medium text-dao-text-secondary mb-1.5">Recent disbursements</p>
      <div className="space-y-1">
        {disbursements.slice(0, 5).map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
            <AddressDisplay address={d.recipient} />
            <span className="font-mono text-dao-text-secondary">
              {formatTokenAmount(d.amount)} {tokenLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

