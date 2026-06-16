import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quais } from 'quais'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { TransactionBuilder, type TransactionAction } from './TransactionBuilder'
import { baseService } from '@/services/core/BaseService'
import { formatTokenAmount } from '@/utils/format'
import { isAddress } from '@/services/utils/AddressUtils'

// ═══════════════════════════════════════════════════════════════════════════
// CustomActionForm - Intent-based multi-transaction proposal builder
// ═══════════════════════════════════════════════════════════════════════════

const MAX_ACTIONS = 20

export interface CustomActionFormData {
  title: string
  description: string
  actions: TransactionAction[]
  offering: string
  expiration: string
  discussionUrl: string
}

export interface KnownToken {
  address: string
  symbol: string
  name: string
  decimals?: number
  balance?: bigint
}

interface CustomActionFormProps {
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: CustomActionFormData) => void
  isSubmitting?: boolean
  vaultAddress?: string
  knownTokens?: KnownToken[]
  /** Pre-fill the transaction list (e.g. from a navigator deep-link). */
  prefillActions?: TransactionAction[]
  /** Pre-fill the title/description (e.g. from a navigator deep-link). */
  prefillTitle?: string
  prefillDescription?: string
}

const EMPTY_ACTION: TransactionAction = { to: '', value: '0', data: '0x' }

