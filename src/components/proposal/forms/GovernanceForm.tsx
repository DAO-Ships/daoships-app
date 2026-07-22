import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'
import { formatDuration, parseDurationToSeconds, formatDurationInput } from '@/utils/time'
import { formatTokenAmount, parseTokenAmount, bpsToPercent } from '@/utils/format'
import { daoService } from '@/services/DaoService'
import { MAX_VOTING_PERIOD, MAX_GRACE_PERIOD } from '@/services/utils/GovernanceEncoder'
import type { DaoConfig } from '@/types'

/** An active, sanctioned TimelockNavigator that config changes should route through. */
export interface ActiveTimelock {
  address: string
  delaySeconds: number
  /** Window (seconds) after the delay during which the queued change must be executed. */
  executionWindowSeconds: number
}

// ═══════════════════════════════════════════════════════════════════════════
// GovernanceForm - Update governance configuration proposal form
// ═══════════════════════════════════════════════════════════════════════════

interface GovernanceFormData {
  title: string
  description: string
  offering: string
  expiration: string
  discussionUrl: string
  votingPeriod: number
  gracePeriod: number
  quorumPercent: number
  proposalOffering: string
  sponsorThreshold: string
  minRetentionPercent: number
  defaultExpiryWindow: number
}

interface GovernanceFormProps {
  daoId: string
  currentConfig?: DaoConfig
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: GovernanceFormData) => void
  isSubmitting?: boolean
  /** If set, every config change from this form is queued through the timelock — no bypass. */
  activeTimelock?: ActiveTimelock | null
}

