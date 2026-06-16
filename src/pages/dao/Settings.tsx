import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import type { Dao } from '@/types'
import { extractDaoConfig } from '@/types/dao'
import { Card } from '@/components/common/Card'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TimelockBypassWarning } from '@/components/dao/TimelockBypassWarning'
import { formatDuration } from '@/utils/time'
import { formatTokenAmount, bpsToPercent } from '@/utils/format'
import { NETWORK_CONFIG } from '@/config/contracts'
import { safeBigInt } from '@/utils/bigint'
import { daoService } from '@/services/DaoService'

// ═══════════════════════════════════════════════════════════════════════════
// Settings - Read-only governance configuration display
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

interface ConfigRow {
  label: string
  value: string
  description: string
}

export function Settings() {
  const { dao } = useOutletContext<DaoContext>()
  usePageTitle('Settings', dao.name)
  const config = extractDaoConfig(dao)

  // Defense-in-depth: if the indexed value is 0, read from the contract directly.
  // Covers DAOs launched before the indexer fix and brief post-launch indexer lag.
  const [onChainExpiryWindow, setOnChainExpiryWindow] = useState<number | null>(null)
  useEffect(() => {
    if (!dao.id) return
    if (config.default_expiry_window > 0) return
    let cancelled = false
    daoService.getDefaultExpiryWindow(dao.id)
      .then((seconds) => { if (!cancelled && seconds > 0) setOnChainExpiryWindow(seconds) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dao.id, config.default_expiry_window])
  const effectiveExpiryWindow = config.default_expiry_window > 0
    ? Number(config.default_expiry_window)
    : (onChainExpiryWindow ?? 0)

  const configRows: ConfigRow[] = [
    {
      label: 'Voting Period',
      value: formatDuration(Number(config.voting_period)),
      description:
        'The duration members have to vote on a proposal after it is sponsored.',
    },
    {
      label: 'Grace Period',
      value: formatDuration(Number(config.grace_period)),
      description:
        'The window after voting ends where members can ragequit before the proposal is processed.',
    },
    {
      label: 'Proposal Offering',
      value: `${formatTokenAmount(safeBigInt(config.proposal_offering))} QUAI`,
      description:
        'The amount of native tokens that must be sent when submitting a proposal (anti-spam).',
    },
    {
      label: 'Quorum Percent',
      value: `${bpsToPercent(config.quorum_percent).toFixed(1)}%`,
      description:
        'The minimum percentage of total shares that must vote "yes" for a proposal to pass.',
    },
    {
      label: 'Sponsor Threshold',
      value: formatTokenAmount(safeBigInt(config.sponsor_threshold)),
      description:
        'The minimum number of shares a member must hold to sponsor a proposal.',
    },
    {
      label: 'Min Retention Percent',
      value: `${bpsToPercent(config.min_retention_percent).toFixed(1)}%`,
      description:
        'The minimum percentage of shares that must remain after ragequit for a proposal to be processable.',
    },
    {
      label: 'Default Expiry Window',
      value: effectiveExpiryWindow > 0
        ? formatDuration(effectiveExpiryWindow)
        : '2x(voting+grace) fallback',
      description:
        'The default time window after which unsponsored proposals expire. 0 uses 2x(voting+grace) as fallback.',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-hint">
        <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
          {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
        </Link>
        <span>/</span>
        <span className="text-dao-text-secondary">Settings</span>
      </nav>

      <h1 className="text-2xl font-bold font-display text-dao-text">Settings</h1>

      {/* Timelock bypass trust signal (only renders if a change skipped the timelock) */}
      <TimelockBypassWarning daoId={dao.id} />

      {/* Governance configuration */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Governance Configuration</h2>}>
        <div className="space-y-6">
          {configRows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-dao-text-secondary">{row.label}</span>
                <span className="text-sm font-mono text-dao-text">{row.value}</span>
              </div>
              <p className="text-xs text-dao-text-hint">{row.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Contract addresses */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Contract Addresses</h2>}>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-dao-text-hint">DAOShip (DAO)</span>
            <AddressDisplay address={dao.id} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dao-text-hint">Safe (Treasury)</span>
            <a
              href={`${NETWORK_CONFIG.quaiVaultUrl}/wallet/${dao.avatar}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              <AddressDisplay address={dao.avatar} />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dao-text-hint">Shares Token</span>
            <AddressDisplay address={dao.shares_address} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dao-text-hint">Loot Token</span>
            <AddressDisplay address={dao.loot_address} />
          </div>
        </div>
      </Card>

      {/* Token configuration */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Token Configuration</h2>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="text-dao-text-secondary font-medium mb-2">Share Token</h3>
            <div className="space-y-1 text-dao-text-muted">
              <p>Name: <span className="text-dao-text-secondary">{dao.share_token_name || 'N/A'}</span></p>
              <p>Symbol: <span className="text-dao-text-secondary">{dao.share_token_symbol || 'N/A'}</span></p>
              <p>
                Transfers:{' '}
                <span className={dao.shares_paused ? 'text-red-400' : 'text-emerald-400'}>
                  {dao.shares_paused ? 'Paused' : 'Enabled'}
                </span>
              </p>
            </div>
          </div>
          <div>
            <h3 className="text-dao-text-secondary font-medium mb-2">Loot Token</h3>
            <div className="space-y-1 text-dao-text-muted">
              <p>Name: <span className="text-dao-text-secondary">{dao.loot_token_name || 'N/A'}</span></p>
              <p>Symbol: <span className="text-dao-text-secondary">{dao.loot_token_symbol || 'N/A'}</span></p>
              <p>
                Transfers:{' '}
                <span className={dao.loot_paused ? 'text-red-400' : 'text-emerald-400'}>
                  {dao.loot_paused ? 'Paused' : 'Enabled'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Lock state */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Permission Locks</h2>}>
        <div className="grid grid-cols-3 gap-4 text-sm text-center">
          <div>
            <p className="text-dao-text-hint text-xs mb-1">Admin</p>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                dao.admin_locked
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {dao.admin_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-1">Manager</p>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                dao.manager_locked
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {dao.manager_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-1">Governor</p>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                dao.governor_locked
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {dao.governor_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
        </div>
      </Card>

      {/* Info note */}
      <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/30 px-6 py-4">
        <p className="text-sm text-primary-300">
          Governance settings can only be changed through proposals. Submit a
          Governance Config proposal to modify these parameters.
        </p>
      </div>
    </div>
  )
}
