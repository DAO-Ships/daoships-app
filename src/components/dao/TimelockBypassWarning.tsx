import { useBypassedConfigChanges } from '@/hooks/useTimelockChanges'
import { formatTimeAgo } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// TimelockBypassWarning - flags governance-config changes that skipped the timelock
// ───────────────────────────────────────────────────────────────────────────
// The timelock is advisory (a proposal can change config directly via executeAsGovernance).
// The indexer marks such changes bypassed_timelock=true. Surfacing them is the only thing
// that makes the timelock's "second ragequit window" guarantee meaningful to members.
// This is a TRUST SIGNAL, not an error — the change is valid and already applied.
// ═══════════════════════════════════════════════════════════════════════════

export function TimelockBypassWarning({ daoId }: { daoId: string }) {
  const { data: bypassed } = useBypassedConfigChanges(daoId)

  if (!bypassed || bypassed.length === 0) return null

  const latest = bypassed[0]
  const createdSec = latest.created_at ? Math.floor(new Date(latest.created_at).getTime() / 1000) : 0

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
      <div className="flex items-start gap-2">
        <svg aria-hidden="true" className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm text-amber-400 font-medium">
            {bypassed.length === 1
              ? 'A governance-config change bypassed this DAO’s timelock'
              : `${bypassed.length} governance-config changes bypassed this DAO’s timelock`}
          </p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            The change was applied <strong>directly</strong>, skipping the timelock delay and the second
            ragequit window. It is valid and already in effect — but members did not get the usual notice
            period before it landed.
            {createdSec > 0 && <> Most recent: {formatTimeAgo(createdSec)}.</>}
          </p>
        </div>
      </div>
    </div>
  )
}
