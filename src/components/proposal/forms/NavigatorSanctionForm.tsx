import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import type { Navigator } from '@/types/navigator'
import { isAddress } from '@/services/utils/AddressUtils'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorSanctionForm - Endorse the DAO's read-only navigators via governance
// ───────────────────────────────────────────────────────────────────────────
// Posts the DAO's COMPLETE sanctioned set under `daoships.dao.navigators` (vault =
// msg.sender, VERIFIED). Last-write-wins: a navigator left UNCHECKED is de-sanctioned,
// checking none clears all. The current sanctioned set is pre-checked so a governor
// can't accidentally drop existing endorsements.
// ═══════════════════════════════════════════════════════════════════════════

export interface NavigatorSanctionEntry {
  address: string
  type?: string
}

export interface NavigatorSanctionFormData {
  title: string
  description: string
  offering: string
  expiration: string
  discussionUrl: string
  navigators: NavigatorSanctionEntry[]
}

interface NavigatorSanctionFormProps {
  /** Read-only navigators bound to this DAO (any trust_status). */
  readOnlyNavigators: Navigator[]
  /** Address the proposal targets (e.g. from the navigator page's sanction/unsanction CTA). */
  prefillAddress?: string | null
  /** Whether the target should be sanctioned ('add', default) or unsanctioned ('remove'). */
  prefillMode?: 'add' | 'remove'
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: NavigatorSanctionFormData) => void
  isSubmitting?: boolean
}

export function NavigatorSanctionForm({
  readOnlyNavigators,
  prefillAddress,
  prefillMode = 'add',
  minOfferingDisplay,
  canSelfSponsor = false,
  onSubmit,
  isSubmitting = false,
}: NavigatorSanctionFormProps) {
  const prefill = prefillAddress && isAddress(prefillAddress) ? prefillAddress.toLowerCase() : null

  // A freshly-deployed navigator may not be indexed yet — surface it as an extra row.
  const knownAddresses = new Set(readOnlyNavigators.map((n) => n.navigator_address.toLowerCase()))
  const rows: Array<{ address: string; type?: string; name?: string | null; trust_status?: string }> = [
    ...readOnlyNavigators.map((n) => ({
      address: n.navigator_address.toLowerCase(),
      type: n.navigator_type ?? undefined,
      name: n.name,
      trust_status: n.trust_status,
    })),
    ...(prefill && !knownAddresses.has(prefill)
      ? [{ address: prefill, type: 'SignalNavigator', name: null, trust_status: 'self_asserted' }]
      : []),
  ]

  // Initialize the checked set to the current sanctioned navigators, then apply the prefill
  // intent: 'add' checks the target (sanction it), 'remove' unchecks it (unsanction it). Either
  // way the submitted list is the COMPLETE set, so other endorsements are preserved.
  const [sanctioned, setSanctioned] = useState<Set<string>>(() => {
    const init = new Set<string>()
    for (const n of readOnlyNavigators) {
      if (n.trust_status === 'sanctioned') init.add(n.navigator_address.toLowerCase())
    }
    if (prefill) {
      if (prefillMode === 'remove') init.delete(prefill)
      else init.add(prefill)
    }
    return init
  })

  // The human-readable label for the prefilled target (for the summary banner + default title).
  const targetRow = prefill ? rows.find((r) => r.address === prefill) : null
  const targetLabel = targetRow?.name || (prefill ? `${prefill.slice(0, 10)}...${prefill.slice(-4)}` : '')

  const [title, setTitle] = useState(() => {
    if (!prefill) return 'Sanction signal navigators'
    const short = `${prefill.slice(0, 10)}...`
    return prefillMode === 'remove' ? `Unsanction navigator ${short}` : `Sanction navigator ${short}`
  })
  const [description, setDescription] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [offering, setOffering] = useState('')

  const toggle = (address: string) => {
    setSanctioned((prev) => {
      const next = new Set(prev)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })
  }

  // The proposal always reflects a change vs the current sanctioned set (add or remove).
  const currentlySanctioned = new Set(
    readOnlyNavigators.filter((n) => n.trust_status === 'sanctioned').map((n) => n.navigator_address.toLowerCase()),
  )
  const isChanged =
    sanctioned.size !== currentlySanctioned.size ||
    [...sanctioned].some((a) => !currentlySanctioned.has(a))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const navigators: NavigatorSanctionEntry[] = rows
      .filter((r) => sanctioned.has(r.address))
      .map((r) => ({ address: r.address, type: r.type }))

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      offering,
      expiration,
      discussionUrl,
      navigators,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Single-target intent (from the navigator page) — state the one change plainly. */}
      {prefill && (
        <div className="bg-accent-500/5 border border-accent-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-dao-text">
            This proposal will{' '}
            <strong>{prefillMode === 'remove' ? 'unsanction' : 'sanction'}</strong> {targetLabel}.
          </p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            Your DAO's other endorsements are preserved. The complete list below is what gets saved
            (last-write-wins), so you can still adjust it before submitting.
          </p>
        </div>
      )}

      {/* Proposal metadata */}
      <div className="space-y-5">
        <div>
          <label htmlFor="sanction-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Proposal Title <span className="text-red-400">*</span>
          </label>
          <input
            id="sanction-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sanction signal navigators"
            className="input w-full"
            maxLength={120}
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
        </div>

        <div>
          <label htmlFor="sanction-desc" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Description
          </label>
          <textarea
            id="sanction-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain which navigators this DAO is endorsing and why..."
            className="input w-full min-h-[60px] resize-y"
            maxLength={2000}
            disabled={isSubmitting}
            rows={2}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
        </div>

        <div>
          <label htmlFor="sanction-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Discussion Link
          </label>
          <input
            id="sanction-discussion-url"
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
      </div>

      <ProposalActionSection title="Sanctioned Navigators">
        <p className="text-xs text-dao-text-muted">
          This is the DAO's <strong>complete</strong> sanctioned set. Unchecking a navigator de-sanctions
          it (its polls stop surfacing); the list as submitted fully replaces the current set.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-dao-text-hint py-3">
            No read-only navigators found for this DAO. Deploy a Signal Navigator first.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <label
                key={r.address}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer ${
                  sanctioned.has(r.address)
                    ? 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10'
                    : 'border-dao-border bg-dao-dark-2'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sanctioned.has(r.address)}
                  onChange={() => toggle(r.address)}
                  disabled={isSubmitting}
                  className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.name ? (
                      <span className="text-sm font-medium text-dao-text">{r.name}</span>
                    ) : (
                      <AddressDisplay address={r.address} />
                    )}
                    {r.type && (
                      <span className="text-2xs bg-dao-dark-3 text-dao-text-hint rounded px-1.5 py-0.5">{r.type}</span>
                    )}
                    {r.trust_status === 'sanctioned' && (
                      <span className="text-2xs text-emerald-500">currently sanctioned</span>
                    )}
                  </div>
                  {r.name && (
                    <p className="text-2xs text-dao-text-hint font-mono mt-0.5">
                      {r.address.slice(0, 10)}...{r.address.slice(-4)}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </ProposalActionSection>

      <ProposalSettingsFields
        expiration={expiration}
        onExpirationChange={setExpiration}
        disabled={isSubmitting}
      />

      <OfferingField
        value={offering}
        onChange={setOffering}
        minOfferingDisplay={minOfferingDisplay}
        canSelfSponsor={canSelfSponsor}
        disabled={isSubmitting}
      />

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={!title.trim() || !isChanged}>
          Submit Sanction Proposal
        </Button>
      </div>
    </form>
  )
}
