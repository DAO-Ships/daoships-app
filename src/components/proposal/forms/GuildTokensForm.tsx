import { useState, useCallback } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { tokenService } from '@/services/core/TokenService'
import { NATIVE_TOKEN_SENTINEL, NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// GuildTokensForm - Add or remove guild tokens (native QUAI or ERC-20s)
// ═══════════════════════════════════════════════════════════════════════════

interface TokenRow {
  id: string
  type: 'native' | 'erc20'
  address: string
  enabled: boolean
}

interface VerificationResult {
  status: 'idle' | 'verifying' | 'valid' | 'invalid'
  name?: string
  symbol?: string
  decimals?: number
  error?: string
}

interface GuildTokensFormData {
  title: string
  description: string
  offering: string
  tokens: Array<{ address: string; enabled: boolean }>
}

interface GuildTokensFormProps {
  currentGuildTokens: string[]
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: GuildTokensFormData) => void
  isSubmitting?: boolean
}

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/

let rowIdCounter = 0
function generateRowId(): string {
  return `gt-${++rowIdCounter}`
}

function isNativeSentinel(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_SENTINEL.toLowerCase()
}

export function GuildTokensForm({
  currentGuildTokens,
  minOfferingDisplay,
  canSelfSponsor = false,
  onSubmit,
  isSubmitting = false,
}: GuildTokensFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [rationale, setRationale] = useState('')
  const [rows, setRows] = useState<TokenRow[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const hasNativeRow = rows.some((r) => r.type === 'native')
  const hasNativeCurrent = currentGuildTokens.some(isNativeSentinel)

  const addERC20Row = () => {
    setRows((prev) => [...prev, { id: generateRowId(), type: 'erc20', address: '', enabled: true }])
  }

  const addNativeRow = () => {
    setRows((prev) => [...prev, { id: generateRowId(), type: 'native', address: NATIVE_TOKEN_SENTINEL, enabled: true }])
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const updateRow = (id: string, field: 'address' | 'enabled', value: string | boolean) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    )
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Title is required'
    if (rows.length === 0) newErrors.rows = 'Add at least one token change'

    rows.forEach((row, index) => {
      if (row.type === 'erc20' && !ADDRESS_REGEX.test(row.address)) {
        newErrors[`address-${index}`] = 'Invalid token address'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        offering,
        tokens: rows.map(({ type, address, enabled }) => ({
          address: type === 'native' ? NATIVE_TOKEN_SENTINEL : address,
          enabled,
        })),
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="gt-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Title
        </label>
        <input
          id="gt-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Guild token proposal title"
          className="input w-full"
          maxLength={240}
          disabled={isSubmitting}
        />
        {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="gt-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="gt-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe why these guild tokens should be added or removed..."
          className="input w-full min-h-[80px] resize-y"
          maxLength={5000}
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      {/* Current guild tokens */}
      {currentGuildTokens.length > 0 && (
        <div>
          <p className="text-sm font-medium text-dao-text-secondary mb-2">Current Guild Tokens</p>
          <div className="space-y-1">
            {currentGuildTokens.map((addr) => (
              <div key={addr} className="text-xs font-mono text-dao-text-hint bg-dao-dark-2 rounded px-3 py-1.5">
                {isNativeSentinel(addr) ? (
                  <span className="font-sans">
                    {NETWORK_CONFIG.nativeCurrency.name} ({NETWORK_CONFIG.nativeCurrency.symbol})
                    <span className="text-dao-text-hint ml-2">Network Token</span>
                  </span>
                ) : (
                  addr
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token rows */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-dao-text-secondary">
            Token Changes
          </label>
          <div className="flex items-center gap-3">
            {!hasNativeRow && !hasNativeCurrent && (
              <button
                type="button"
                onClick={addNativeRow}
                className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
                disabled={isSubmitting}
              >
                + Add {NETWORK_CONFIG.nativeCurrency.symbol}
              </button>
            )}
            <button
              type="button"
              onClick={addERC20Row}
              className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
              disabled={isSubmitting}
            >
              + Add ERC-20
            </button>
          </div>
        </div>

        {errors.rows && rows.length === 0 && (
          <p className="text-xs text-red-400 mb-2">{errors.rows}</p>
        )}

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="card px-4 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                {/* Address or native label */}
                <div className="sm:col-span-7">
                  {row.type === 'native' ? (
                    <div className="flex items-center gap-2 h-[38px]">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold">
                        {NETWORK_CONFIG.nativeCurrency.symbol.charAt(0)}
                      </span>
                      <span className="text-sm font-medium text-dao-text">
                        {NETWORK_CONFIG.nativeCurrency.name} ({NETWORK_CONFIG.nativeCurrency.symbol})
                      </span>
                      <span className="text-xs text-dao-text-hint">Network Token</span>
                    </div>
                  ) : (
                    <ERC20AddressInput
                      value={row.address}
                      onChange={(value) => updateRow(row.id, 'address', value)}
                      error={errors[`address-${index}`]}
                      disabled={isSubmitting}
                    />
                  )}
                </div>

                {/* Action */}
                <div className="sm:col-span-3">
                  <select
                    value={row.enabled ? 'enable' : 'disable'}
                    onChange={(e) => updateRow(row.id, 'enabled', e.target.value === 'enable')}
                    className="input w-full text-sm"
                    disabled={isSubmitting}
                  >
                    <option value="enable">Enable</option>
                    <option value="disable">Disable</option>
                  </select>
                </div>

                {/* Remove */}
                <div className="sm:col-span-2 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="text-dao-text-hint hover:text-red-400 transition-colors disabled:opacity-30"
                    disabled={isSubmitting}
                    title="Remove row"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Proposal Settings */}
      <ProposalSettingsFields
        expiration={expiration}
        onExpirationChange={setExpiration}
        rationale={rationale}
        onRationaleChange={setRationale}
        disabled={isSubmitting}
      />

      {/* Tribute */}
      <OfferingField
        value={offering}
        onChange={setOffering}
        minOfferingDisplay={minOfferingDisplay}
        canSelfSponsor={canSelfSponsor}
        disabled={isSubmitting}
      />

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!title.trim() || rows.length === 0 || rows.some((r) => r.type === 'erc20' && !r.address)}
        >
          Submit Guild Tokens Proposal
        </Button>
      </div>
    </form>
  )
}

// ── ERC-20 Address Input with on-chain verification ──────────────────────

function ERC20AddressInput({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}) {
  const [verification, setVerification] = useState<VerificationResult>({ status: 'idle' })

  const verifyToken = useCallback(async (address: string) => {
    if (!ADDRESS_REGEX.test(address)) {
      setVerification({ status: 'idle' })
      return
    }

    setVerification({ status: 'verifying' })
    const result = await tokenService.verifyERC20(address)

    if (result) {
      setVerification({
        status: 'valid',
        name: result.name,
        symbol: result.symbol,
        decimals: result.decimals,
      })
    } else {
      setVerification({
        status: 'invalid',
        error: 'No ERC-20 contract found at this address',
      })
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setVerification({ status: 'idle' })
  }

  const handleBlur = () => {
    if (value && ADDRESS_REGEX.test(value)) {
      verifyToken(value)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="0x... ERC-20 token address"
          className="input w-full font-mono text-sm"
          disabled={disabled}
        />
        {verification.status === 'verifying' && (
          <span className="flex-shrink-0 text-xs text-dao-text-hint animate-pulse">Verifying...</span>
        )}
      </div>

      {verification.status === 'valid' && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-green-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Verified
          </span>
          <span className="text-dao-text-muted">
            {verification.name} ({verification.symbol}) &middot; {verification.decimals} decimals
          </span>
        </div>
      )}

      {verification.status === 'invalid' && (
        <p className="text-xs text-amber-400 mt-1">{verification.error}</p>
      )}

      {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
    </div>
  )
}
