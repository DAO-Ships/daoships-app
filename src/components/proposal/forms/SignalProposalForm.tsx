import { useState } from 'react'
import { Button } from '@/components/common/Button'

// ═══════════════════════════════════════════════════════════════════════════
// SignalProposalForm - Non-executing "signal" DAOShip proposal (title + description).
// NOTE: unrelated to the SignalNavigator (a read-only contract with its own on-chain
// polls). This is a normal proposal that carries no executable actions.
// ═══════════════════════════════════════════════════════════════════════════

interface SignalProposalFormData {
  title: string
  description: string
}

interface SignalProposalFormProps {
  onSubmit: (data: SignalProposalFormData) => void
  isSubmitting?: boolean
}

export function SignalProposalForm({ onSubmit, isSubmitting = false }: SignalProposalFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof SignalProposalFormData, string>>>({})

  const validate = (): boolean => {
    const newErrors: typeof errors = {}
    if (!title.trim()) {
      newErrors.title = 'Title is required'
    } else if (title.length > 240) {
      newErrors.title = 'Title must be 240 characters or fewer'
    }
    if (description.length > 5000) {
      newErrors.description = 'Description must be 5000 characters or fewer'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSubmit({ title: title.trim(), description: description.trim() })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="signal-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Title
        </label>
        <input
          id="signal-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this signal about?"
          className="input w-full"
          maxLength={240}
          disabled={isSubmitting}
        />
        {errors.title && (
          <p className="text-xs text-red-400 mt-1">{errors.title}</p>
        )}
        <p className="text-xs text-dao-text-hint mt-1">{title.length}/240</p>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="signal-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="signal-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Provide additional context for your signal proposal..."
          className="input w-full min-h-[120px] resize-y"
          maxLength={5000}
          disabled={isSubmitting}
          rows={5}
        />
        {errors.description && (
          <p className="text-xs text-red-400 mt-1">{errors.description}</p>
        )}
        <p className="text-xs text-dao-text-hint mt-1">{description.length}/5000</p>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!title.trim()}
        >
          Submit Signal Proposal
        </Button>
      </div>
    </form>
  )
}
