import { useState, useCallback } from 'react'
import type { Control, FieldErrors } from 'react-hook-form'
import { useFieldArray, useController, useWatch } from 'react-hook-form'
import { tokenService } from '@/services/core/TokenService'
import { NETWORK_CONFIG, MAX_GUILD_TOKENS } from '@/config/contracts'
import type { LaunchFormValues } from './BasicInfoStep'
import { isAddress } from '@/services/utils/AddressUtils'

// ═══════════════════════════════════════════════════════════════════════════
// GuildTokensStep - Configure native or ERC-20 tokens claimable during ragequit
// ═══════════════════════════════════════════════════════════════════════════


interface VerificationResult {
  status: 'idle' | 'verifying' | 'valid' | 'invalid'
  name?: string
  symbol?: string
  decimals?: number
  error?: string
}

interface GuildTokensStepProps {
  control: Control<LaunchFormValues>
  errors: FieldErrors<LaunchFormValues>
}

export function GuildTokensStep({ control, errors }: GuildTokensStepProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'guildTokens',
  })

  const tokens = useWatch({ control, name: 'guildTokens' })
  const hasNativeToken = tokens?.some(t => t.type === 'native') ?? false
  const atLimit = fields.length >= MAX_GUILD_TOKENS

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold font-display text-dao-text mb-1">Guild Tokens</h2>
        <p className="text-sm text-dao-text-muted">
          Guild tokens are held by the DAO treasury and members can claim them proportionally
          when they ragequit. You can add the network token ({NETWORK_CONFIG.nativeCurrency.symbol}) or ERC-20 tokens.
        </p>
        <p className="text-xs text-dao-text-hint mt-2">
          This is optional. Guild tokens can also be added later via governance proposals.
        </p>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <GuildTokenRow
            key={field.id}
            index={index}
            control={control}
            error={errors.guildTokens?.[index]?.address?.message}
            onRemove={() => remove(index)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        {!hasNativeToken && !atLimit && (
          <button
            type="button"
            onClick={() => append({ type: 'native', address: '' })}
            className="text-sm text-accent-400 hover:text-accent-300 transition-colors"
          >
            + Add {NETWORK_CONFIG.nativeCurrency.symbol}
          </button>
        )}
        {!atLimit && (
          <button
            type="button"
            onClick={() => append({ type: 'erc20', address: '' })}
            className="text-sm text-accent-400 hover:text-accent-300 transition-colors"
          >
            + Add ERC-20 Token
          </button>
        )}
        <span className="text-xs text-dao-text-hint ml-auto">
          {fields.length} / {MAX_GUILD_TOKENS}
        </span>
      </div>
      {atLimit && (
        <p className="text-xs text-amber-400">
          Maximum of {MAX_GUILD_TOKENS} guild tokens reached. Remove a token to add another.
        </p>
      )}

      {fields.length === 0 && (
        <div className="bg-dao-dark-2 border border-dao-border rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-dao-text-hint">
            No guild tokens configured. Members will not be able to ragequit for treasury tokens.
          </p>
        </div>
      )}
    </div>
  )
}

function GuildTokenRow({
  index,
  control,
  error,
  onRemove,
}: {
  index: number
  control: Control<LaunchFormValues>
  error?: string
  onRemove: () => void
}) {
  const tokenType = useWatch({ control, name: `guildTokens.${index}.type` })

  if (tokenType === 'native') {
    return <NativeTokenRow index={index} onRemove={onRemove} />
  }

  return (
    <ERC20TokenRow
      index={index}
      control={control}
      error={error}
      onRemove={onRemove}
    />
  )
}

function NativeTokenRow({ onRemove }: { index: number; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-dao-dark-2 border border-dao-border rounded-lg px-4 py-3">
      <div className="flex-1 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold">
          {NETWORK_CONFIG.nativeCurrency.symbol.charAt(0)}
        </span>
        <div>
          <span className="text-sm font-medium text-dao-text">
            {NETWORK_CONFIG.nativeCurrency.name} ({NETWORK_CONFIG.nativeCurrency.symbol})
          </span>
          <span className="text-xs text-dao-text-hint ml-2">Network Token</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-2 -m-2 text-dao-text-hint hover:text-red-400 transition-colors"
        title="Remove token"
        aria-label="Remove token"
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

function ERC20TokenRow({
  index,
  control,
  error,
  onRemove,
}: {
  index: number
  control: Control<LaunchFormValues>
  error?: string
  onRemove: () => void
}) {
  const [verification, setVerification] = useState<VerificationResult>({ status: 'idle' })

  const { field } = useController({
    control,
    name: `guildTokens.${index}.address`,
    rules: {
      validate: (value) => {
        if (!value) return 'Token address is required'
        if (!isAddress(value)) return 'Invalid address format'
        return true
      },
    },
  })

  const verifyToken = useCallback(async (address: string) => {
    if (!isAddress(address)) {
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
    const value = e.target.value
    field.onChange(value)
    setVerification({ status: 'idle' })
  }

  const handleBlur = () => {
    field.onBlur()
    if (field.value && isAddress(field.value)) {
      verifyToken(field.value)
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <input
            value={field.value}
            onChange={handleChange}
            onBlur={handleBlur}
            ref={field.ref}
            name={field.name}
            type="text"
            placeholder="0x... ERC-20 token address"
            className="input w-full font-mono text-sm"
          />
          {verification.status === 'verifying' && (
            <span className="flex-shrink-0 text-xs text-dao-text-hint animate-pulse">Verifying...</span>
          )}
        </div>

        {/* Verification result */}
        {verification.status === 'valid' && (
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-2 p-2 -m-2 text-dao-text-hint hover:text-red-400 transition-colors"
        title="Remove token"
        aria-label="Remove token"
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
