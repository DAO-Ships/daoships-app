import { useMemo } from 'react'
import { parseAllowlistInput, buildAllowlistTree } from '@/utils/allowlist'

// ═══════════════════════════════════════════════════════════════════════════
// AllowlistInput - Textarea for entering allowlist addresses with validation
// ═══════════════════════════════════════════════════════════════════════════

export const MAX_ALLOWLIST_ADDRESSES = 50

interface AllowlistInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function AllowlistInput({ value, onChange, disabled = false }: AllowlistInputProps) {
  const { addresses, invalid } = useMemo(() => parseAllowlistInput(value), [value])
  const overLimit = addresses.length > MAX_ALLOWLIST_ADDRESSES

  const root = useMemo(() => {
    if (addresses.length === 0) return null
    const tree = buildAllowlistTree(addresses)
    return tree?.root ?? null
  }, [addresses])

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-dao-text-secondary">
        Address Allowlist
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Paste addresses, one per line. Leave empty for open access.\n\n0x00abc...\n0x00def..."}
        rows={5}
        className="input w-full resize-y font-mono text-sm"
        disabled={disabled}
      />

      {/* Stats row */}
      {value.trim() && (
        <div className="flex items-center gap-3 text-xs">
          {addresses.length > 0 && (
            <span className={overLimit ? 'text-red-400' : 'text-dao-text-muted'}>
              {addresses.length}/{MAX_ALLOWLIST_ADDRESSES} {addresses.length === 1 ? 'address' : 'addresses'}
            </span>
          )}
          {invalid.length > 0 && (
            <span className="text-red-400">
              {invalid.length} invalid
            </span>
          )}
          {root && !overLimit && (
            <span className="text-dao-text-hint font-mono" title={root}>
              Root: {root.slice(0, 10)}...{root.slice(-6)}
            </span>
          )}
        </div>
      )}

      {/* Over limit warning */}
      {overLimit && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-xs text-red-400">
            Allowlist exceeds {MAX_ALLOWLIST_ADDRESSES} addresses. Remove {addresses.length - MAX_ALLOWLIST_ADDRESSES} to continue.
          </p>
        </div>
      )}

      {/* Invalid addresses detail */}
      {invalid.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-xs text-red-400 font-medium mb-1">Invalid addresses:</p>
          {invalid.slice(0, 5).map((addr, i) => (
            <p key={i} className="text-xs text-red-400/80 font-mono truncate">{addr}</p>
          ))}
          {invalid.length > 5 && (
            <p className="text-xs text-red-400/60">...and {invalid.length - 5} more</p>
          )}
        </div>
      )}

      {/* Privacy notice */}
      {addresses.length > 0 && (
        <p className="text-[11px] text-dao-text-hint">
          These addresses will be stored publicly on-chain via the Poster contract.
        </p>
      )}
    </div>
  )
}
