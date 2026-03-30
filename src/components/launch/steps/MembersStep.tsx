import type { Control, FieldErrors } from 'react-hook-form'
import { useFieldArray } from 'react-hook-form'
import { isValidCyprus1Address } from '@/services/utils/AddressUtils'
import type { LaunchFormValues } from './BasicInfoStep'

// ═══════════════════════════════════════════════════════════════════════════
// MembersStep - Step 2: Dynamic member rows (address, shares, loot)
// ═══════════════════════════════════════════════════════════════════════════

interface MembersStepProps {
  control: Control<LaunchFormValues>
  errors: FieldErrors<LaunchFormValues>
}

export function MembersStep({ control, errors }: MembersStepProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'members',
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-dao-text mb-1">Initial Members</h2>
        <p className="text-sm text-dao-text-muted">
          Add the founding members who will receive initial shares and loot.
          At least one member is required.
        </p>
      </div>

      {/* Member rows */}
      <div className="space-y-3">
        {/* Column headers */}
        <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-1 text-xs text-dao-text-hint uppercase tracking-wider">
          <div className="sm:col-span-6">Address</div>
          <div className="sm:col-span-2">Shares</div>
          <div className="sm:col-span-2">Loot</div>
          <div className="sm:col-span-2" />
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="card px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
              {/* Address */}
              <div className="sm:col-span-6">
                <label className="sm:hidden text-xs text-dao-text-hint mb-1 block">Address</label>
                <input
                  type="text"
                  {...control.register(`members.${index}.address`, {
                    validate: (value) => {
                      if (!value.trim()) return 'Address is required'
                      if (!isValidCyprus1Address(value.trim())) return 'Must be a valid Cyprus-1 address (0x00...)'
                      return true
                    },
                  })}
                  placeholder="0x00... member address"
                  className="input w-full text-sm font-mono"
                />
                {errors.members?.[index]?.address && (
                  <p className="text-xs text-red-400 mt-0.5">
                    {errors.members[index]?.address?.message}
                  </p>
                )}
              </div>

              {/* Shares */}
              <div className="sm:col-span-2">
                <label className="sm:hidden text-xs text-dao-text-hint mb-1 block">Shares</label>
                <input
                  type="text"
                  {...control.register(`members.${index}.shares`)}
                  placeholder="0"
                  className="input w-full text-sm"
                />
                {errors.members?.[index]?.shares && (
                  <p className="text-xs text-red-400 mt-0.5">
                    {errors.members[index]?.shares?.message}
                  </p>
                )}
              </div>

              {/* Loot */}
              <div className="sm:col-span-2">
                <label className="sm:hidden text-xs text-dao-text-hint mb-1 block">Loot</label>
                <input
                  type="text"
                  {...control.register(`members.${index}.loot`)}
                  placeholder="0"
                  className="input w-full text-sm"
                />
                {errors.members?.[index]?.loot && (
                  <p className="text-xs text-red-400 mt-0.5">
                    {errors.members[index]?.loot?.message}
                  </p>
                )}
              </div>

              {/* Remove button */}
              <div className="sm:col-span-2 flex items-center justify-end sm:justify-center">
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-dao-text-hint hover:text-red-400 transition-colors disabled:opacity-30"
                  disabled={fields.length <= 1}
                  title="Remove member"
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

      {/* Add member button */}
      <button
        type="button"
        onClick={() => append({ address: '', shares: '0', loot: '0' })}
        className="w-full card px-4 py-3 text-center text-sm text-accent-400 hover:text-accent-300 hover:border-accent-500/50 transition-colors"
      >
        + Add Member
      </button>

      {/* Global members error */}
      {errors.members?.root && (
        <p className="text-xs text-red-400">{errors.members.root.message}</p>
      )}
    </div>
  )
}
