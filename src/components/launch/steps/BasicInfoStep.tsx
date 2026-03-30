import { useState } from 'react'
import type { Control, FieldErrors } from 'react-hook-form'
import { useController } from 'react-hook-form'

// ═══════════════════════════════════════════════════════════════════════════
// BasicInfoStep - Step 1: DAO name (required), optional profile, tokens
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard link types for DAO profiles.
 * These are stored in the Poster profile as `links: Record<string, string>`.
 */
export const STANDARD_LINKS = [
  { key: 'website', label: 'Website', placeholder: 'https://mydao.org' },
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
  { key: 'twitter', label: 'X / Twitter', placeholder: 'https://x.com/...' },
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/...' },
  { key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/...' },
  { key: 'docs', label: 'Documentation', placeholder: 'https://docs.mydao.org' },
  { key: 'forum', label: 'Forum', placeholder: 'https://forum.mydao.org' },
] as const

export interface LaunchFormValues {
  // Step 1: Basic Info
  name: string
  description: string
  avatarUrl: string
  links: Record<string, string>
  shareTokenName: string
  shareTokenSymbol: string
  lootTokenName: string
  lootTokenSymbol: string
  pauseSharesOnLaunch: boolean
  pauseLootOnLaunch: boolean
  // Step 2: Members
  members: Array<{ address: string; shares: string; loot: string }>
  // Step 3: Governance
  votingPeriodInput: string
  gracePeriodInput: string
  quorumPercent: string
  proposalOffering: string
  sponsorThreshold: string
  minRetentionPercent: string
  defaultExpiryWindow: string
  // Step 4: Navigators
  enableOnboarder: boolean
  onboarderConfig: {
    mode: 'multiplier' | 'fixedPrice'
    shareMultiplier: string   // basis points, default '10000' (= 1x)
    lootMultiplier: string    // default '0'
    pricePerUnit: string      // QUAI wei, default '0'
    sharesPerUnit: string     // default '0'
    lootPerUnit: string       // default '0'
    minTribute: string        // QUAI, default '0.1'
    expiry: string            // '' for no expiry, or seconds
    mintCap: string           // '0' = unlimited
    perAddressCap: string     // '0' = unlimited
  }
  enableERC20Tribute: boolean
  erc20TributeConfig: {
    tributeToken: string      // ERC20 address
    pricePerShare: string     // in token decimals
    pricePerLoot: string      // default '0'
    expiry: string
    mintCap: string
    perAddressCap: string
  }
  // Step 5: Guild Tokens
  guildTokens: Array<{ type: 'native' | 'erc20'; address: string }>
  // Step 6: Vault
  vaultOwners: Array<{ address: string }>
  vaultThreshold: string
}

interface BasicInfoStepProps {
  control: Control<LaunchFormValues>
  errors: FieldErrors<LaunchFormValues>
}

export function BasicInfoStep({ control, errors }: BasicInfoStepProps) {
  const [showOptionalProfile, setShowOptionalProfile] = useState(false)

  const name = useController({ control, name: 'name' })
  const description = useController({ control, name: 'description' })
  const avatarUrl = useController({ control, name: 'avatarUrl' })
  const links = useController({ control, name: 'links' })
  const shareTokenName = useController({ control, name: 'shareTokenName' })
  const shareTokenSymbol = useController({ control, name: 'shareTokenSymbol' })
  const lootTokenName = useController({ control, name: 'lootTokenName' })
  const lootTokenSymbol = useController({ control, name: 'lootTokenSymbol' })
  const pauseSharesOnLaunch = useController({ control, name: 'pauseSharesOnLaunch' })
  const pauseLootOnLaunch = useController({ control, name: 'pauseLootOnLaunch' })

  const updateLink = (key: string, value: string) => {
    const current = links.field.value || {}
    if (value.trim()) {
      links.field.onChange({ ...current, [key]: value.trim() })
    } else {
      const { [key]: _, ...rest } = current
      links.field.onChange(rest)
    }
  }

  const hasOptionalData = !!(
    description.field.value ||
    avatarUrl.field.value ||
    Object.values(links.field.value || {}).some(v => v)
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-dao-text mb-1">Basic Information</h2>
        <p className="text-sm text-dao-text-muted">
          Name your DAO and configure its tokens. Optional profile details can be added now or later via governance proposal.
        </p>
      </div>

      {/* DAO Name (required) */}
      <div>
        <label htmlFor="launch-name" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          DAO Name <span className="text-red-400">*</span>
        </label>
        <input
          id="launch-name"
          type="text"
          {...name.field}
          placeholder="My Awesome DAO"
          className="input w-full"
          maxLength={120}
        />
        {errors.name && (
          <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>
        )}
        <p className="text-xs text-dao-text-hint mt-1">{name.field.value?.length || 0}/120</p>
      </div>

      {/* Optional Profile Section (collapsible) */}
      <div className="card">
        <button
          type="button"
          onClick={() => setShowOptionalProfile(!showOptionalProfile)}
          className="w-full px-6 py-4 flex items-center justify-between text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-dao-text-secondary">
              Profile Details
              <span className="text-xs text-dao-text-hint font-normal ml-2">Optional</span>
            </h3>
            <p className="text-xs text-dao-text-hint mt-0.5">
              {hasOptionalData
                ? 'Description, avatar, and links configured'
                : 'Add description, avatar, and links (can also be set later via governance)'}
            </p>
          </div>
          <svg
            className={`w-5 h-5 text-dao-text-hint transition-transform ${showOptionalProfile ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showOptionalProfile && (
          <div className="px-6 pb-5 space-y-5 border-t border-dao-border pt-4">
            {/* Description */}
            <div>
              <label htmlFor="launch-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Description
              </label>
              <textarea
                id="launch-description"
                {...description.field}
                placeholder="What is your DAO about?"
                className="input w-full min-h-[100px] resize-y"
                maxLength={2000}
                rows={4}
              />
              <p className="text-xs text-dao-text-hint mt-1">{description.field.value?.length || 0}/2000</p>
            </div>

            {/* Avatar URL */}
            <div>
              <label htmlFor="launch-avatar" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Avatar URL
              </label>
              <input
                id="launch-avatar"
                type="url"
                {...avatarUrl.field}
                placeholder="https://example.com/logo.png or ipfs://..."
                className="input w-full"
                maxLength={2048}
              />
              <p className="text-xs text-dao-text-hint mt-1">
                PNG, JPG, SVG, or IPFS link for your DAO's logo
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-sm font-medium text-dao-text-secondary mb-3">Links</h4>
              <div className="space-y-3">
                {STANDARD_LINKS.map(({ key, label, placeholder }) => (
                  <div key={key} className="grid grid-cols-[120px_1fr] gap-3 items-center">
                    <label htmlFor={`link-${key}`} className="text-xs text-dao-text-muted text-right">
                      {label}
                    </label>
                    <input
                      id={`link-${key}`}
                      type="url"
                      value={(links.field.value || {})[key] || ''}
                      onChange={(e) => updateLink(key, e.target.value)}
                      placeholder={placeholder}
                      className="input w-full text-sm"
                      maxLength={2048}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-dao-text-hint mt-2">
                All links are optional and can be updated later via governance proposal.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Token Configuration */}
      <div>
        <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
          Share Token
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="share-token-name" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Token Name
            </label>
            <input
              id="share-token-name"
              type="text"
              {...shareTokenName.field}
              placeholder="DAO Shares"
              className="input w-full"
              maxLength={60}
            />
          </div>
          <div>
            <label htmlFor="share-token-symbol" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Token Symbol
            </label>
            <input
              id="share-token-symbol"
              type="text"
              {...shareTokenSymbol.field}
              placeholder="SHARES"
              className="input w-full"
              maxLength={10}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
          Loot Token
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="loot-token-name" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Token Name
            </label>
            <input
              id="loot-token-name"
              type="text"
              {...lootTokenName.field}
              placeholder="DAO Loot"
              className="input w-full"
              maxLength={60}
            />
          </div>
          <div>
            <label htmlFor="loot-token-symbol" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Token Symbol
            </label>
            <input
              id="loot-token-symbol"
              type="text"
              {...lootTokenSymbol.field}
              placeholder="LOOT"
              className="input w-full"
              maxLength={10}
            />
          </div>
        </div>
      </div>

      {/* Token Transfer Settings */}
      <div>
        <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
          Token Transfer Settings
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pauseSharesOnLaunch.field.value}
              onChange={pauseSharesOnLaunch.field.onChange}
              className="w-4 h-4 rounded border-dao-border bg-dao-dark-3 text-accent-500 focus:ring-accent-500 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-dao-text-secondary">Pause share token transfers on launch</span>
              <p className="text-xs text-dao-text-hint">Shares cannot be transferred until unpaused via governance</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pauseLootOnLaunch.field.value}
              onChange={pauseLootOnLaunch.field.onChange}
              className="w-4 h-4 rounded border-dao-border bg-dao-dark-3 text-accent-500 focus:ring-accent-500 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-dao-text-secondary">Pause loot token transfers on launch</span>
              <p className="text-xs text-dao-text-hint">Loot cannot be transferred until unpaused via governance</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}
