// ═══════════════════════════════════════════════════════════════════════════
// OfferingField - Shared proposal tribute/offering input
// ═══════════════════════════════════════════════════════════════════════════

interface OfferingFieldProps {
  value: string
  onChange: (value: string) => void
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  disabled?: boolean
  error?: string
}

export function OfferingField({
  value,
  onChange,
  minOfferingDisplay,
  canSelfSponsor = false,
  disabled = false,
  error,
}: OfferingFieldProps) {
  if (canSelfSponsor) {
    return (
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Proposal Tribute
        </label>
        <p className="text-xs text-emerald-400">
          You have enough voting power to self-sponsor. No tribute required.
        </p>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor="proposal-offering" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
        Proposal Tribute
      </label>
      <div className="relative">
        <input
          id="proposal-offering"
          type="text"
          value={value}
          onChange={(e) => {
            if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
              onChange(e.target.value)
            }
          }}
          placeholder={minOfferingDisplay}
          className="input w-full pr-16 font-mono"
          disabled={disabled}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">QUAI</span>
      </div>
      {minOfferingDisplay !== '0' && (
        <p className="text-xs text-dao-text-hint mt-1">
          Required by this DAO: {minOfferingDisplay} QUAI (must be exact)
        </p>
      )}
      {minOfferingDisplay === '0' && (
        <p className="text-xs text-dao-text-hint mt-1">
          No tribute required by this DAO
        </p>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
