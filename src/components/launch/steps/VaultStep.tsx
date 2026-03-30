import type { Control, FieldErrors } from 'react-hook-form'
import { useFieldArray, useWatch } from 'react-hook-form'
import { isValidCyprus1Address } from '@/services/utils/AddressUtils'
import type { LaunchFormValues } from './BasicInfoStep'

// ═══════════════════════════════════════════════════════════════════════════
// VaultStep - Step 5: Vault owner list + approval threshold
// ═══════════════════════════════════════════════════════════════════════════

interface VaultStepProps {
  control: Control<LaunchFormValues>
  errors: FieldErrors<LaunchFormValues>
}

export function VaultStep({ control, errors }: VaultStepProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'vaultOwners',
  })

  const vaultOwners = useWatch({ control, name: 'vaultOwners' })
  const validOwnerCount = vaultOwners?.filter(o => o.address.trim()).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-dao-text mb-1">Vault Configuration</h2>
        <p className="text-sm text-dao-text-muted">
          Configure who can directly execute transactions on the DAO treasury
          and how many approvals are required.
        </p>
      </div>

      {/* Security Info */}
      <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3 space-y-2">
        <p className="text-sm text-accent-300 font-medium">How the vault works</p>
        <ul className="text-xs text-dao-text-muted space-y-1 list-disc list-inside">
          <li>Vault owners can directly execute treasury transactions outside of DAO governance.</li>
          <li>The approval threshold is the number of owner signatures needed for direct vault operations.</li>
          <li>Once the DAOShip is enabled as a vault module, governance proposals can execute treasury transactions without vault owner approval.</li>
          <li>For single-owner vaults (1/1): module enablement completes automatically during launch.</li>
          <li>For multisig vaults: the launcher will propose and approve module enablement, then remaining owners must approve via QuaiVault.</li>
        </ul>
      </div>

      {/* Vault Owners */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Vault Owners
          </h3>
          <span className="text-xs text-dao-text-hint">
            {validOwnerCount} owner{validOwnerCount !== 1 ? 's' : ''}
          </span>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="card px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <label className="text-xs text-dao-text-hint mb-1 block">
                  Owner {index + 1}
                </label>
                <input
                  type="text"
                  {...control.register(`vaultOwners.${index}.address`, {
                    validate: (value) => {
                      if (!value.trim()) return 'Address is required'
                      if (!isValidCyprus1Address(value.trim())) return 'Must be a valid Cyprus-1 address (0x00...)'
                      return true
                    },
                  })}
                  placeholder="0x00... vault owner address"
                  className="input w-full text-sm font-mono"
                />
                {errors.vaultOwners?.[index]?.address && (
                  <p className="text-xs text-red-400 mt-0.5">
                    {errors.vaultOwners[index]?.address?.message}
                  </p>
                )}
              </div>

              <div className="flex items-center pt-6">
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-dao-text-hint hover:text-red-400 transition-colors disabled:opacity-30"
                  disabled={fields.length <= 1}
                  title="Remove owner"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append({ address: '' })}
          className="w-full card px-4 py-3 text-center text-sm text-accent-400 hover:text-accent-300 hover:border-accent-500/50 transition-colors"
        >
          + Add Vault Owner
        </button>

        {errors.vaultOwners?.root && (
          <p className="text-xs text-red-400">{errors.vaultOwners.root.message}</p>
        )}
      </div>

      {/* Approval Threshold */}
      <div>
        <label htmlFor="vault-threshold" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Approval Threshold <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            id="vault-threshold"
            type="number"
            min={1}
            max={validOwnerCount || 1}
            {...control.register('vaultThreshold', {
              validate: (value) => {
                const num = parseInt(value, 10)
                if (isNaN(num) || num < 1) return 'Threshold must be at least 1'
                if (num > validOwnerCount) return `Threshold cannot exceed number of owners (${validOwnerCount})`
                return true
              },
            })}
            className="input w-24 text-center"
          />
          <span className="text-sm text-dao-text-muted">
            of {validOwnerCount} owner{validOwnerCount !== 1 ? 's' : ''}
          </span>
        </div>
        {errors.vaultThreshold && (
          <p className="text-xs text-red-400 mt-1">{errors.vaultThreshold.message}</p>
        )}
        <p className="text-xs text-dao-text-hint mt-1">
          Number of vault owner approvals required for direct treasury operations.
        </p>
      </div>
    </div>
  )
}
