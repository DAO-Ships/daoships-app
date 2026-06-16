import type { DaoConfig } from '@/types'
import { formatDuration } from '@/utils/time'
import { formatTokenAmount, bpsToPercent } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// GovernanceConfig - Display governance parameters with human-readable values
// ═══════════════════════════════════════════════════════════════════════════

interface GovernanceConfigProps {
  config: DaoConfig
}

interface ConfigRow {
  label: string
  value: string
  description: string
}

export function GovernanceConfig({ config }: GovernanceConfigProps) {
  const rows: ConfigRow[] = [
    {
      label: 'Voting Period',
      value: formatDuration(Number(config.voting_period)),
      description: 'How long members can vote on proposals',
    },
    {
      label: 'Grace Period',
      value: formatDuration(Number(config.grace_period)),
      description: 'Delay after voting before a proposal can be processed',
    },
    {
      label: 'Quorum %',
      value: `${bpsToPercent(config.quorum_percent).toFixed(1)}%`,
      description: 'Minimum percentage of shares that must vote yes',
    },
    {
      label: 'Proposal Offering',
      value: formatTokenAmount(BigInt(config.proposal_offering || '0')),
      description: 'Token tribute required to submit a proposal',
    },
    {
      label: 'Sponsor Threshold',
      value: formatTokenAmount(BigInt(config.sponsor_threshold || '0')),
      description: 'Minimum shares a member needs to sponsor a proposal',
    },
    {
      label: 'Min Retention %',
      value: `${bpsToPercent(config.min_retention_percent).toFixed(1)}%`,
      description: 'Minimum member retention required for a proposal to pass',
    },
    {
      label: 'Default Expiry Window',
      value: Number(config.default_expiry_window) > 0
        ? formatDuration(Number(config.default_expiry_window))
        : '2x(voting+grace) fallback',
      description: 'Default time window for proposal expiry. 0 uses 2x(voting+grace) as fallback.',
    },
  ]

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-dao-border">
        <h3 className="text-lg font-semibold text-dao-text">Governance Configuration</h3>
      </div>
      <div className="divide-y divide-dao-border">
        {rows.map((row) => (
          <div key={row.label} className="px-6 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-dao-text-secondary">{row.label}</p>
              <p className="text-xs text-dao-text-hint mt-0.5">{row.description}</p>
            </div>
            <span className="text-sm font-mono text-accent-400 whitespace-nowrap flex-shrink-0">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
