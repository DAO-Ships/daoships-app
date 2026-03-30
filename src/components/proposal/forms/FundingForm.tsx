import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { formatTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// FundingForm - Transfer tokens from treasury proposal form
// ═══════════════════════════════════════════════════════════════════════════

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
  rationale: string
}

interface FundingFormProps {
  daoId: string
  vaultTokens: VaultTokenOption[]
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: FundingFormData) => void
  isSubmitting?: boolean
}

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/

export function FundingForm({ daoId: _daoId, vaultTokens, minOfferingDisplay, canSelfSponsor = false, onSubmit, isSubmitting = false }: FundingFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [recipient, setRecipient] = useState('')
  const [tokenAddress, setTokenAddress] = useState(vaultTokens[0]?.address || '')
  const [amount, setAmount] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [rationale, setRationale] = useState('')
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  const selectedToken = vaultTokens.find((t) => t.address === tokenAddress)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }
    if (!ADDRESS_REGEX.test(recipient)) {
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
        rationale,
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
          maxLength={240}
          disabled={isSubmitting}
        />
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
          className="input w-full min-h-[100px] resize-y"
          maxLength={5000}
          disabled={isSubmitting}
          rows={4}
        />
      </div>

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
          <p className="text-xs text-yellow-400 mt-1">
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

      {/* Proposal Settings (expiration + rationale) */}
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
          disabled={!title.trim() || !recipient || !amount}
        >
          Submit Funding Proposal
        </Button>
      </div>
    </form>
  )
}