export function CustomActionForm({ minOfferingDisplay, canSelfSponsor = false, onSubmit, isSubmitting = false, vaultAddress, knownTokens = [], prefillActions, prefillTitle, prefillDescription }: CustomActionFormProps) {
  // ── Vault balance (lifted to avoid duplicate RPC calls) ────────────────
  const hasProvider = baseService.hasProvider()
  const { data: vaultQuaiBalance } = useQuery({
    queryKey: ['vaultQuaiBalance', vaultAddress],
    queryFn: async () => {
      const provider = baseService.getProvider()
      const bal = await provider.getBalance(quais.getAddress(vaultAddress!))
      return BigInt(bal)
    },
    enabled: !!vaultAddress && hasProvider,
    staleTime: 30_000,
  })

  // ── Form state ─────────────────────────────────────────────────────────
  // Prefill is consumed once at mount (initializer) — editable thereafter.
  const initialActions = prefillActions && prefillActions.length > 0
    ? prefillActions.map((a) => ({ ...a }))
    : [{ ...EMPTY_ACTION }]
  const [title, setTitle] = useState(prefillTitle ?? '')
  const [description, setDescription] = useState(prefillDescription ?? '')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [actions, setActions] = useState<TransactionAction[]>(initialActions)
  const [actionKeys, setActionKeys] = useState<string[]>(() => initialActions.map(() => crypto.randomUUID()))
  const [expandedIndex, setExpandedIndex] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showVaultPanel, setShowVaultPanel] = useState(false)

  // ── Action handlers ────────────────────────────────────────────────────
  const handleActionChange = useCallback((index: number, action: TransactionAction) => {
    setActions((prev) => prev.map((a, i) => (i === index ? action : a)))
  }, [])

  const handleActionRemove = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index))
    setActionKeys((prev) => prev.filter((_, i) => i !== index))
    setExpandedIndex((prev) => {
      if (index < prev) return prev - 1
      if (index === prev) return Math.max(0, prev - 1)
      return prev
    })
  }, [])

  const addAction = () => {
    if (actions.length >= MAX_ACTIONS) return
    const newIndex = actions.length
    setActions((prev) => [...prev, { ...EMPTY_ACTION }])
    setActionKeys((prev) => [...prev, crypto.randomUUID()])
    setExpandedIndex(newIndex)
  }

  // ── Net impact calculation ─────────────────────────────────────────────
  const netQuaiImpact = useMemo(() => {
    return actions.reduce((sum, a) => {
      try { return sum + BigInt(a.value) } catch { return sum }
    }, 0n)
  }, [actions])

  // ── Validation (Stage 4) ───────────────────────────────────────────────
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Title is required'
    if (actions.length === 0) newErrors.actions = 'At least one transaction is required'

    let hasValidAction = false
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i]
      if (!isAddress(a.to)) {
        newErrors[`action-${i}`] = `Action #${i + 1}: invalid target address`
      } else {
        hasValidAction = true
      }
      // Check for no-op actions
      if (a.to && a.value === '0' && (a.data === '0x' || a.data === '')) {
        newErrors[`action-noop-${i}`] = `Action #${i + 1}: empty transaction (no value and no calldata)`
      }
    }
    if (actions.length > 0 && !hasValidAction) {
      newErrors.actions = 'At least one transaction must have a valid target address'
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
        actions: actions.filter((a) => isAddress(a.to)),
        offering,
        expiration,
        discussionUrl,
      })
    }
  }

  const configuredCount = actions.filter((a) => isAddress(a.to)).length

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ── Vault Context Bar (Stage 3 — mobile) ──────────────────────── */}
      {vaultAddress && (
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setShowVaultPanel(!showVaultPanel)}
            className="w-full flex items-center justify-between bg-dao-dark-2 rounded-lg px-4 py-2.5 border border-dao-border"
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="text-dao-text-hint">Treasury:</span>
              {vaultQuaiBalance != null && (
                <span className="font-mono text-primary-400">{formatTokenAmount(vaultQuaiBalance)} QUAI</span>
              )}
              {knownTokens.length > 0 && (
                <span className="text-dao-text-hint">+ {knownTokens.length} tokens</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {configuredCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                  {configuredCount} action{configuredCount !== 1 ? 's' : ''}
                </span>
              )}
              <svg aria-hidden="true" className={`w-4 h-4 text-dao-text-hint transition-transform ${showVaultPanel ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {showVaultPanel && (
            <VaultPanel
              vaultQuaiBalance={vaultQuaiBalance ?? null}
              knownTokens={knownTokens}
              actions={actions}
              netQuaiImpact={netQuaiImpact}
            />
          )}
        </div>
      )}

      {/* ── Main layout: form + sidebar ───────────────────────────────── */}
      <div className="flex gap-6">
        {/* Left: Form */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Title */}
          <div>
            <label htmlFor="custom-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Proposal Title *
            </label>
            <input id="custom-title" type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Custom action proposal title"
              className="input w-full" maxLength={120} disabled={isSubmitting} />
            <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="custom-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Description
            </label>
            <textarea id="custom-description" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this proposal does..."
              className="input w-full min-h-[60px] resize-y" maxLength={2000}
              disabled={isSubmitting} rows={2} />
            <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
          </div>

          {/* Discussion Link */}
          <div>
            <label htmlFor="custom-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Discussion Link
            </label>
            <input
              id="custom-discussion-url"
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

          <hr className="border-dao-border" />

          {/* Transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-dao-text-secondary">
                Transactions ({actions.length}/{MAX_ACTIONS})
              </label>
            </div>

            {errors.actions && <p className="text-xs text-red-400 mb-2">{errors.actions}</p>}

            <div className="space-y-2">
              {actions.map((_, i) => (
                <TransactionBuilder
                  key={actionKeys[i]}
                  index={i}
                  onChange={handleActionChange}
                  onRemove={handleActionRemove}
                  disabled={isSubmitting}
                  vaultAddress={vaultAddress}
                  vaultQuaiBalance={vaultQuaiBalance ?? null}
                  knownTokens={knownTokens}
                  collapsed={actions.length > 1 && i !== expandedIndex}
                  onToggle={() => setExpandedIndex(i === expandedIndex ? -1 : i)}
                  initialAction={initialActions[i]}
                />
              ))}
            </div>

            {/* Per-action validation errors */}
            {Object.entries(errors)
              .filter(([k]) => k.startsWith('action-'))
              .map(([k, v]) => (
                <p key={k} className="text-xs text-red-400 mt-1">{v}</p>
              ))}

            {actions.length < MAX_ACTIONS && (
              <button type="button" onClick={addAction} disabled={isSubmitting}
                className="mt-3 w-full py-2.5 rounded-lg border border-dashed border-dao-border text-sm text-dao-text-muted hover:border-primary-500/50 hover:text-primary-400 transition-colors">
                + Add Transaction
              </button>
            )}
          </div>

          {/* Proposal Settings */}
          <ProposalSettingsFields
            expiration={expiration} onExpirationChange={setExpiration}
            disabled={isSubmitting} />

          {/* Tribute */}
          <OfferingField
            value={offering} onChange={setOffering}
            minOfferingDisplay={minOfferingDisplay}
            canSelfSponsor={canSelfSponsor} disabled={isSubmitting} />

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={isSubmitting}
              disabled={!title.trim() || actions.length === 0}>
              Submit Custom Action Proposal
            </Button>
          </div>
        </div>

        {/* Right: Vault Context Sidebar (Stage 3 — desktop) */}
        {vaultAddress && (
          <div className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-4 space-y-4">
              <VaultPanel
                vaultQuaiBalance={vaultQuaiBalance ?? null}
                knownTokens={knownTokens}
                actions={actions}
                netQuaiImpact={netQuaiImpact}
              />
            </div>
          </div>
        )}
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// VaultPanel — Treasury summary + action summary + net impact
// ═══════════════════════════════════════════════════════════════════════════

function VaultPanel({ vaultQuaiBalance, knownTokens, actions, netQuaiImpact }: {
  vaultQuaiBalance: bigint | null
  knownTokens: KnownToken[]
  actions: TransactionAction[]
  netQuaiImpact: bigint
}) {
  const configuredActions = actions.filter((a) => isAddress(a.to))

  return (
    <div className="bg-dao-dark-2 rounded-lg border border-dao-border overflow-hidden">
      {/* Treasury balances */}
      <div className="px-4 py-3 border-b border-dao-border">
        <p className="text-2xs font-medium text-dao-text-hint uppercase tracking-wider mb-2">Treasury</p>
        {vaultQuaiBalance != null && (
          <p className="text-sm font-mono text-dao-text">
            {formatTokenAmount(vaultQuaiBalance)} <span className="text-dao-text-hint">QUAI</span>
          </p>
        )}
        {knownTokens.length > 0 && (
          <div className="mt-2 space-y-1">
            {knownTokens.map((t) => (
              <p key={t.address} className="text-xs font-mono text-dao-text-muted">
                {t.balance != null ? formatTokenAmount(t.balance, t.decimals) : '—'}{' '}
                <span className="text-dao-text-hint">{t.symbol}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Configured actions summary */}
      {configuredActions.length > 0 && (
        <div className="px-4 py-3 border-b border-dao-border">
          <p className="text-2xs font-medium text-dao-text-hint uppercase tracking-wider mb-2">
            Actions ({configuredActions.length})
          </p>
          <div className="space-y-1.5">
            {configuredActions.map((a, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-dao-text-muted">#{i + 1}</span>
                  <span className="text-dao-text-secondary font-medium">{a.summary || 'Pending'}</span>
                </div>
                <div className="pl-4 text-dao-text-hint">
                  <span className="font-mono">{a.to.slice(0, 8)}...{a.to.slice(-4)}</span>
                  {a.value !== '0' && (
                    <span className="text-primary-400 ml-1.5">
                      {(() => { try { return quais.formatQuai(BigInt(a.value)) } catch { return '?' } })()} QUAI
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net impact */}
      {netQuaiImpact > 0n && (
        <div className="px-4 py-3">
          <p className="text-2xs font-medium text-dao-text-hint uppercase tracking-wider mb-1">Net Impact</p>
          <p className="text-sm font-mono text-red-400">
            -{(() => { try { return quais.formatQuai(netQuaiImpact) } catch { return '?' } })()} QUAI
          </p>
          {vaultQuaiBalance != null && netQuaiImpact > vaultQuaiBalance && (
            <p className="text-2xs text-red-400 mt-1">Exceeds vault balance</p>
          )}
        </div>
      )}
    </div>
  )
}
