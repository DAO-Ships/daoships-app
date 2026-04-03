import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'

// ═══════════════════════════════════════════════════════════════════════════
// MembershipForm - Mint/burn shares or loot for members
// ═══════════════════════════════════════════════════════════════════════════

interface MemberRow {
  id: string
  address: string
  amount: string
  tokenType: 'shares' | 'loot'
  action: 'mint' | 'burn'
}

interface MembershipFormData {
  title: string
  description: string
  offering: string
  expiration: string
  discussionUrl: string
  members: Array<{
    address: string
    amount: string
    tokenType: 'shares' | 'loot'
    action: 'mint' | 'burn'
  }>
}

interface MembershipFormProps {
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: MembershipFormData) => void
  isSubmitting?: boolean
}

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/

let rowIdCounter = 0
function generateRowId(): string {
  return `row-${++rowIdCounter}`
}

function createEmptyRow(): MemberRow {
  return {
    id: generateRowId(),
    address: '',
    amount: '',
    tokenType: 'shares',
    action: 'mint',
  }
}

export function MembershipForm({ minOfferingDisplay, canSelfSponsor = false, onSubmit, isSubmitting = false }: MembershipFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [rows, setRows] = useState<MemberRow[]>([createEmptyRow()])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()])
  }

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows((prev) => prev.filter((r) => r.id !== id))
    }
  }

  const updateRow = (id: string, field: keyof Omit<MemberRow, 'id'>, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    )
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }

    rows.forEach((row, index) => {
      if (!ADDRESS_REGEX.test(row.address)) {
        newErrors[`address-${index}`] = 'Invalid address'
      }
      if (!row.amount || Number(row.amount) <= 0) {
        newErrors[`amount-${index}`] = 'Invalid amount'
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
        expiration,
        discussionUrl,
        members: rows.map(({ address, amount, tokenType, action }) => ({
          address,
          amount,
          tokenType,
          action,
        })),
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="membership-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Title
        </label>
        <input
          id="membership-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Membership proposal title"
          className="input w-full"
          maxLength={120}
          disabled={isSubmitting}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
        {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="membership-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="membership-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the membership changes..."
          className="input w-full min-h-[60px] resize-y"
          maxLength={2000}
          disabled={isSubmitting}
          rows={2}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
      </div>

      {/* Discussion Link */}
      <div>
        <label htmlFor="membership-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Discussion Link
        </label>
        <input
          id="membership-discussion-url"
          type="url"
          value={discussionUrl}
          onChange={(e) => setDiscussionUrl(e.target.value)}
          placeholder="https://forum.mydao.xyz/t/..."
          className="input w-full font-mono text-sm"
          maxLength={200}
          disabled={isSubmitting}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{discussionUrl.length}/200</p>
      </div>

      <ProposalActionSection title="Membership Changes">
        {/* Member rows */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-dao-text-secondary">
              Members
            </label>
            <button
              type="button"
              onClick={addRow}
              className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
              disabled={isSubmitting}
            >
              + Add Row
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="card px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                  {/* Address */}
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      value={row.address}
                      onChange={(e) => updateRow(row.id, 'address', e.target.value)}
                      placeholder="0x... member address"
                      className="input w-full font-mono text-sm"
                      disabled={isSubmitting}
                    />
                    {errors[`address-${index}`] && (
                      <p className="text-xs text-red-400 mt-0.5">{errors[`address-${index}`]}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={row.amount}
                      onChange={(e) => {
                        if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                          updateRow(row.id, 'amount', e.target.value)
                        }
                      }}
                      placeholder="Amount"
                      className="input w-full font-mono text-sm"
                      disabled={isSubmitting}
                    />
                    {errors[`amount-${index}`] && (
                      <p className="text-xs text-red-400 mt-0.5">{errors[`amount-${index}`]}</p>
                    )}
                  </div>

                  {/* Token Type */}
                  <div className="sm:col-span-2">
                    <select
                      value={row.tokenType}
                      onChange={(e) => updateRow(row.id, 'tokenType', e.target.value)}
                      className="input w-full text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="shares">Shares</option>
                      <option value="loot">Loot</option>
                    </select>
                  </div>

                  {/* Action */}
                  <div className="sm:col-span-2">
                    <select
                      value={row.action}
                      onChange={(e) => updateRow(row.id, 'action', e.target.value)}
                      className="input w-full text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="mint">Mint</option>
                      <option value="burn">Burn</option>
                    </select>
                  </div>

                  {/* Remove button */}
                  <div className="sm:col-span-1 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-dao-text-hint hover:text-red-400 transition-colors disabled:opacity-30"
                      disabled={rows.length <= 1 || isSubmitting}
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
      </ProposalActionSection>

      {/* Proposal Settings */}
      <ProposalSettingsFields
        expiration={expiration}
        onExpirationChange={setExpiration}
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
          disabled={!title.trim() || rows.some((r) => !r.address || !r.amount)}
        >
          Submit Membership Proposal
        </Button>
      </div>
    </form>
  )
}
