import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import type { Navigator } from '@/types/navigator'
import { NavigatorPermission } from '@/types/navigator'
import { isAddress } from '@/services/utils/AddressUtils'
import { isPermissionManagedNavigator } from '@/utils/navigatorSanction'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorForm - Add, update, or remove navigators via governance proposal
// ═══════════════════════════════════════════════════════════════════════════

interface NavigatorChange {
  address: string
  permission: number
  label: string
}

interface NavigatorFormData {
  title: string
  description: string
  offering: string
  expiration: string
  discussionUrl: string
  navigators: NavigatorChange[]
}

interface NavigatorFormProps {
  currentNavigators: Navigator[]
  daoLocks: { admin: boolean; manager: boolean; governor: boolean }
  /** Pre-fill a navigator change (e.g. from NavigatorCatalog after deploy, or a "remove" link with permission=0) */
  prefill?: { address: string; permission: number } | null
  /** Optional human-readable name for the prefilled navigator — used in the default title */
  prefillName?: string
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: NavigatorFormData) => void
  isSubmitting?: boolean
}

const PERMISSION_OPTIONS: Array<{ value: number; label: string; description: string }> = [
  { value: NavigatorPermission.None, label: 'Disable', description: 'Revoke all permissions (can be re-enabled later)' },
  { value: NavigatorPermission.ManagerOnly, label: 'Manager', description: 'Can mint/burn shares and loot' },
  { value: NavigatorPermission.GovernorOnly, label: 'Governor', description: 'Can cancel proposals' },
  { value: NavigatorPermission.AdminOnly, label: 'Admin', description: 'Can pause tokens, set config' },
  { value: NavigatorPermission.ManagerAndGovernor, label: 'Manager + Governor', description: 'Manager and Governor permissions' },
  { value: NavigatorPermission.AdminAndManager, label: 'Admin + Manager', description: 'Admin and Manager permissions' },
  { value: NavigatorPermission.AdminAndGovernor, label: 'Admin + Governor', description: 'Admin and Governor permissions' },
  { value: NavigatorPermission.All, label: 'All', description: 'Full Admin, Manager, and Governor permissions' },
]


