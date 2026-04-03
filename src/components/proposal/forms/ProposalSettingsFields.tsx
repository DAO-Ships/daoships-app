import { useState } from 'react'
import { formatDuration, parseDurationToSeconds } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalSettingsFields — Collapsible advanced settings for all proposal forms
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalSettingsFieldsProps {
  expiration: string
  onExpirationChange: (value: string) => void
  disabled?: boolean
  /** Force the section open (e.g., when validation fails on a contained field) */
  forceOpen?: boolean
}

export function ProposalSettingsFields({
  expiration,
  onExpirationChange,
  disabled = false,
  forceOpen = false,
}: ProposalSettingsFieldsProps) {
  const hasContent = !!expiration
  const [open, setOpen] = useState(hasContent)
  const isOpen = open || forceOpen

  const expirationSeconds = parseDurationToSeconds(expiration)

  return (
    <div className="border-t border-dao-border pt-3">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-dao-text-muted hover:text-dao-text transition-colors w-full text-left py-1"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium">Additional Options</span>
        {hasContent && !isOpen && (
          <span className="text-xs text-dao-text-hint ml-1">(expiration)</span>
        )}
      </button>

      {isOpen && (
        <div className="space-y-4 mt-3">
          {/* Expiration */}
          <div>
            <label htmlFor="proposal-expiration" className="block text-xs font-medium text-dao-text-secondary mb-1">
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
                Expires in {formatDuration(expirationSeconds)} after submission
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
