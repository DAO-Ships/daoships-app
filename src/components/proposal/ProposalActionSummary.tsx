import { useMemo } from 'react'
import { decodeProposalActions, type DecodedAction } from '@/services/utils/ProposalDecoder'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { Card } from '@/components/common/Card'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalActionSummary - Decodes and displays proposal actions for voters
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalActionSummaryProps {
  proposalData?: string | null
}

function ActionIcon({ type }: { type: DecodedAction['type'] }) {
  const paths: Record<string, string> = {
    transfer: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    mintShares: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    burnShares: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6',
    mintLoot: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    burnLoot: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6',
    setGovernanceConfig: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    setNavigators: 'M13 10V3L4 14h7v7l9-11h-7z',
    setGuildTokens: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    posterPost: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    custom: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  }
  return (
    <svg className="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[type] || paths.custom} />
    </svg>
  )
}

function ProfileChanges({ content }: { content: Record<string, unknown> }) {
  const fields = Object.entries(content).filter(([key]) => key !== 'daoAddress')
  if (fields.length === 0) return null

  return (
    <div className="mt-2 space-y-2">
      {fields.map(([key, value]) => (
        <div key={key} className="text-xs">
          <span className="text-dao-text-muted font-medium capitalize">{key}:</span>{' '}
          {typeof value === 'string' ? (
            <span className="text-dao-text-secondary break-all">{value || <em className="text-dao-text-hint">cleared</em>}</span>
          ) : typeof value === 'object' && value !== null ? (
            <span className="text-dao-text-secondary font-mono text-[11px] break-all">
              {JSON.stringify(value, null, 0)}
            </span>
          ) : (
            <span className="text-dao-text-secondary">{String(value)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function ActionDetail({ action }: { action: DecodedAction }) {
  const d = action.details

  switch (action.type) {
    case 'transfer':
      return (
        <div className="mt-2 text-xs space-y-1">
          <div><span className="text-dao-text-muted">Recipient:</span> <AddressDisplay address={d.recipient as string} /></div>
          <div><span className="text-dao-text-muted">Amount:</span> <span className="text-dao-text-secondary font-mono">{d.amount as string} {d.token === 'QUAI' ? 'QUAI' : ''}</span></div>
          {d.token && d.token !== 'QUAI' && (
            <div><span className="text-dao-text-muted">Token:</span> <AddressDisplay address={d.token as string} /></div>
          )}
        </div>
      )

    case 'mintShares':
    case 'burnShares':
    case 'mintLoot':
    case 'burnLoot': {
      const entries = (d.recipients || d.targets) as Array<{ address: string; amount: string }>
      return (
        <div className="mt-2 space-y-1">
          {entries.map((entry, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <AddressDisplay address={entry.address} />
              <span className="text-dao-text-secondary font-mono">{entry.amount}</span>
            </div>
          ))}
        </div>
      )
    }

    case 'posterPost': {
      const content = d.content
      if (typeof content === 'object' && content !== null) {
        return <ProfileChanges content={content as Record<string, unknown>} />
      }
      return <p className="mt-1 text-xs text-dao-text-muted break-all">{String(content)}</p>
    }

    case 'setGuildTokens': {
      const tokens = d.tokens as Array<{ address: string; enabled: boolean }>
      return (
        <div className="mt-2 space-y-1">
          {tokens.map((t, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <AddressDisplay address={t.address} />
              <span className={t.enabled ? 'text-emerald-400' : 'text-red-400'}>
                {t.enabled ? 'Enable' : 'Disable'}
              </span>
            </div>
          ))}
        </div>
      )
    }

    case 'setGovernanceConfig':
      return <p className="mt-1 text-xs text-dao-text-hint">Encoded governance config update</p>

    case 'setNavigators': {
      const navs = d.navigators as Array<{ address: string; permission: number }>
      const permLabel = (p: number) => {
        const labels: Record<number, string> = {
          0: 'Disable', 1: 'Admin', 2: 'Manager', 3: 'Admin + Manager',
          4: 'Governor', 5: 'Admin + Governor', 6: 'Manager + Governor', 7: 'All',
        }
        return labels[p] ?? `Permission ${p}`
      }
      return (
        <div className="mt-2 space-y-1">
          {navs.map((n, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <AddressDisplay address={n.address} />
              <span className={n.permission === 0 ? 'text-red-400' : 'text-dao-text-secondary'}>
                {permLabel(n.permission)}
              </span>
            </div>
          ))}
        </div>
      )
    }

    case 'custom':
      return (
        <div className="mt-2 text-xs space-y-1">
          <div><span className="text-dao-text-muted">Target:</span> <AddressDisplay address={d.target as string} /></div>
          {d.value !== '0' && (
            <div><span className="text-dao-text-muted">Value:</span> <span className="text-dao-text-secondary font-mono">{d.value as string} wei</span></div>
          )}
          <div>
            <span className="text-dao-text-muted">Calldata:</span>{' '}
            <span className="text-dao-text-hint font-mono text-[11px] break-all">{(d.calldata as string).slice(0, 66)}...</span>
          </div>
        </div>
      )

    default:
      return null
  }
}

export function ProposalActionSummary({ proposalData }: ProposalActionSummaryProps) {
  const actions = useMemo(() => decodeProposalActions(proposalData), [proposalData])

  if (actions.length === 0) {
    return (
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Proposed Actions</h2>}>
        <p className="text-sm text-dao-text-hint">
          {proposalData ? 'Unable to decode proposal actions' : 'Signal proposal (no on-chain actions)'}
        </p>
      </Card>
    )
  }

  return (
    <Card header={
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dao-text">Proposed Actions</h2>
        <span className="text-xs text-dao-text-hint">{actions.length} action{actions.length === 1 ? '' : 's'}</span>
      </div>
    }>
      <div className="space-y-4">
        {actions.map((action, i) => (
          <div key={i} className="flex gap-3">
            <div className="mt-0.5">
              <ActionIcon type={action.type} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dao-text">{action.label}</p>
              <ActionDetail action={action} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
