import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'
import { formatTokenAmount } from '@/utils/format'
import { isAddress } from '@/services/utils/AddressUtils'

// ═══════════════════════════════════════════════════════════════════════════
// FundingForm - Transfer tokens from treasury proposal form
// ═══════════════════════════════════════════════════════════════════════════

export interface VaultTokenOption {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: bigint
  isNative: boolean
}

interface FundingFormData {
  title: string
  description: string
  recipient: string
  tokenAddress: string
  amount: string
  offering: string
  expiration: string
  discussionUrl: string
}

interface FundingFormProps {
  daoId: string
  vaultTokens: VaultTokenOption[]
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: FundingFormData) => void
  isSubmitting?: boolean
}


export function FundingForm({ daoId: _daoId, vaultTokens, minOfferingDisplay, canSelfSponsor = false, onSubmit, isSubmitting = false }: FundingFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [recipient, setRecipient] = useState('')
  const [tokenAddress, setTokenAddress] = useState(vaultTokens[0]?.address || '')
  const [amount, setAmount] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  const selectedToken = vaultTokens.find((t) => t.address === tokenAddress)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }
    if (!isAddress(recipient)) {
      newErrors.recipient = 'Must be a valid 42-character hex address'
    }
    if (!tokenAddress) {
      newErrors.tokenAddress = 'Select a token'
    }
    if (!amount || Number(amount) <= 0) {
      newErrors.amount = 'Amount must be greater than zero'
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
        recipient,
        tokenAddress,
        amount,
        offering,
        expiration,
        discussionUrl,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="funding-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Title
        </label>
        <input
          id="funding-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Funding proposal title"
          className="input w-full"
          maxLength={120}
          disabled={isSubmitting}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
        {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="funding-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="funding-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the purpose of this funding request..."
          className="input w-full min-h-[60px] resize-y"
          maxLength={2000}
          disabled={isSubmitting}
          rows={2}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
      </div>

      {/* Discussion Link */}
      <div>
        <label htmlFor="funding-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Discussion Link
        </label>
        <input
          id="funding-discussion-url"
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

      <ProposalActionSection title="Transfer Details">
        {/* Recipient */}
        <div>
          <label htmlFor="funding-recipient" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Recipient Address
          </label>
          <input
            id="funding-recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="input w-full font-mono"
            disabled={isSubmitting}
          />
          {errors.recipient && <p className="text-xs text-red-400 mt-1">{errors.recipient}</p>}
        </div>

        {/* Token Select */}
        <div>
          <label htmlFor="funding-token" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Token
          </label>
          <select
            id="funding-token"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            className="input w-full"
            disabled={isSubmitting}
          >
            {vaultTokens.length === 0 && (
              <option value="">No tokens available</option>
            )}
            {vaultTokens.map((token) => (
              <option key={token.address} value={token.address}>
                {token.name}{token.symbol !== token.name ? ` (${token.symbol})` : ''} — {formatTokenAmount(token.balance, token.decimals, 4, 2)} available
              </option>
            ))}
          </select>
          {errors.tokenAddress && <p className="text-xs text-red-400 mt-1">{errors.tokenAddress}</p>}
          {selectedToken && selectedToken.balance === 0n && (
            <p className="text-xs text-amber-400 mt-1">
              The vault has no balance of this token.
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="funding-amount" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Amount
          </label>
          <input
            id="funding-amount"
            type="text"
            value={amount}
            onChange={(e) => {
              const val = e.target.value
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                setAmount(val)
              }
            }}
            placeholder="0.0"
            className="input w-full font-mono"
            disabled={isSubmitting}
          />
          {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
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
          disabled={!title.trim() || !recipient || !amount}
        >
          Submit Funding Proposal
        </Button>
      </div>
    </form>
  )
}