export function NavigatorForm({
  currentNavigators,
  daoLocks,
  prefill,
  prefillName,
  minOfferingDisplay,
  canSelfSponsor = false,
  onSubmit,
  isSubmitting = false,
}: NavigatorFormProps) {
  const [title, setTitle] = useState(() => {
    if (!prefill) return ''
    const label = prefillName ? `"${prefillName}"` : `${prefill.address.slice(0, 10)}...`
    return prefill.permission === 0
      ? `Remove navigator ${label}`
      : `Register navigator ${label}`
  })
  const [description, setDescription] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [offering, setOffering] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Changes to existing navigators (permission updates / removals)
  // Pre-fill from query params if a new navigator was just deployed
  const [changes, setChanges] = useState<Map<string, number>>(() => {
    const initial = new Map<string, number>()
    if (prefill) {
      initial.set(prefill.address.toLowerCase(), prefill.permission)
    }
    return initial
  })

  // New navigator additions
  const [newAddress, setNewAddress] = useState('')
  const [newPermission, setNewPermission] = useState(NavigatorPermission.ManagerOnly)

  const updateExisting = (address: string, permission: number) => {
    setChanges((prev) => {
      const next = new Map(prev)
      // Find the navigator's current permission
      const current = currentNavigators.find((n) => n.navigator_address === address)
      if (current && current.permission === permission) {
        next.delete(address) // No change
      } else {
        next.set(address, permission)
      }
      return next
    })
  }

  const addNew = () => {
    const addr = newAddress.trim().toLowerCase()
    if (!isAddress(addr)) {
      setErrors((prev) => ({ ...prev, newAddress: 'Invalid address' }))
      return
    }
    if (currentNavigators.some((n) => n.navigator_address === addr) || changes.has(addr)) {
      setErrors((prev) => ({ ...prev, newAddress: 'Navigator already listed' }))
      return
    }
    setChanges((prev) => new Map(prev).set(addr, newPermission))
    setNewAddress('')
    setNewPermission(NavigatorPermission.ManagerOnly)
    setErrors((prev) => { const next = { ...prev }; delete next.newAddress; return next })
  }

  const removeNew = (address: string) => {
    // Only remove if it's a new addition (not in currentNavigators)
    if (!currentNavigators.some((n) => n.navigator_address === address)) {
      setChanges((prev) => { const next = new Map(prev); next.delete(address); return next })
    }
  }

  const getPermissionLabel = (perm: number): string => {
    return PERMISSION_OPTIONS.find((o) => o.value === perm)?.label || `Permission ${perm}`
  }

  // Check if a permission is blocked by locks
  const isPermissionLocked = (perm: number): boolean => {
    if ((perm & NavigatorPermission.AdminOnly) && daoLocks.admin) return true
    if ((perm & NavigatorPermission.ManagerOnly) && daoLocks.manager) return true
    if ((perm & NavigatorPermission.GovernorOnly) && daoLocks.governor) return true
    return false
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Proposal title is required'
    if (changes.size === 0) newErrors.changes = 'At least one navigator change is required'
    // Check locks
    for (const [addr, perm] of changes) {
      if (perm > 0 && isPermissionLocked(perm)) {
        newErrors.changes = `Cannot grant locked permission to ${addr.slice(0, 10)}...`
        break
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const navigators: NavigatorChange[] = []
    for (const [address, permission] of changes) {
      navigators.push({ address, permission, label: getPermissionLabel(permission) })
    }

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      offering,
      expiration,
      discussionUrl,
      navigators,
    })
  }

  // Separate new additions from existing navigator changes
  const existingAddresses = new Set(currentNavigators.map((n) => n.navigator_address))
  const newAdditions = [...changes.entries()].filter(([addr]) => !existingAddresses.has(addr))

  // Only navigators actually managed by setNavigators permissions belong in this form. Read-only
  // (Signal) and vault-module (Budget) navigators are sanctioned/enabled elsewhere, so showing a
  // "Disable" permission control for them is meaningless and alarming (they sit at permission 0 by
  // design). Keep the full list for the add-new duplicate check, but only render managed ones.
  const managedNavigators = currentNavigators.filter(isPermissionManagedNavigator)
  const unmanagedCount = currentNavigators.length - managedNavigators.length

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Proposal metadata */}
      <div className="space-y-5">
        <div>
          <label htmlFor="nav-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Proposal Title <span className="text-red-400">*</span>
          </label>
          <input
            id="nav-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Update navigator permissions"
            className="input w-full"
            maxLength={120}
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
          {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label htmlFor="nav-desc" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Description
          </label>
          <textarea
            id="nav-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain why this navigator change is needed..."
            className="input w-full min-h-[60px] resize-y"
            maxLength={2000}
            disabled={isSubmitting}
            rows={2}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
        </div>

        {/* Discussion Link */}
        <div>
          <label htmlFor="nav-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Discussion Link
          </label>
          <input
            id="nav-discussion-url"
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

      <ProposalActionSection title="Navigator Changes">

      {/* Existing navigators (permission-managed only) */}
      {managedNavigators.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-dao-text-secondary">Existing Navigators</h3>
          {managedNavigators.map((nav) => {
            const changedPerm = changes.get(nav.navigator_address)
            const isChanged = changedPerm !== undefined
            const effectivePerm = isChanged ? changedPerm : nav.permission
            const isRemoval = effectivePerm === 0

            return (
              <div
                key={nav.navigator_address}
                className={`rounded-lg border px-4 py-3 ${
                  isRemoval
                    ? 'border-red-500/30 bg-red-50 dark:bg-red-900/10'
                    : isChanged
                      ? 'border-accent-500/30 bg-accent-50 dark:bg-accent-900/10'
                      : 'border-dao-border bg-dao-dark-2'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {nav.name ? (
                        <span className="text-sm font-medium text-dao-text">{nav.name}</span>
                      ) : (
                        <AddressDisplay address={nav.navigator_address} />
                      )}
                      {nav.navigator_type && (
                        <span className="text-2xs bg-dao-dark-3 text-dao-text-hint rounded px-1.5 py-0.5">{nav.navigator_type}</span>
                      )}
                    </div>
                    {nav.name && (
                      <p className="text-2xs text-dao-text-hint font-mono mb-0.5">{nav.navigator_address.slice(0, 10)}...{nav.navigator_address.slice(-4)}</p>
                    )}
                    {nav.description && (
                      <p className="text-xs text-dao-text-muted mb-0.5 line-clamp-1">{nav.description}</p>
                    )}
                    {isChanged && (
                      <p className="text-xs text-accent-500">
                        {isRemoval
                          ? 'Will be disabled'
                          : `Permission: ${getPermissionLabel(nav.permission)} → ${getPermissionLabel(effectivePerm)}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={effectivePerm}
                      onChange={(e) => updateExisting(nav.navigator_address, Number(e.target.value))}
                      className="input text-sm py-1.5 px-2"
                      disabled={isSubmitting}
                    >
                      {PERMISSION_OPTIONS.map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={opt.value > 0 && isPermissionLocked(opt.value)}
                        >
                          {opt.label}{opt.value > 0 && isPermissionLocked(opt.value) ? ' (locked)' : ''}
                        </option>
                      ))}
                    </select>
                    {isChanged && (
                      <button
                        type="button"
                        onClick={() => updateExisting(nav.navigator_address, nav.permission)}
                        className="text-xs text-dao-text-hint hover:text-dao-text transition-colors"
                        title="Reset"
                      >
                        undo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Read-only / module navigators are managed elsewhere — explain the omission. */}
      {unmanagedCount > 0 && (
        <p className="text-xs text-dao-text-hint">
          {unmanagedCount} read-only or treasury-module navigator{unmanagedCount === 1 ? '' : 's'} (e.g.
          Signal, Budget) {unmanagedCount === 1 ? 'is' : 'are'} not shown here — they don't use
          permissions. Manage those from the navigator's own page (sanction a Signal navigator, or
          enable a Budget module).
        </p>
      )}

      {/* New additions */}
      {newAdditions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-dao-text-secondary">New Navigators</h3>
          {newAdditions.map(([addr, perm]) => (
            <div key={addr} className="rounded-lg border border-accent-500/30 bg-accent-50 dark:bg-accent-900/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <AddressDisplay address={addr} />
                  <p className="text-xs text-accent-500 mt-0.5">{getPermissionLabel(perm)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeNew(addr)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new navigator */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-dao-text-secondary">Add New Navigator</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newAddress}
            onChange={(e) => { setNewAddress(e.target.value); setErrors((prev) => { const next = { ...prev }; delete next.newAddress; return next }) }}
            placeholder="0x... navigator contract address"
            className="input flex-1 font-mono text-sm"
            disabled={isSubmitting}
          />
          <select
            value={newPermission}
            onChange={(e) => setNewPermission(Number(e.target.value))}
            className="input text-sm py-1.5 px-2"
            disabled={isSubmitting}
          >
            {PERMISSION_OPTIONS.filter((o) => o.value > 0).map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={isPermissionLocked(opt.value)}
              >
                {opt.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" size="sm" onClick={addNew} disabled={isSubmitting}>
            Add
          </Button>
        </div>
        {errors.newAddress && <p className="text-xs text-red-400">{errors.newAddress}</p>}
      </div>

      {errors.changes && <p className="text-xs text-red-400">{errors.changes}</p>}
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
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!title.trim() || changes.size === 0}
        >
          Submit Navigator Proposal
        </Button>
      </div>
    </form>
  )
}
