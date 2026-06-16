import type { ReactNode } from 'react'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount } from '@/utils/format'
import { formatDuration } from '@/utils/time'
import type { DecodedVestingAction } from '@/utils/vestingProposals'

// ═══════════════════════════════════════════════════════════════════════════
// VestingActionDetail — human-readable view of a VestingNavigator custom action
// ───────────────────────────────────────────────────────────────────────────
// Custom-action proposals carry raw calldata. For vesting schedules that means an
// opaque blob of wei amounts, unix timestamps, seconds, and a bool. This turns the
// decoded call into plain language so proposers and voters can see exactly who gets
// how much, when it starts, the cliff, and how long it vests.
// ═══════════════════════════════════════════════════════════════════════════

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dao-border/30 py-1 last:border-0">
      <span className="text-dao-text-muted flex-shrink-0">{label}</span>
      <span className="text-dao-text-secondary text-right break-all">{children}</span>
    </div>
  )
}

/** One-sentence plain-language summary of what executing the schedule does. */
function createScheduleSummary(a: Extract<DecodedVestingAction, { kind: 'createSchedule' }>): string {
  const kind = a.isLoot ? 'loot' : 'shares'
  const total = formatTokenAmount(a.totalAmount)
  const duration = formatDuration(Number(a.vestingDuration))
  const start =
    a.startTime === 0n
      ? 'Starting when this proposal executes'
      : `Starting ${new Date(Number(a.startTime) * 1000).toLocaleString()}`
  const cliffNote =
    a.cliffDuration > 0n
      ? `; nothing is claimable until the ${formatDuration(Number(a.cliffDuration))} cliff elapses`
      : ''
  const kindNote = a.isLoot
    ? 'loot (economic rights only, no voting power)'
    : 'shares (voting power, granted only as tokens are claimed)'
  return `${start}, ${total} ${kind} vest linearly over ${duration} total${cliffNote}. Tokens are minted incrementally to the beneficiary on claim as ${kindNote}; unvested amounts carry no power and can be frozen by a later revoke.`
}

export function VestingActionDetail({ action }: { action: DecodedVestingAction }) {
  if (action.kind === 'revoke') {
    return (
      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-900/10 px-3 py-2.5 text-xs space-y-1">
        <p className="text-sm font-medium text-dao-text">
          Revoke vesting schedule #{action.scheduleId.toString()}
        </p>
        <p className="text-dao-text-muted leading-relaxed">
          Freezes future accrual from the moment this executes. Tokens already vested or minted are{' '}
          <span className="font-medium text-dao-text-secondary">not</span> clawed back — only the
          un-accrued remainder is cancelled.
        </p>
      </div>
    )
  }

  const kind = action.isLoot ? 'loot' : 'shares'
  const kindLabel = action.isLoot ? 'Loot — economic only' : 'Shares — voting power on claim'
  const startsNow = action.startTime === 0n

  return (
    <div className="mt-2 rounded-lg border border-dao-border bg-dao-dark-3/40 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-dao-text">
          Vest {formatTokenAmount(action.totalAmount)} {kind}
        </span>
        <span className="text-2xs px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 uppercase tracking-wide">
          {kind}
        </span>
      </div>

      <div className="text-xs space-y-0.5">
        <Row label="Beneficiary">
          <AddressDisplay address={action.beneficiary} />
        </Row>
        <Row label="Total amount">
          <span className="font-mono">
            {formatTokenAmount(action.totalAmount)} {kind}
          </span>
        </Row>
        <Row label="Token type">{kindLabel}</Row>
        <Row label="Start">
          {startsNow ? (
            'Immediately (on execution)'
          ) : (
            <span className="font-mono">
              {new Date(Number(action.startTime) * 1000).toLocaleString()}
            </span>
          )}
        </Row>
        <Row label="Cliff">
          {action.cliffDuration > 0n ? formatDuration(Number(action.cliffDuration)) : 'No cliff'}
        </Row>
        <Row label="Vesting duration">{formatDuration(Number(action.vestingDuration))}</Row>
      </div>

      <p className="text-2xs text-dao-text-hint leading-relaxed">{createScheduleSummary(action)}</p>
    </div>
  )
}
