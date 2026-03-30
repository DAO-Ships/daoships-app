import { useState, useEffect } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { formatDuration, parseDurationToSeconds } from '@/utils/time'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import type { DaoConfig } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// GovernanceForm - Update governance configuration proposal form
// ═══════════════════════════════════════════════════════════════════════════

interface GovernanceFormData {
  title: string
  description: string
  offering: string
  votingPeriod: number
  gracePeriod: number
  quorumPercent: number
  proposalOffering: string
  sponsorThreshold: string
  minRetentionPercent: number
  defaultExpiryWindow: number
}

interface GovernanceFormProps {
  currentConfig?: DaoConfig
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: GovernanceFormData) => void
  isSubmitting?: boolean
}

export function GovernanceForm({
  currentConfig,
  minOfferingDisplay,
  canSelfSponsor = false,
  onSubmit,
  isSubmitting = false,
}: GovernanceFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [rationale, setRationale] = useState('')
  const [votingPeriodInput, setVotingPeriodInput] = useState('')
  const [gracePeriodInput, setGracePeriodInput] = useState('')
  const [quorumPercent, setQuorumPercent] = useState('')
  const [proposalOffering, setProposalOffering] = useState('')
  const [sponsorThreshold, setSponsorThreshold] = useState('')
  const [minRetentionPercent, setMinRetentionPercent] = useState('')
  const [defaultExpiryWindowInput, setDefaultExpiryWindowInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Pre-fill from current config
  useEffect(() => {
    if (currentConfig) {
      setVotingPeriodInput(String(currentConfig.voting_period))
      setGracePeriodInput(String(currentConfig.grace_period))
      setQuorumPercent(String(Number(currentConfig.quorum_percent) / 100))
      setProposalOffering(formatTokenAmount(BigInt(currentConfig.proposal_offering || '0'), 18, 4, 0))
      setSponsorThreshold(formatTokenAmount(BigInt(currentConfig.sponsor_threshold || '0'), 18, 4, 0))
      setMinRetentionPercent(String(Number(currentConfig.min_retention_percent) / 100))
      setDefaultExpiryWindowInput(String(currentConfig.default_expiry_window || 0))
    }
  }, [currentConfig])

  const votingPeriodSeconds = parseDurationToSeconds(votingPeriodInput)
  const gracePeriodSeconds = parseDurationToSeconds(gracePeriodInput)
  const defaultExpiryWindowSeconds = parseDurationToSeconds(defaultExpiryWindowInput)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) newErrors.title = 'Title is required'

    if (votingPeriodSeconds === null || votingPeriodSeconds < 60) {
      newErrors.votingPeriod = 'Voting period must be at least 60 seconds (contract minimum)'
    }
    if (gracePeriodSeconds === null || gracePeriodSeconds < 0) {
      newErrors.gracePeriod = 'Grace period cannot be negative'
    }

    const qp = parseFloat(quorumPercent)
    if (isNaN(qp) || qp < 0 || qp > 100) {
      newErrors.quorumPercent = 'Quorum must be between 0 and 100'
    }

    const mrp = parseFloat(minRetentionPercent)
    if (isNaN(mrp) || mrp < 0 || mrp > 100) {
      newErrors.minRetentionPercent = 'Min retention must be between 0 and 100'
    }

    if (defaultExpiryWindowInput.trim() && defaultExpiryWindowInput.trim() !== '0') {
      if (defaultExpiryWindowSeconds === null || defaultExpiryWindowSeconds < 0) {
        newErrors.defaultExpiryWindow = 'Enter a valid duration (e.g. "7 days", "12 hours", or seconds)'
      }
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
        offering,
        votingPeriod: votingPeriodSeconds!,
        gracePeriod: gracePeriodSeconds!,
        quorumPercent: Math.round(parseFloat(quorumPercent) * 100),
        proposalOffering: parseTokenAmount(proposalOffering || '0').toString(),
        sponsorThreshold: parseTokenAmount(sponsorThreshold || '1').toString(),
        minRetentionPercent: Math.round(parseFloat(minRetentionPercent) * 100),
        defaultExpiryWindow: defaultExpiryWindowSeconds || 0,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="gov-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Title
        </label>
        <input
          id="gov-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Governance update proposal title"
          className="input w-full"
          maxLength={240}
          disabled={isSubmitting}
        />
        {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="gov-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="gov-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain why these governance parameters should change..."
          className="input w-full min-h-[80px] resize-y"
          maxLength={5000}
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      {/* Governance parameters grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Voting Period */}
        <div>
          <label htmlFor="gov-voting" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Voting Period
          </label>
          <input
            id="gov-voting"
            type="text"
            value={votingPeriodInput}
            onChange={(e) => setVotingPeriodInput(e.target.value)}
            placeholder='e.g. "3 days" or "86400"'
            className="input w-full"
            disabled={isSubmitting}
          />
          {votingPeriodSeconds !== null && (
            <p className="text-xs text-dao-text-hint mt-1">{formatDuration(votingPeriodSeconds)}</p>
          )}
          {errors.votingPeriod && <p className="text-xs text-red-400 mt-1">{errors.votingPeriod}</p>}
        </div>

        {/* Grace Period */}
        <div>
          <label htmlFor="gov-grace" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Grace Period
          </label>
          <input
            id="gov-grace"
            type="text"
            value={gracePeriodInput}
            onChange={(e) => setGracePeriodInput(e.target.value)}
            placeholder='e.g. "1 day" or "43200"'
            className="input w-full"
            disabled={isSubmitting}
          />
          {gracePeriodSeconds !== null && gracePeriodSeconds > 0 && (
            <p className="text-xs text-dao-text-hint mt-1">{formatDuration(gracePeriodSeconds)}</p>
          )}
          {gracePeriodSeconds === 0 && (
            <p className="text-xs text-yellow-400 mt-1">
              Warning: A grace period of 0 means members cannot ragequit before proposals are processed.
            </p>
          )}
          {errors.gracePeriod && <p className="text-xs text-red-400 mt-1">{errors.gracePeriod}</p>}
        </div>

        {/* Quorum Percent */}
        <div>
          <label htmlFor="gov-quorum" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Quorum %
          </label>
          <div className="relative">
            <input
              id="gov-quorum"
              type="text"
              value={quorumPercent}
              onChange={(e) => {
                if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                  setQuorumPercent(e.target.value)
                }
              }}
              placeholder="0"
              className="input w-full pr-8"
              disabled={isSubmitting}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">%</span>
          </div>
          {errors.quorumPercent && <p className="text-xs text-red-400 mt-1">{errors.quorumPercent}</p>}
        </div>

        {/* Min Retention Percent */}
        <div>
          <label htmlFor="gov-retention" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Min Retention %
          </label>
          <div className="relative">
            <input
              id="gov-retention"
              type="text"
              value={minRetentionPercent}
              onChange={(e) => {
                if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                  setMinRetentionPercent(e.target.value)
                }
              }}
              placeholder="0"
              className="input w-full pr-8"
              disabled={isSubmitting}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">%</span>
          </div>
          {errors.minRetentionPercent && <p className="text-xs text-red-400 mt-1">{errors.minRetentionPercent}</p>}
        </div>

        {/* Proposal Offering */}
        <div>
          <label htmlFor="gov-offering" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Proposal Offering
          </label>
          <div className="relative">
            <input
              id="gov-offering"
              type="text"
              value={proposalOffering}
              onChange={(e) => {
                if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                  setProposalOffering(e.target.value)
                }
              }}
              placeholder="0"
              className="input w-full pr-16"
              disabled={isSubmitting}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">QUAI</span>
          </div>
          <p className="text-xs text-dao-text-hint mt-1">QUAI required to submit a proposal</p>
        </div>

        {/* Sponsor Threshold */}
        <div>
          <label htmlFor="gov-sponsor" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Sponsor Threshold
          </label>
          <div className="relative">
            <input
              id="gov-sponsor"
              type="text"
              value={sponsorThreshold}
              onChange={(e) => {
                if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                  setSponsorThreshold(e.target.value)
                }
              }}
              placeholder="1"
              className="input w-full pr-20"
              disabled={isSubmitting}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">Shares</span>
          </div>
          <p className="text-xs text-dao-text-hint mt-1">Minimum shares needed to sponsor a proposal</p>
        </div>

        {/* Default Expiry Window */}
        <div className="sm:col-span-2">
          <label htmlFor="gov-expiry" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Default Expiry Window
          </label>
          <input
            id="gov-expiry"
            type="text"
            value={defaultExpiryWindowInput}
            onChange={(e) => setDefaultExpiryWindowInput(e.target.value)}
            placeholder='0 (uses 2x fallback)'
            className="input w-full"
            disabled={isSubmitting}
          />
          {defaultExpiryWindowSeconds !== null && defaultExpiryWindowSeconds > 0 && (
            <p className="text-xs text-dao-text-hint mt-1">{formatDuration(defaultExpiryWindowSeconds)}</p>
          )}
          <p className="text-xs text-dao-text-hint mt-1">
            Default proposal expiry window. 0 = 2x(voting+grace) fallback
          </p>
          {errors.defaultExpiryWindow && <p className="text-xs text-red-400 mt-1">{errors.defaultExpiryWindow}</p>}
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
          disabled={!title.trim()}
        >
          Submit Governance Proposal
        </Button>
      </div>
    </form>
  )
}