export function GovernanceForm({
  daoId,
  currentConfig,
  minOfferingDisplay,
  canSelfSponsor = false,
  onSubmit,
  isSubmitting = false,
  activeTimelock = null,
}: GovernanceFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [votingPeriodInput, setVotingPeriodInput] = useState('')
  const [gracePeriodInput, setGracePeriodInput] = useState('')
  const [quorumPercent, setQuorumPercent] = useState('')
  const [proposalOffering, setProposalOffering] = useState('')
  const [sponsorThreshold, setSponsorThreshold] = useState('')
  const [minRetentionPercent, setMinRetentionPercent] = useState('')
  const [defaultExpiryWindowInput, setDefaultExpiryWindowInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Exact on-chain values as prefilled. Submitted verbatim for any field the user did
  // not edit, so a governance change can never silently rewrite an untouched parameter
  // through a display round-trip. null until the config loads.
  const pristineOfferingRef = useRef<bigint | null>(null)
  const pristineThresholdRef = useRef<bigint | null>(null)
  const [offeringEdited, setOfferingEdited] = useState(false)
  const [thresholdEdited, setThresholdEdited] = useState(false)

  // Pre-fill from current config — use shorthand duration format (3d, 1h) so
  // users see the same input style they used in the launch wizard.
  useEffect(() => {
    if (currentConfig) {
      setVotingPeriodInput(formatDurationInput(currentConfig.voting_period))
      setGracePeriodInput(formatDurationInput(currentConfig.grace_period))
      setQuorumPercent(String(bpsToPercent(currentConfig.quorum_percent)))
      // FULL precision (maxDecimals 18), not 4. formatTokenAmount truncates, and the
      // truncated DISPLAY STRING is what gets re-encoded on submit — while
      // setGovernanceConfig rewrites all seven fields whether or not they were touched.
      // At 4dp, an offering of 5e13 wei rendered as the literal string "0.", which
      // parseTokenAmount maps to 0n: a member extending the voting period silently
      // zeroed the DAO's anti-spam proposal offering. Trailing zeros are still trimmed,
      // so 1e18 still displays as "1".
      const offeringWei = BigInt(currentConfig.proposal_offering || '0')
      const thresholdWei = BigInt(currentConfig.sponsor_threshold || '0')
      pristineOfferingRef.current = offeringWei
      pristineThresholdRef.current = thresholdWei
      setProposalOffering(formatTokenAmount(offeringWei, 18, 18, 0))
      setSponsorThreshold(formatTokenAmount(thresholdWei, 18, 18, 0))
      setMinRetentionPercent(String(bpsToPercent(currentConfig.min_retention_percent)))
      setDefaultExpiryWindowInput(formatDurationInput(currentConfig.default_expiry_window || 0))
    }
  }, [currentConfig])

  // Defense-in-depth: if the indexer value is 0, read from the contract directly.
  // This covers DAOs launched before the indexer started capturing defaultExpiryWindow
  // from SetupComplete, and also handles brief indexer lag after launch.
  useEffect(() => {
    if (!daoId) return
    if (currentConfig?.default_expiry_window && currentConfig.default_expiry_window > 0) return
    let cancelled = false
    daoService.getDefaultExpiryWindow(daoId)
      .then((seconds) => {
        if (cancelled) return
        if (seconds > 0) {
          setDefaultExpiryWindowInput(formatDurationInput(seconds))
        }
      })
      .catch((err) => console.warn('[GovernanceForm] on-chain defaultExpiryWindow read failed:', err))
    return () => { cancelled = true }
  }, [daoId, currentConfig?.default_expiry_window])

  const votingPeriodSeconds = parseDurationToSeconds(votingPeriodInput)
  const gracePeriodSeconds = parseDurationToSeconds(gracePeriodInput)
  const defaultExpiryWindowSeconds = parseDurationToSeconds(defaultExpiryWindowInput)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) newErrors.title = 'Title is required'

    if (votingPeriodSeconds !== null && votingPeriodSeconds > MAX_VOTING_PERIOD) {
      // Contract-enforced ceiling; exceeding it reverts at processProposal AFTER a full
      // voting+grace cycle, burning the offering.
      newErrors.votingPeriod = 'Voting period cannot exceed 365 days (contract maximum)'
    } else if (votingPeriodSeconds === null || votingPeriodSeconds < 60) {
      newErrors.votingPeriod = 'Voting period must be at least 60 seconds (contract minimum)'
    }
    if (gracePeriodSeconds !== null && gracePeriodSeconds > MAX_GRACE_PERIOD) {
      newErrors.gracePeriod = 'Grace period cannot exceed 365 days (contract maximum)'
    } else if (gracePeriodSeconds === null || gracePeriodSeconds < 0) {
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
        expiration,
        discussionUrl,
        votingPeriod: votingPeriodSeconds!,
        gracePeriod: gracePeriodSeconds!,
        quorumPercent: Math.round(parseFloat(quorumPercent) * 100),
        proposalOffering: (!offeringEdited && pristineOfferingRef.current !== null
          ? pristineOfferingRef.current
          : parseTokenAmount(proposalOffering || '0')).toString(),
        sponsorThreshold: (!thresholdEdited && pristineThresholdRef.current !== null
          ? pristineThresholdRef.current
          : parseTokenAmount(sponsorThreshold || '1')).toString(),
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
          maxLength={120}
          disabled={isSubmitting}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
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
          className="input w-full min-h-[60px] resize-y"
          maxLength={2000}
          disabled={isSubmitting}
          rows={2}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
      </div>

      {/* Discussion Link */}
      <div>
        <label htmlFor="governance-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Discussion Link
        </label>
        <input
          id="governance-discussion-url"
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

      <ProposalActionSection title="Governance Parameters">
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
            <p className="text-xs text-amber-400 mt-1">
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
                  setOfferingEdited(true)
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
                  setThresholdEdited(true)
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
      </ProposalActionSection>

      {/* Proposal Settings */}
      <ProposalSettingsFields
        expiration={expiration}
        onExpirationChange={setExpiration}
        disabled={isSubmitting}
        minProcessableSeconds={
          currentConfig ? currentConfig.voting_period + currentConfig.grace_period : undefined
        }
      />

      {/* Tribute */}
      <OfferingField
        value={offering}
        onChange={setOffering}
        minOfferingDisplay={minOfferingDisplay}
        canSelfSponsor={canSelfSponsor}
        disabled={isSubmitting}
      />

      {/* Timelock routing notice — when a timelock is active, every config change is queued
          through it (no bypass). Spell out the full two-phase lifecycle so proposers/voters know
          the change does NOT land when the proposal passes — there's a second execution step. */}
      {activeTimelock && (
        <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-4 py-3 space-y-2">
          <p className="text-sm text-accent-400 font-medium">Routed through the timelock — two steps</p>
          <p className="text-xs text-dao-text-muted">
            This DAO has an active timelock, so this change takes effect in two phases (it does
            <strong> not</strong> apply the moment the proposal passes):
          </p>
          <ol className="text-xs text-dao-text-muted list-decimal pl-4 space-y-1">
            <li>
              <strong>Proposal</strong> — vote, grace, then anyone processes it before it expires.
              Processing <strong>queues</strong> the change (it does not apply it).
            </li>
            <li>
              <strong>Timelock</strong> — the queued change becomes executable after a{' '}
              <strong>{formatDuration(activeTimelock.delaySeconds)}</strong> delay (a second window for
              members to ragequit), then anyone must <strong>execute</strong> it
              {activeTimelock.executionWindowSeconds > 0
                ? <> within <strong>{formatDuration(activeTimelock.executionWindowSeconds)}</strong></>
                : ' within the execution window'}{' '}
              from the timelock navigator’s page, or it expires and must be re-proposed.
            </li>
          </ol>
          <p className="text-xs text-dao-text-hint">
            Set the proposal expiration to comfortably cover voting + grace — it’s independent of the
            timelock delay, which only starts after the proposal is processed.
          </p>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!title.trim()}
        >
          {activeTimelock ? 'Submit (Queue via Timelock)' : 'Submit Governance Proposal'}
        </Button>
      </div>
    </form>
  )
}
