import type { Control, FieldErrors } from 'react-hook-form'
import { useController } from 'react-hook-form'
import { formatDuration, parseDurationToSeconds } from '@/utils/time'
import { MAX_VOTING_PERIOD, MAX_GRACE_PERIOD } from '@/services/utils/GovernanceEncoder'
import type { LaunchFormValues } from './BasicInfoStep'

// ═══════════════════════════════════════════════════════════════════════════
// GovernanceStep - Step 3: Governance parameter configuration
// ═══════════════════════════════════════════════════════════════════════════

interface GovernanceStepProps {
  control: Control<LaunchFormValues>
  errors: FieldErrors<LaunchFormValues>
}

export function GovernanceStep({ control, errors }: GovernanceStepProps) {
  const votingPeriod = useController({
    control,
    name: 'votingPeriodInput',
    rules: {
      required: 'Voting period is required',
      validate: (value) => {
        const secs = parseDurationToSeconds(value)
        if (secs === null) return 'Enter a valid duration (e.g. "3 days", "12 hours", or seconds)'
        if (secs < 60) return 'Voting period must be at least 60 seconds (contract minimum)'
        if (secs > MAX_VOTING_PERIOD) return 'Voting period cannot exceed 365 days (contract maximum)'
        return true
      },
    },
  })
  const gracePeriod = useController({
    control,
    name: 'gracePeriodInput',
    rules: {
      required: 'Grace period is required',
      validate: (value) => {
        const secs = parseDurationToSeconds(value)
        if (secs === null) return 'Enter a valid duration (e.g. "1 day", "12 hours", or seconds)'
        if (secs < 0) return 'Grace period cannot be negative'
        if (secs > MAX_GRACE_PERIOD) return 'Grace period cannot exceed 365 days (contract maximum)'
        return true
      },
    },
  })
  const quorumPercent = useController({
    control,
    name: 'quorumPercent',
    rules: {
      validate: (value) => {
        const num = parseFloat(value || '0')
        if (isNaN(num) || num < 0 || num > 100) return 'Quorum must be between 0 and 100'
        return true
      },
    },
  })
  const proposalOffering = useController({ control, name: 'proposalOffering' })
  const sponsorThreshold = useController({ control, name: 'sponsorThreshold' })
  const minRetentionPercent = useController({
    control,
    name: 'minRetentionPercent',
    rules: {
      validate: (value) => {
        const num = parseFloat(value || '0')
        if (isNaN(num) || num < 0 || num > 100) return 'Min retention must be between 0 and 100'
        return true
      },
    },
  })
  const defaultExpiryWindow = useController({
    control,
    name: 'defaultExpiryWindow',
    rules: {
      validate: (value) => {
        if (!value || value.trim() === '' || value.trim() === '0') return true
        const secs = parseDurationToSeconds(value)
        if (secs === null) return 'Enter a valid duration (e.g. "7 days", "12 hours", or seconds)'
        if (secs < 0) return 'Expiry window cannot be negative'
        return true
      },
    },
  })

  const votingSecs = parseDurationToSeconds(votingPeriod.field.value || '')
  const graceSecs = parseDurationToSeconds(gracePeriod.field.value || '')
  const expirySecs = parseDurationToSeconds(defaultExpiryWindow.field.value || '0')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-dao-text mb-1">Governance Configuration</h2>
        <p className="text-sm text-dao-text-muted">
          Define the rules for proposals, voting, and decision-making.
          Duration inputs accept values like "3 days", "12 hours", or plain seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Voting Period */}
        <div>
          <label htmlFor="gov-voting-period" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Voting Period <span className="text-red-400">*</span>
          </label>
          <input
            id="gov-voting-period"
            type="text"
            {...votingPeriod.field}
            placeholder='e.g. "3 days" or "259200"'
            className="input w-full"
          />
          {votingSecs !== null && votingSecs > 0 && (
            <p className="text-xs text-accent-400 mt-1">{formatDuration(votingSecs)}</p>
          )}
          <p className="text-xs text-dao-text-hint mt-1">Minimum: 60 seconds (contract enforced)</p>
          {errors.votingPeriodInput && (
            <p className="text-xs text-red-400 mt-1">{errors.votingPeriodInput.message}</p>
          )}
        </div>

        {/* Grace Period */}
        <div>
          <label htmlFor="gov-grace-period" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Grace Period
          </label>
          <input
            id="gov-grace-period"
            type="text"
            {...gracePeriod.field}
            placeholder='e.g. "1 day" or "86400"'
            className="input w-full"
          />
          {graceSecs !== null && graceSecs > 0 && (
            <p className="text-xs text-accent-400 mt-1">{formatDuration(graceSecs)}</p>
          )}
          {graceSecs === 0 && (
            <p className="text-xs text-amber-400 mt-1">
              Warning: A grace period of 0 means members cannot ragequit before proposals are processed.
            </p>
          )}
          {errors.gracePeriodInput && (
            <p className="text-xs text-red-400 mt-1">{errors.gracePeriodInput.message}</p>
          )}
        </div>

        {/* Quorum Percent */}
        <div>
          <label htmlFor="gov-quorum-pct" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Quorum %
          </label>
          <div className="relative">
            <input
              id="gov-quorum-pct"
              type="text"
              {...quorumPercent.field}
              placeholder="0"
              className="input w-full pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">%</span>
          </div>
          <p className="text-xs text-dao-text-hint mt-1">
            Minimum yes-vote percentage of total shares to pass (0-100)
          </p>
          {errors.quorumPercent && (
            <p className="text-xs text-red-400 mt-1">{errors.quorumPercent.message}</p>
          )}
        </div>

        {/* Min Retention Percent */}
        <div>
          <label htmlFor="gov-retention-pct" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Min Retention %
          </label>
          <div className="relative">
            <input
              id="gov-retention-pct"
              type="text"
              {...minRetentionPercent.field}
              placeholder="0"
              className="input w-full pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">%</span>
          </div>
          <p className="text-xs text-dao-text-hint mt-1">
            Minimum member retention required for proposals (0-100)
          </p>
          {errors.minRetentionPercent && (
            <p className="text-xs text-red-400 mt-1">{errors.minRetentionPercent.message}</p>
          )}
        </div>

        {/* Default Expiry Window */}
        <div>
          <label htmlFor="gov-expiry-window" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Default Expiry Window
          </label>
          <input
            id="gov-expiry-window"
            type="text"
            {...defaultExpiryWindow.field}
            placeholder='0 (uses 2x fallback)'
            className="input w-full"
          />
          {expirySecs !== null && expirySecs > 0 && (
            <p className="text-xs text-accent-400 mt-1">{formatDuration(expirySecs)}</p>
          )}
          <p className="text-xs text-dao-text-hint mt-1">
            Default proposal expiry window in seconds. 0 = 2x(voting+grace) fallback
          </p>
          {errors.defaultExpiryWindow && (
            <p className="text-xs text-red-400 mt-1">{errors.defaultExpiryWindow.message}</p>
          )}
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
              {...proposalOffering.field}
              placeholder="0"
              className="input w-full pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">QUAI</span>
          </div>
          <p className="text-xs text-dao-text-hint mt-1">QUAI required to submit a proposal</p>
        </div>

        {/* Sponsor Threshold */}
        <div>
          <label htmlFor="gov-sponsor-thresh" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Sponsor Threshold
          </label>
          <div className="relative">
            <input
              id="gov-sponsor-thresh"
              type="text"
              {...sponsorThreshold.field}
              placeholder="1"
              className="input w-full pr-20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dao-text-hint text-sm">Shares</span>
          </div>
          <p className="text-xs text-dao-text-hint mt-1">Minimum shares needed to sponsor a proposal</p>
        </div>
      </div>
    </div>
  )
}
