import { formatDuration, parseDurationToSeconds } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalSettingsFields - Shared expiration + rationale fields for all forms
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalSettingsFieldsProps {
  expiration: string
  onExpirationChange: (value: string) => void
  rationale: string
  onRationaleChange: (value: string) => void
  disabled?: boolean
}

export function ProposalSettingsFields({
  expiration,
  onExpirationChange,
  rationale,
  onRationaleChange,
  disabled = false,
}: ProposalSettingsFieldsProps) {
  const expirationSeconds = parseDurationToSeconds(expiration)

  return (
    <div className="space-y-4 pt-2 border-t border-dao-border">
      <p className="text-xs text-dao-text-hint uppercase tracking-wider font-semibold">
        Proposal Settings
      </p>

      {/* Expiration */}
      <div>
        <label htmlFor="proposal-expiration" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Expiration
        </label>
        <input
          id="proposal-expiration"
          type="text"
          value={expiration}
          onChange={(e) => onExpirationChange(e.target.value)}
          placeholder='None (e.g. "7 days", "2 weeks")'
          className="input w-full"
          disabled={disabled}
        />
        {expirationSeconds !== null && expirationSeconds > 0 && (
          <p className="text-xs text-dao-text-hint mt-1">
            Proposal expires in {formatDuration(expirationSeconds)} after submission
          </p>
        )}
        <p className="text-xs text-dao-text-hint mt-1">
          Optional. Must be longer than the voting + grace period. Leave blank for no expiration (auto-expiry still applies).
        </p>
      </div>

      {/* Rationale / Extended Description */}
      <div>
        <label htmlFor="proposal-rationale" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Rationale
        </label>
        <textarea
          id="proposal-rationale"
          value={rationale}
          onChange={(e) => onRationaleChange(e.target.value)}
          placeholder="Provide additional context, analysis, or reasoning for this proposal..."
          className="input w-full min-h-[100px] resize-y"
          maxLength={8192}
          disabled={disabled}
          rows={4}
        />
        <p className="text-xs text-dao-text-hint mt-1">
          Optional. Posted on-chain via the Poster contract for members to review. Supports longer form content than the description.
        </p>
      </div>
    </div>
  )
}
