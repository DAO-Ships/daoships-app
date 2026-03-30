import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'

// ═══════════════════════════════════════════════════════════════════════════
// CustomActionForm - Raw target address + calldata + value for advanced users
// ═══════════════════════════════════════════════════════════════════════════

interface CustomActionFormData {
  title: string
  description: string
  target: string
  calldata: string
  value: string
  offering: string
}

interface CustomActionFormProps {
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: CustomActionFormData) => void
  isSubmitting?: boolean
}

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const HEX_REGEX = /^0x[0-9a-fA-F]*$/

export function CustomActionForm({ minOfferingDisplay, canSelfSponsor = false, onSubmit, isSubmitting = false }: CustomActionFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('')
  const [calldata, setCalldata] = useState('0x')
  const [value, setValue] = useState('0')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [rationale, setRationale] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }
    if (!ADDRESS_REGEX.test(target)) {
      newErrors.target = 'Must be a valid 42-character hex address'
    }
    if (!HEX_REGEX.test(calldata)) {
      newErrors.calldata = 'Must be valid hex data (0x-prefixed)'
    }
    if (!/^\d+$/.test(value)) {
      newErrors.value = 'Must be a non-negative integer (wei)'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        target,
        calldata,
        value,
        offering,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Warning banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-yellow-400">
          Advanced: This form sends raw calldata to a target contract. Make sure you know what you are doing.
        </p>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="custom-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Title
        </label>
        <input
          id="custom-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Custom action proposal title"
          className="input w-full"
          maxLength={240}
          disabled={isSubmitting}
        />
        {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="custom-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="custom-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this custom action does..."
          className="input w-full min-h-[80px] resize-y"
          maxLength={5000}
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      {/* Target Address */}
      <div>
        <label htmlFor="custom-target" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Target Contract Address
        </label>
        <input
          id="custom-target"
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="0x..."
          className="input w-full font-mono"
          disabled={isSubmitting}
        />
        {errors.target && <p className="text-xs text-red-400 mt-1">{errors.target}</p>}
      </div>

      {/* Calldata */}
      <div>
        <label htmlFor="custom-calldata" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Calldata (hex)
        </label>
        <textarea
          id="custom-calldata"
          value={calldata}
          onChange={(e) => setCalldata(e.target.value)}
          placeholder="0x"
          className="input w-full font-mono text-sm min-h-[80px] resize-y"
          disabled={isSubmitting}
          rows={3}
        />
        {errors.calldata && <p className="text-xs text-red-400 mt-1">{errors.calldata}</p>}
        <p className="text-xs text-dao-text-hint mt-1">ABI-encoded function call data</p>
      </div>

      {/* Value */}
      <div>
        <label htmlFor="custom-value" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Value (wei)
        </label>
        <input
          id="custom-value"
          type="text"
          value={value}
          onChange={(e) => {
            if (e.target.value === '' || /^\d*$/.test(e.target.value)) {
              setValue(e.target.value)
            }
          }}
          placeholder="0"
          className="input w-full font-mono"
          disabled={isSubmitting}
        />
        {errors.value && <p className="text-xs text-red-400 mt-1">{errors.value}</p>}
        <p className="text-xs text-dao-text-hint mt-1">Native token amount to send with the call</p>
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
          disabled={!title.trim() || !target}
        >
          Submit Custom Action Proposal
        </Button>
      </div>
    </form>
  )
}
