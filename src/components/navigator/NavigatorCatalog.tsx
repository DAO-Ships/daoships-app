import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { quais } from 'quais'
import { getGroupedCatalog, type NavigatorCatalogEntry } from '@/config/navigatorCatalog'
import { navigatorDeployService } from '@/services/core/NavigatorDeployService'
import { posterService } from '@/services/core/PosterService'
import { tokenService } from '@/services/core/TokenService'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { parseTokenAmount } from '@/utils/format'
import { signalNavigatorSchema, timelockNavigatorSchema, getTimelockWarnings, subscriptionNavigatorSchema } from '@/utils/navigatorValidation'
import { parseAllowlistInput, buildAllowlistTree, downloadAllowlistBackup } from '@/utils/allowlist'
import { AllowlistInput, MAX_ALLOWLIST_ADDRESSES } from '@/components/common/AllowlistInput'
import { NavigatorGlyph } from './NavigatorGlyph'
import { PERMISSION_COLORS } from '@/utils/navigatorPermissions'
import { buildEnableModuleAction, buildBudgetProposalHref } from '@/utils/budgetProposals'
import { useDao } from '@/hooks/useDao'
import { safeBigInt } from '@/utils/bigint'
import { isValidCyprus1Address } from '@/services/utils/AddressUtils'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorCatalog - Browse, deploy, and propose navigator contracts
// ═══════════════════════════════════════════════════════════════════════════

interface NavigatorCatalogProps {
  daoAddress: string
  onClose: () => void
}

// ─── Form state types ─────────────────────────────────────────────────────

interface OnboarderFormState {
  mode: 'multiplier' | 'fixedPrice'
  shareMultiplier: string
  lootMultiplier: string
  pricePerUnit: string
  sharesPerUnit: string
  lootPerUnit: string
  minTribute: string
  expiry: string
  mintCap: string
  perAddressCap: string
  allowlistAddresses: string
  navigatorName: string
  navigatorDescription: string
}

interface ERC20TributeFormState {
  tributeToken: string
  pricePerShare: string
  pricePerLoot: string
  expiry: string
  mintCap: string
  perAddressCap: string
  allowlistAddresses: string
  navigatorName: string
  navigatorDescription: string
}

const DEFAULT_ONBOARDER: OnboarderFormState = {
  mode: 'multiplier',
  shareMultiplier: '10000',
  lootMultiplier: '0',
  pricePerUnit: '1',
  sharesPerUnit: '1',
  lootPerUnit: '0',
  minTribute: '0.1',
  expiry: '',
  mintCap: '0',
  perAddressCap: '0',
  allowlistAddresses: '',
  navigatorName: '',
  navigatorDescription: '',
}

interface NFTGatedFormState {
  gateToken: string
  sharesPerHolder: string
  lootPerHolder: string
  tributeMode: 'free' | 'tribute'
  tributeAmount: string
  expiry: string
  mintCap: string
  perAddressCap: string
  allowlistAddresses: string
  navigatorName: string
  navigatorDescription: string
}

const DEFAULT_ERC20: ERC20TributeFormState = {
  tributeToken: '',
  pricePerShare: '1',
  pricePerLoot: '0',
  expiry: '',
  mintCap: '0',
  perAddressCap: '0',
  allowlistAddresses: '',
  navigatorName: '',
  navigatorDescription: '',
}

interface SignalFormState {
  minSharesToCreatePoll: string  // human shares; 0 = anyone with any voting power
  minDurationDays: string        // poll duration bounds, in days
  maxDurationDays: string
  maxStartDelayDays: string      // 0 = immediate-only (no scheduling)
  navigatorName: string
  navigatorDescription: string
}

const DEFAULT_SIGNAL: SignalFormState = {
  minSharesToCreatePoll: '0',
  minDurationDays: '1',
  maxDurationDays: '30',
  maxStartDelayDays: '7',
  navigatorName: '',
  navigatorDescription: '',
}

interface TimelockFormState {
  delayDays: string        // mandatory delay before a queued change is executable, in days
  expiryWindowDays: string // how long a matured change stays executable, in days
  navigatorName: string
  navigatorDescription: string
}

const DEFAULT_TIMELOCK: TimelockFormState = {
  delayDays: '2',          // RECOMMENDED_DELAY (2 days)
  expiryWindowDays: '7',
  navigatorName: '',
  navigatorDescription: '',
}

interface SubscriptionTokenRow {
  address: string  // '' = native QUAI
  fee: string      // fee per period, in whole token units
}

interface SubscriptionFormState {
  tokens: SubscriptionTokenRow[]
  periodDays: string
  graceDays: string
  rewardPct: string          // keeper reward, 0..100
  burnOnCollect: boolean      // true = burn shares, false = convert to loot
  initialMembers: string      // newline/comma separated addresses (one free period each)
  navigatorName: string
  navigatorDescription: string
}

const DEFAULT_SUBSCRIPTION: SubscriptionFormState = {
  tokens: [{ address: '', fee: '' }],  // one native-QUAI row by default
  periodDays: '30',
  graceDays: '7',
  rewardPct: '1',
  burnOnCollect: false,
  initialMembers: '',
  navigatorName: '',
  navigatorDescription: '',
}

const DEFAULT_NFT: NFTGatedFormState = {
  gateToken: '',
  sharesPerHolder: '1',
  lootPerHolder: '0',
  tributeMode: 'free',
  tributeAmount: '0',
  expiry: '',
  mintCap: '',          // mandatory, > 0 — no "unlimited" default
  perAddressCap: '0',
  allowlistAddresses: '',
  navigatorName: '',
  navigatorDescription: '',
}

// Common fields shared by every navigator form state — lets the metadata + advanced
// sections dispatch generically instead of branching per type.
type CommonFieldKey =
  | 'expiry'
  | 'mintCap'
  | 'perAddressCap'
  | 'allowlistAddresses'
  | 'navigatorName'
  | 'navigatorDescription'

// ─── Pattern badge colors ─────────────────────────────────────────────────

const PATTERN_COLORS: Record<string, string> = {
  membership: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  safety: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  treasury: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  information: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  vesting: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  adaptive: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  recurring: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
}

export function NavigatorCatalog({ daoAddress, onClose }: NavigatorCatalogProps) {
  const [selectedEntry, setSelectedEntry] = useState<NavigatorCatalogEntry | null>(null)
  const groups = getGroupedCatalog()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-display text-dao-text">Navigator Catalog</h2>
          <p className="text-sm text-dao-text-muted mt-0.5">
            Browse available navigator types. Deploy shipped navigators and propose them to your DAO.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-dao-text-hint hover:text-dao-text transition-colors p-1"
          aria-label="Close catalog"
        >
          <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Catalog grid grouped by pattern */}
      {selectedEntry ? (
        <DeployConfigPanel
          entry={selectedEntry}
          daoAddress={daoAddress}
          onBack={() => setSelectedEntry(null)}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-dao-text-secondary mb-3 uppercase tracking-wider">
                {group.label}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.entries.map((entry) => (
                  <CatalogCard
                    key={entry.type}
                    entry={entry}
                    onSelect={() => entry.status === 'shipped' && setSelectedEntry(entry)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CatalogCard - Individual navigator type card
// ═══════════════════════════════════════════════════════════════════════════

function CatalogCard({
  entry,
  onSelect,
}: {
  entry: NavigatorCatalogEntry
  onSelect: () => void
}) {
  const isPlanned = entry.status === 'planned'

  return (
    <div
      className={`card overflow-hidden transition-all ${
        isPlanned
          ? 'opacity-60 cursor-default'
          : 'hover:border-primary-500/30 cursor-pointer'
      }`}
      onClick={isPlanned ? undefined : onSelect}
      onKeyDown={isPlanned ? undefined : (e) => e.key === 'Enter' && onSelect()}
      role={isPlanned ? undefined : 'button'}
      tabIndex={isPlanned ? undefined : 0}
      aria-label={isPlanned ? `${entry.name} - Coming soon` : `Deploy ${entry.name}`}
    >
      <div className="px-4 py-4">
        {/* Icon + name row */}
        <div className="flex items-start gap-3 mb-3">
          <NavigatorGlyph iconPath={entry.icon} size="sm" tone="primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-dao-text truncate">{entry.name}</h4>
              {isPlanned && (
                <span className="text-2xs font-medium px-1.5 py-0.5 rounded bg-dao-surface text-dao-text-hint uppercase tracking-wider flex-shrink-0">
                  Coming Soon
                </span>
              )}
            </div>
            <p className="text-xs text-dao-text-hint mt-0.5 line-clamp-2">{entry.description}</p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${PERMISSION_COLORS[entry.permissionLabel] || PERMISSION_COLORS.None}`}>
            {entry.permissionLabel}
          </span>
          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${PATTERN_COLORS[entry.pattern] || 'bg-dao-surface/50 text-dao-text-hint'}`}>
            {entry.pattern}
          </span>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-1">
          {entry.features.slice(0, 4).map((feature) => (
            <span key={feature} className="text-2xs text-dao-text-hint bg-dao-dark-3 rounded px-1.5 py-0.5">
              {feature}
            </span>
          ))}
          {entry.features.length > 4 && (
            <span className="text-2xs text-dao-text-hint bg-dao-dark-3 rounded px-1.5 py-0.5">
              +{entry.features.length - 4} more
            </span>
          )}
        </div>

        {/* Warning text */}
        {entry.warningText && (
          <p className="text-2xs text-amber-400/80 mt-2">{entry.warningText}</p>
        )}

        {/* Action */}
        {!isPlanned && (
          <div className="mt-3 pt-3 border-t border-dao-border">
            <span className="text-xs text-primary-400 font-medium">
              Deploy &amp; Propose &rarr;
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DeployConfigPanel - Configuration form for deploying a shipped navigator
// ═══════════════════════════════════════════════════════════════════════════

function DeployConfigPanel({
  entry,
  daoAddress,
  onBack,
}: {
  entry: NavigatorCatalogEntry
  daoAddress: string
  onBack: () => void
}) {
  const navigate = useNavigate()
  const { data: dao } = useDao(daoAddress)
  const [onboarderForm, setOnboarderForm] = useState<OnboarderFormState>(DEFAULT_ONBOARDER)
  const [erc20Form, setERC20Form] = useState<ERC20TributeFormState>(DEFAULT_ERC20)
  const [nftForm, setNFTForm] = useState<NFTGatedFormState>(DEFAULT_NFT)
  const [signalForm, setSignalForm] = useState<SignalFormState>(DEFAULT_SIGNAL)
  const [timelockForm, setTimelockForm] = useState<TimelockFormState>(DEFAULT_TIMELOCK)
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionFormState>(DEFAULT_SUBSCRIPTION)
  // VestingNavigator's constructor takes only metadata (schedules are created later via
  // governance), so it needs no type-specific config form — just name/description.
  const [vestingForm, setVestingForm] = useState<Record<string, string>>({ navigatorName: '', navigatorDescription: '' })
  // BudgetNavigator's constructor takes only metadata too (budgets are created later via
  // governance, after the module is enabled on the vault) — no caps/allowlist/expiry apply.
  const [budgetForm, setBudgetForm] = useState<Record<string, string>>({ navigatorName: '', navigatorDescription: '' })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [ackFreeMint, setAckFreeMint] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  const updateOnboarder = (patch: Partial<OnboarderFormState>) => {
    setOnboarderForm((prev) => ({ ...prev, ...patch }))
  }
  const updateERC20 = (patch: Partial<ERC20TributeFormState>) => {
    setERC20Form((prev) => ({ ...prev, ...patch }))
  }
  const updateNFT = (patch: Partial<NFTGatedFormState>) => {
    setNFTForm((prev) => ({ ...prev, ...patch }))
  }
  const updateSignal = (patch: Partial<SignalFormState>) => {
    setSignalForm((prev) => ({ ...prev, ...patch }))
  }
  const updateVesting = (patch: Partial<Record<CommonFieldKey, string>>) => {
    setVestingForm((prev) => ({ ...prev, ...patch }))
  }
  const updateBudget = (patch: Partial<Record<CommonFieldKey, string>>) => {
    setBudgetForm((prev) => ({ ...prev, ...patch }))
  }
  const updateTimelock = (patch: Partial<TimelockFormState>) => {
    setTimelockForm((prev) => ({ ...prev, ...patch }))
  }
  const updateSubscription = (patch: Partial<SubscriptionFormState>) => {
    setSubscriptionForm((prev) => ({ ...prev, ...patch }))
  }

  // Read-only (Signal), metadata-only (Vesting), governance-safety (Timelock), and
  // recurring (Subscription) navigators skip the shared membership-style "Advanced
  // Settings" (caps/expiry/allowlist) — they have their own config forms.
  const isSignal = entry.type === 'SignalNavigator'
  const isVesting = entry.type === 'VestingNavigator'
  const isTimelock = entry.type === 'TimelockNavigator'
  const isSubscription = entry.type === 'SubscriptionNavigator'
  const isBudget = entry.type === 'BudgetNavigator'

  // Generic accessors for the fields every form state shares. Signal/Vesting only share
  // the metadata fields (name/description); the cap/expiry/allowlist keys never apply.
  const getCommon = (field: CommonFieldKey): string => {
    if (entry.type === 'OnboarderNavigator') return onboarderForm[field]
    if (entry.type === 'ERC20TributeNavigator') return erc20Form[field]
    if (isSignal) {
      if (field === 'navigatorName' || field === 'navigatorDescription') return signalForm[field]
      return ''
    }
    if (isVesting) {
      if (field === 'navigatorName' || field === 'navigatorDescription') return vestingForm[field] ?? ''
      return ''
    }
    if (isTimelock) {
      if (field === 'navigatorName' || field === 'navigatorDescription') return timelockForm[field]
      return ''
    }
    if (isSubscription) {
      if (field === 'navigatorName' || field === 'navigatorDescription') return subscriptionForm[field]
      return ''
    }
    if (isBudget) {
      if (field === 'navigatorName' || field === 'navigatorDescription') return budgetForm[field] ?? ''
      return ''
    }
    return nftForm[field]
  }
  const updateCommon = (patch: Partial<Record<CommonFieldKey, string>>) => {
    if (entry.type === 'OnboarderNavigator') updateOnboarder(patch)
    else if (entry.type === 'ERC20TributeNavigator') updateERC20(patch)
    else if (isSignal) updateSignal(patch)
    else if (isVesting) updateVesting(patch)
    else if (isTimelock) updateTimelock(patch)
    else if (isSubscription) {
      const p: Partial<SubscriptionFormState> = {}
      if (patch.navigatorName !== undefined) p.navigatorName = patch.navigatorName
      if (patch.navigatorDescription !== undefined) p.navigatorDescription = patch.navigatorDescription
      updateSubscription(p)
    }
    else if (isBudget) updateBudget(patch)
    else updateNFT(patch)
  }

  // ── C-02: free-mint governance caveat ───────────────────────────────────
  // Free-mint mode lets any gate-NFT holder mint shares at zero cost, which voids
  // the minRetentionPercent ragequit-as-veto (see SECURITY_GUIDE M-01). Warn always;
  // require explicit acknowledgement when this DAO actually relies on retention.
  const isNFT = entry.type === 'NFTGatedNavigator'
  const isFreeMint = isNFT && nftForm.tributeMode === 'free'
  const daoUsesRetention = safeBigInt(dao?.min_retention_percent) > 0n
  const needsFreeMintAck = isFreeMint && daoUsesRetention
  const blockedByAck = needsFreeMintAck && !ackFreeMint

  const handleDeploy = useCallback(async () => {
    setDeployError(null)
    setDeployedAddress(null)
    setIsDeploying(true)
    try {
      let address: string
      if (entry.type === 'OnboarderNavigator') {
        const obAllowlist = parseAllowlistInput(onboarderForm.allowlistAddresses)
        if (obAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) {
          throw new Error(`Allowlist exceeds ${MAX_ALLOWLIST_ADDRESSES} addresses`)
        }
        const obTree = buildAllowlistTree(obAllowlist.addresses)

        address = await navigatorDeployService.deployOnboarderNavigator({
          daoShipAddress: daoAddress,
          mode: onboarderForm.mode,
          shareMultiplier: BigInt(onboarderForm.shareMultiplier || '0'),
          lootMultiplier: BigInt(onboarderForm.lootMultiplier || '0'),
          pricePerUnit: parseTokenAmount(onboarderForm.pricePerUnit || '0'),
          sharesPerUnit: parseTokenAmount(onboarderForm.sharesPerUnit || '0'),
          lootPerUnit: parseTokenAmount(onboarderForm.lootPerUnit || '0'),
          minTribute: parseTokenAmount(onboarderForm.minTribute || '0'),
          expiry: onboarderForm.expiry ? BigInt(onboarderForm.expiry) : 0n,
          mintCap: onboarderForm.mintCap ? parseTokenAmount(onboarderForm.mintCap) : 0n,
          perAddressCap: onboarderForm.perAddressCap
            ? parseTokenAmount(onboarderForm.perAddressCap)
            : 0n,
          allowlistRoot: obTree?.root,
          name: onboarderForm.navigatorName,
          description: onboarderForm.navigatorDescription,
        })

        if (obTree) {
          const treeDump = obTree.dump()
          try {
            await posterService.postNavigatorAllowlist({
              daoAddress: daoAddress.toLowerCase(),
              navigatorAddress: address.toLowerCase(),
              root: obTree.root,
              addresses: obAllowlist.addresses,
              treeDump,
            })
          } catch (err) {
            console.error('[NavigatorCatalog] Failed to post onboarder allowlist:', err)
            downloadAllowlistBackup(address, obTree.root, obAllowlist.addresses, treeDump)
          }
        }
      } else if (entry.type === 'ERC20TributeNavigator') {
        // Verify the tribute token is a real ERC-20 on this network before the
        // immutable deploy — catches typos/EOAs/wrong-shard addresses early.
        const ercToken = erc20Form.tributeToken.trim()
        if (!isValidCyprus1Address(ercToken)) {
          throw new Error('Enter a valid tribute token address on this network')
        }
        const ercTokenMeta = await tokenService.verifyERC20(ercToken)
        if (!ercTokenMeta) {
          throw new Error('No ERC-20 token found at the tribute token address on this network.')
        }
        // pricePerShare/pricePerLoot are denominated in the TRIBUTE TOKEN, not in
        // shares — the contract's own example is `pricePerShare = 100e6` for 100 USDC.
        // These are immutable constructor args, so a wrong scale is unrecoverable
        // without a governance redeploy. Never fall back to 18.
        const ercDecimals = ercTokenMeta.decimals

        const ercAllowlist = parseAllowlistInput(erc20Form.allowlistAddresses)
        if (ercAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) {
          throw new Error(`Allowlist exceeds ${MAX_ALLOWLIST_ADDRESSES} addresses`)
        }
        const ercTree = buildAllowlistTree(ercAllowlist.addresses)

        address = await navigatorDeployService.deployERC20TributeNavigator({
          daoShipAddress: daoAddress,
          tributeToken: erc20Form.tributeToken,
          pricePerShare: parseTokenAmount(erc20Form.pricePerShare || '0', ercDecimals),
          pricePerLoot: parseTokenAmount(erc20Form.pricePerLoot || '0', ercDecimals),
          expiry: erc20Form.expiry ? BigInt(erc20Form.expiry) : 0n,
          mintCap: erc20Form.mintCap ? parseTokenAmount(erc20Form.mintCap) : 0n,
          perAddressCap: erc20Form.perAddressCap
            ? parseTokenAmount(erc20Form.perAddressCap)
            : 0n,
          allowlistRoot: ercTree?.root,
          name: erc20Form.navigatorName,
          description: erc20Form.navigatorDescription,
        })

        if (ercTree) {
          const treeDump = ercTree.dump()
          try {
            await posterService.postNavigatorAllowlist({
              daoAddress: daoAddress.toLowerCase(),
              navigatorAddress: address.toLowerCase(),
              root: ercTree.root,
              addresses: ercAllowlist.addresses,
              treeDump,
            })
          } catch (err) {
            console.error('[NavigatorCatalog] Failed to post ERC20 tribute allowlist:', err)
            downloadAllowlistBackup(address, ercTree.root, ercAllowlist.addresses, treeDump)
          }
        }
      } else if (entry.type === 'NFTGatedNavigator') {
        const shares = parseTokenAmount(nftForm.sharesPerHolder || '0')
        const loot = parseTokenAmount(nftForm.lootPerHolder || '0')
        const mintCap = parseTokenAmount(nftForm.mintCap || '0')
        const perAddressCap = nftForm.perAddressCap ? parseTokenAmount(nftForm.perAddressCap) : 0n
        const requireTribute = nftForm.tributeMode === 'tribute'
        const tributeAmount = requireTribute ? parseTokenAmount(nftForm.tributeAmount || '0') : 0n

        // Validation mirroring the constructor's InvalidConfig reverts (fail fast in the UI).
        // isValidCyprus1Address enforces the Quai shard prefix (0x00…), which a bare
        // hex regex would miss — catching a wrong-shard gate before the deploy tx.
        if (!isValidCyprus1Address(nftForm.gateToken.trim())) {
          throw new Error('Enter a valid gate token (ERC-721) address on this network')
        }
        if (shares + loot === 0n) {
          throw new Error('At least one of Shares or Loot per holder must be greater than 0')
        }
        if (requireTribute && tributeAmount === 0n) {
          throw new Error('Tribute mode requires a tribute amount greater than 0')
        }
        if (mintCap === 0n) {
          throw new Error('Mint cap is required and must be greater than 0')
        }
        if (shares + loot > mintCap) {
          throw new Error('Mint cap must be at least Shares + Loot per holder')
        }
        if (perAddressCap > 0n && perAddressCap < shares + loot) {
          throw new Error('Per-address cap must be 0 or at least Shares + Loot per holder')
        }
        if (blockedByAck) {
          throw new Error('Please acknowledge the free-mint governance risk before deploying')
        }

        // Verify the gate is actually a contract on this network before the
        // immutable deploy. 'unknown' = EOA/typo/unreadable; a real ERC-721
        // (or any contract responding to balanceOf) passes.
        const gateProbe = await navigatorDeployService.probeGateToken(nftForm.gateToken.trim())
        if (gateProbe === 'unknown') {
          throw new Error('No contract found at the gate token address on this network. Double-check the address.')
        }

        const nftAllowlist = parseAllowlistInput(nftForm.allowlistAddresses)
        if (nftAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) {
          throw new Error(`Allowlist exceeds ${MAX_ALLOWLIST_ADDRESSES} addresses`)
        }
        const nftTree = buildAllowlistTree(nftAllowlist.addresses)

        address = await navigatorDeployService.deployNFTGatedNavigator({
          daoShipAddress: daoAddress,
          gateToken: nftForm.gateToken.trim(),
          sharesPerHolder: shares,
          lootPerHolder: loot,
          requireTribute,
          tributeAmount,
          expiry: nftForm.expiry ? BigInt(nftForm.expiry) : 0n,
          mintCap,
          perAddressCap,
          allowlistRoot: nftTree?.root,
          name: nftForm.navigatorName,
          description: nftForm.navigatorDescription,
        })

        if (nftTree) {
          const treeDump = nftTree.dump()
          try {
            await posterService.postNavigatorAllowlist({
              daoAddress: daoAddress.toLowerCase(),
              navigatorAddress: address.toLowerCase(),
              root: nftTree.root,
              addresses: nftAllowlist.addresses,
              treeDump,
            })
          } catch (err) {
            console.error('[NavigatorCatalog] Failed to post NFT-gated allowlist:', err)
            downloadAllowlistBackup(address, nftTree.root, nftAllowlist.addresses, treeDump)
          }
        }
      } else if (entry.type === 'SignalNavigator') {
        const DAY = 86400
        const minDuration = Math.floor(parseFloat(signalForm.minDurationDays || '0') * DAY)
        const maxDuration = Math.floor(parseFloat(signalForm.maxDurationDays || '0') * DAY)
        const maxStartDelay = Math.floor(parseFloat(signalForm.maxStartDelayDays || '0') * DAY)

        // Validate against the constructor bounds (fail fast → avoid InvalidConfig revert).
        const parsed = signalNavigatorSchema.safeParse({
          minSharesToCreatePoll: signalForm.minSharesToCreatePoll || '0',
          minDuration,
          maxDuration,
          maxStartDelay,
        })
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Invalid SignalNavigator configuration')
        }

        address = await navigatorDeployService.deploySignalNavigator({
          daoShipAddress: daoAddress,
          minSharesToCreatePoll: parseTokenAmount(signalForm.minSharesToCreatePoll || '0'),
          minDuration: BigInt(minDuration),
          maxDuration: BigInt(maxDuration),
          maxStartDelay: BigInt(maxStartDelay),
          name: signalForm.navigatorName,
          description: signalForm.navigatorDescription,
        })
        // No setNavigators / allowlist — read-only navigator. It surfaces once the DAO
        // sanctions it via a `daoships.dao.navigators` governance proposal (see post-deploy CTA).
      } else if (entry.type === 'VestingNavigator') {
        // Metadata-only constructor; schedules are created later via governance. Must be
        // registered as MANAGER (post-deploy CTA) before any claim can mint.
        address = await navigatorDeployService.deployVestingNavigator({
          daoShipAddress: daoAddress,
          name: vestingForm.navigatorName ?? '',
          description: vestingForm.navigatorDescription ?? '',
        })
      } else if (entry.type === 'BudgetNavigator') {
        // Metadata-only constructor (no caps/allowlist/expiry — it never mints). Enabled on the
        // VAULT via a governance proposal (vault.enableModule), then budgets are created later.
        address = await navigatorDeployService.deployBudgetNavigator({
          daoShipAddress: daoAddress,
          name: budgetForm.navigatorName ?? '',
          description: budgetForm.navigatorDescription ?? '',
        })
      } else if (entry.type === 'TimelockNavigator') {
        const DAY = 86400
        const delay = Math.floor(parseFloat(timelockForm.delayDays || '0') * DAY)
        const expiryWindow = Math.floor(parseFloat(timelockForm.expiryWindowDays || '0') * DAY)
        const parsed = timelockNavigatorSchema.safeParse({ delay, expiryWindow })
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Invalid TimelockNavigator configuration')
        }
        address = await navigatorDeployService.deployTimelockNavigator({
          daoShipAddress: daoAddress,
          delay: BigInt(delay),
          expiryWindow: BigInt(expiryWindow),
          name: timelockForm.navigatorName,
          description: timelockForm.navigatorDescription,
        })
        // Registered as GOVERNOR (4) via the post-deploy CTA (entry.permission).
      } else if (entry.type === 'SubscriptionNavigator') {
        const DAY = 86400
        // Build the accepted-token fee menu (blank address = native QUAI; no duplicates;
        // each fee parsed at the token's real decimals so on-chain values are correct).
        const rows = subscriptionForm.tokens.filter((r) => r.fee.trim() !== '')
        if (rows.length === 0) throw new Error('Add at least one accepted token and fee.')
        const seen = new Set<string>()
        const tokens: string[] = []
        const feesPerPeriod: bigint[] = []
        for (const r of rows) {
          const isNative = r.address.trim() === ''
          const addr = isNative ? quais.ZeroAddress : r.address.trim()
          if (!isNative && !isValidCyprus1Address(addr)) throw new Error(`Invalid token address: ${addr}`)
          const key = addr.toLowerCase()
          if (seen.has(key)) throw new Error('Duplicate token in the fee menu.')
          seen.add(key)
          const decimals = isNative ? 18 : await tokenService.getDecimals(addr).catch(() => 18)
          const fee = parseTokenAmount(r.fee, decimals)
          if (fee <= 0n) throw new Error('Each per-period fee must be greater than zero.')
          tokens.push(addr)
          feesPerPeriod.push(fee)
        }

        const periodDuration = Math.floor(parseFloat(subscriptionForm.periodDays || '0') * DAY)
        const graceDuration = Math.floor(parseFloat(subscriptionForm.graceDays || '0') * DAY)
        const collectorRewardBps = Math.round(parseFloat(subscriptionForm.rewardPct || '0') * 100)
        const parsed = subscriptionNavigatorSchema.safeParse({ periodDuration, graceDuration, collectorRewardBps })
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Invalid SubscriptionNavigator configuration')
        }

        // Initial members get one complimentary period at deploy.
        const initialMembers = subscriptionForm.initialMembers
          .split(/[\s,]+/)
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
        for (const m of initialMembers) {
          if (!isValidCyprus1Address(m)) throw new Error(`Invalid initial member address: ${m}`)
        }

        address = await navigatorDeployService.deploySubscriptionNavigator({
          daoShipAddress: daoAddress,
          tokens,
          feesPerPeriod,
          periodDuration: BigInt(periodDuration),
          graceDuration: BigInt(graceDuration),
          startTime: 0n,
          collectorRewardBps: BigInt(collectorRewardBps),
          burnOnCollect: subscriptionForm.burnOnCollect,
          initialMembers,
          name: subscriptionForm.navigatorName,
          description: subscriptionForm.navigatorDescription,
        })
        // Registered as MANAGER (2) via the post-deploy CTA (entry.permission).
      } else {
        throw new Error(`Unknown navigator type: ${entry.type}`)
      }


      setDeployedAddress(address)
    } catch (e: unknown) {
      setDeployError(e instanceof Error ? e.message : 'Deployment failed')
    } finally {
      setIsDeploying(false)
    }
  }, [entry.type, daoAddress, onboarderForm, erc20Form, nftForm, signalForm, vestingForm, timelockForm, subscriptionForm, budgetForm, blockedByAck])

  return (
    <div className="space-y-5">
      {/* Back button + title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-dao-text-hint hover:text-dao-text transition-colors p-1"
          aria-label="Back to catalog"
        >
          <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <NavigatorGlyph iconPath={entry.icon} size="sm" tone="primary" />
          <div>
            <h3 className="text-base font-semibold text-dao-text">{entry.name}</h3>
            <p className="text-xs text-dao-text-hint">{entry.description}</p>
          </div>
        </div>
      </div>

      {/* Feature list */}
      <div className="flex flex-wrap gap-1.5">
        {entry.features.map((feature) => (
          <span key={feature} className="text-xs text-dao-text-muted bg-dao-dark-3 rounded px-2 py-1">
            {feature}
          </span>
        ))}
      </div>

      {/* Config form */}
      {/* Navigator metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Navigator Name</label>
          <input
            type="text"
            value={getCommon('navigatorName')}
            onChange={(e) => updateCommon({ navigatorName: e.target.value })}
            placeholder="e.g. Open Onboarding"
            maxLength={64}
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">{getCommon('navigatorName').length}/64</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Description</label>
          <input
            type="text"
            value={getCommon('navigatorDescription')}
            onChange={(e) => updateCommon({ navigatorDescription: e.target.value })}
            placeholder="Short description of this navigator"
            maxLength={280}
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">{getCommon('navigatorDescription').length}/280</p>
        </div>
      </div>

      <Card header={<h3 className="text-sm font-semibold text-dao-text">Configuration</h3>}>
        <div className="space-y-5">
          {entry.type === 'OnboarderNavigator' && (
            <OnboarderConfigForm
              form={onboarderForm}
              update={updateOnboarder}
            />
          )}

          {entry.type === 'ERC20TributeNavigator' && (
            <ERC20ConfigForm
              form={erc20Form}
              update={updateERC20}
            />
          )}

          {entry.type === 'NFTGatedNavigator' && (
            <NFTGatedConfigForm
              form={nftForm}
              update={updateNFT}
            />
          )}

          {isSignal && (
            <SignalConfigForm
              form={signalForm}
              update={updateSignal}
            />
          )}

          {isVesting && (
            <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3">
              <p className="text-xs text-dao-text-hint">
                No configuration here — vesting <strong>schedules</strong> (beneficiary, amount, cliff,
                duration) are created later by governance proposals once the navigator is registered as
                MANAGER. Deploy it, register it, then create schedules from the navigator's page.
              </p>
            </div>
          )}

          {isTimelock && (
            <TimelockConfigForm
              form={timelockForm}
              update={updateTimelock}
              gracePeriodSeconds={dao?.grace_period ?? 0}
            />
          )}

          {isSubscription && (
            <SubscriptionConfigForm form={subscriptionForm} update={updateSubscription} />
          )}

          {isBudget && (
            <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3">
              <p className="text-xs text-dao-text-hint">
                No configuration here — a Budget navigator never mints, so it has no caps, allowlist,
                or expiry. It’s a <strong>treasury vault module</strong>: deploy it, then pass a
                governance proposal to <strong>enable it on the vault</strong>
                (<code>vault.enableModule</code>, not the DAOShip). Individual <strong>budgets</strong>
                (manager, allowance, ceiling, period) are created afterward by further proposals from
                the navigator’s page.
              </p>
            </div>
          )}

          {/* Advanced settings (shared) — membership-only (caps/expiry/allowlist). Not for read-only / metadata-only / safety / recurring / treasury-module navigators. */}
          {!isSignal && !isVesting && !isTimelock && !isSubscription && !isBudget && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-dao-text-muted hover:text-dao-text transition-colors"
            >
              <svg
                aria-hidden="true"
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-6 border-l-2 border-dao-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="catalog-mint-cap" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Mint Cap{isNFT && <span className="text-red-400"> *</span>}
                    </label>
                    <input
                      id="catalog-mint-cap"
                      type="text"
                      value={getCommon('mintCap')}
                      onChange={(e) => updateCommon({ mintCap: e.target.value })}
                      placeholder={isNFT ? 'Required, e.g. 1000' : '0'}
                      className="input w-full"
                    />
                    <p className="text-xs text-dao-text-hint mt-1">
                      {isNFT
                        ? 'Required. Max total shares + loot this navigator may ever mint.'
                        : '0 = unlimited'}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="catalog-addr-cap" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Per-Address Cap
                    </label>
                    <input
                      id="catalog-addr-cap"
                      type="text"
                      value={getCommon('perAddressCap')}
                      onChange={(e) => updateCommon({ perAddressCap: e.target.value })}
                      placeholder="0"
                      className="input w-full"
                    />
                    <p className="text-xs text-dao-text-hint mt-1">
                      {isNFT ? '0 = unlimited (per wallet — not anti-whale)' : '0 = unlimited'}
                    </p>
                  </div>
                </div>
                <div>
                  <label htmlFor="catalog-expiry" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                    Expiry Date
                  </label>
                  <input
                    id="catalog-expiry"
                    type="datetime-local"
                    value={(() => {
                      const val = getCommon('expiry')
                      return val ? new Date(Number(val) * 1000).toISOString().slice(0, 16) : ''
                    })()}
                    onChange={(e) => {
                      const expiry = e.target.value
                        ? String(Math.floor(new Date(e.target.value).getTime() / 1000))
                        : ''
                      updateCommon({ expiry })
                    }}
                    className="input w-full"
                  />
                  <p className="text-xs text-dao-text-hint mt-1">
                    When this navigator stops accepting new members. Leave empty for no expiry.
                  </p>
                </div>

                {/* Allowlist */}
                <AllowlistInput
                  value={getCommon('allowlistAddresses')}
                  onChange={(v) => updateCommon({ allowlistAddresses: v })}
                />
              </div>
            )}
          </div>
          )}

          {/* C-02: free-mint governance note */}
          {isFreeMint && (
            <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-dao-text">Free-mint mode and governance</p>
              <p className="text-xs text-dao-text-hint">
                In free-mint mode, anyone holding an NFT from the gate collection can mint governance
                shares for free. That's the intended behavior — open, no-cost membership for holders.
              </p>
              <p className="text-xs text-dao-text-hint">
                Because new shares can be minted at any time (including during an open vote), the
                ragequit veto can be diluted: <code>minRetentionPercent</code> assumes a roughly fixed
                share supply, so it can't guarantee a blocking minority when supply can grow on demand.
                This is fine when the gate collection is <strong>fixed-supply and held by people you
                trust</strong>; take extra care if it's openly mintable or controlled outside the DAO.
              </p>
              <p className="text-xs text-dao-text-hint">
                Ways to keep the veto meaningful: use <strong>tribute-required</strong> mode, gate on a
                fixed-supply collection you control, and/or <code>pause()</code> the navigator during
                contentious votes.
              </p>
              {needsFreeMintAck && (
                <label className="flex items-start gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={ackFreeMint}
                    onChange={(e) => setAckFreeMint(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
                  />
                  <span className="text-xs text-dao-text-secondary">
                    This DAO sets <code>minRetentionPercent</code> to{' '}
                    {Number(safeBigInt(dao?.min_retention_percent)) / 100}%. I understand free-mint means
                    that retention-based ragequit veto can be diluted, and I want to deploy in free-mint mode.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Deploy button + results */}
          {deployError && <p className="text-sm text-red-400">{deployError}</p>}

          {deployedAddress ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 space-y-2">
              <p className="text-sm text-emerald-400 font-medium">Navigator deployed successfully!</p>
              <p className="text-xs text-dao-text-secondary font-mono break-all">{deployedAddress}</p>
              <p className="text-xs text-dao-text-muted mt-2">
                {isSignal
                  ? 'This read-only navigator holds no permission. Its polls stay hidden until the DAO sanctions it via a governance proposal.'
                  : isBudget
                    ? 'This treasury module is inactive until the DAO enables it on the vault. Create a governance proposal calling vault.enableModule, then create budgets from the navigator’s page.'
                    : 'Create a governance proposal to register this navigator with the DAO.'}
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                onClick={() => {
                  if (isBudget) {
                    // Enable as a vault (Zodiac) module — on the avatar/vault, NOT the DAOShip.
                    if (dao?.avatar) {
                      navigate(buildBudgetProposalHref(daoAddress, buildEnableModuleAction(dao.avatar, deployedAddress)))
                    } else {
                      navigate(`/dao/${daoAddress}/proposals/new?type=custom`)
                    }
                    return
                  }
                  const params = isSignal
                    ? new URLSearchParams({ type: 'navigator-sanction', sanctionAddress: deployedAddress })
                    : new URLSearchParams({
                        type: 'navigator',
                        addAddress: deployedAddress,
                        addPermission: String(entry.permission),
                      })
                  navigate(`/dao/${daoAddress}/proposals/new?${params.toString()}`)
                }}
              >
                {isSignal ? 'Create Proposal to Sanction Navigator'
                  : isBudget ? 'Create Proposal to Enable Module'
                  : 'Create Proposal to Register Navigator'}
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleDeploy}
              loading={isDeploying}
              disabled={blockedByAck}
            >
              Deploy {entry.name}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OnboarderConfigForm - Form fields for OnboarderNavigator
// ═══════════════════════════════════════════════════════════════════════════

function OnboarderConfigForm({
  form,
  update,
}: {
  form: OnboarderFormState
  update: (patch: Partial<OnboarderFormState>) => void
}) {
  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-2">Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="catalog-ob-mode"
              checked={form.mode === 'multiplier'}
              onChange={() => update({ mode: 'multiplier' })}
              className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
            />
            <span className="text-sm text-dao-text-secondary">Multiplier</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="catalog-ob-mode"
              checked={form.mode === 'fixedPrice'}
              onChange={() => update({ mode: 'fixedPrice' })}
              className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
            />
            <span className="text-sm text-dao-text-secondary">Fixed Price</span>
          </label>
        </div>
      </div>

      {form.mode === 'multiplier' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="catalog-ob-share-mult" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Share Multiplier
              </label>
              <input
                id="catalog-ob-share-mult"
                type="text"
                value={form.shareMultiplier}
                onChange={(e) => update({ shareMultiplier: e.target.value })}
                placeholder="10000"
                className="input w-full"
              />
              <p className="text-xs text-dao-text-hint mt-1">Basis points: 10000 = 1x, 20000 = 2x</p>
            </div>
            <div>
              <label htmlFor="catalog-ob-loot-mult" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Loot Multiplier
              </label>
              <input
                id="catalog-ob-loot-mult"
                type="text"
                value={form.lootMultiplier}
                onChange={(e) => update({ lootMultiplier: e.target.value })}
                placeholder="0"
                className="input w-full"
              />
              <p className="text-xs text-dao-text-hint mt-1">0 = no loot issued</p>
            </div>
          </div>
          <div>
            <label htmlFor="catalog-ob-min" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Minimum Tribute (QUAI)
            </label>
            <input
              id="catalog-ob-min"
              type="text"
              value={form.minTribute}
              onChange={(e) => update({ minTribute: e.target.value })}
              placeholder="0.1"
              className="input w-full"
            />
          </div>
        </div>
      )}

      {form.mode === 'fixedPrice' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="catalog-ob-price" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Price Per Unit (QUAI)
            </label>
            <input
              id="catalog-ob-price"
              type="text"
              value={form.pricePerUnit}
              onChange={(e) => update({ pricePerUnit: e.target.value })}
              placeholder="1"
              className="input w-full"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="catalog-ob-spu" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Shares Per Unit
              </label>
              <input
                id="catalog-ob-spu"
                type="text"
                value={form.sharesPerUnit}
                onChange={(e) => update({ sharesPerUnit: e.target.value })}
                placeholder="1"
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="catalog-ob-lpu" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Loot Per Unit
              </label>
              <input
                id="catalog-ob-lpu"
                type="text"
                value={form.lootPerUnit}
                onChange={(e) => update({ lootPerUnit: e.target.value })}
                placeholder="0"
                className="input w-full"
              />
            </div>
          </div>
          <div>
            <label htmlFor="catalog-ob-min-fp" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
              Minimum Tribute (QUAI)
            </label>
            <input
              id="catalog-ob-min-fp"
              type="text"
              value={form.minTribute}
              onChange={(e) => update({ minTribute: e.target.value })}
              placeholder="0.1"
              className="input w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ERC20ConfigForm - Form fields for ERC20TributeNavigator
// ═══════════════════════════════════════════════════════════════════════════

function ERC20ConfigForm({
  form,
  update,
}: {
  form: ERC20TributeFormState
  update: (patch: Partial<ERC20TributeFormState>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="catalog-erc20-token" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Tribute Token Address
        </label>
        <input
          id="catalog-erc20-token"
          type="text"
          value={form.tributeToken}
          onChange={(e) => update({ tributeToken: e.target.value })}
          placeholder="0x..."
          className="input w-full font-mono text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="catalog-erc20-pps" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Price Per Share
          </label>
          <input
            id="catalog-erc20-pps"
            type="text"
            value={form.pricePerShare}
            onChange={(e) => update({ pricePerShare: e.target.value })}
            placeholder="1"
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="catalog-erc20-ppl" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Price Per Loot
          </label>
          <input
            id="catalog-erc20-ppl"
            type="text"
            value={form.pricePerLoot}
            onChange={(e) => update({ pricePerLoot: e.target.value })}
            placeholder="0"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">0 = loot not purchasable</p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SignalConfigForm - Form fields for SignalNavigator (read-only polls)
// ═══════════════════════════════════════════════════════════════════════════

function SignalConfigForm({
  form,
  update,
}: {
  form: SignalFormState
  update: (patch: Partial<SignalFormState>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="catalog-signal-minshares" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Minimum Shares to Create a Poll
        </label>
        <input
          id="catalog-signal-minshares"
          type="text"
          value={form.minSharesToCreatePoll}
          onChange={(e) => update({ minSharesToCreatePoll: e.target.value })}
          placeholder="0"
          className="input w-full"
        />
        <p className="text-xs text-dao-text-hint mt-1">
          Minimum voting power (shares) required to open a poll. 0 = anyone with any shares.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="catalog-signal-mindur" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Minimum Poll Duration (days)
          </label>
          <input
            id="catalog-signal-mindur"
            type="text"
            value={form.minDurationDays}
            onChange={(e) => update({ minDurationDays: e.target.value })}
            placeholder="1"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">Must be greater than 0.</p>
        </div>
        <div>
          <label htmlFor="catalog-signal-maxdur" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Maximum Poll Duration (days)
          </label>
          <input
            id="catalog-signal-maxdur"
            type="text"
            value={form.maxDurationDays}
            onChange={(e) => update({ maxDurationDays: e.target.value })}
            placeholder="30"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">≥ minimum, ≤ 3650 days.</p>
        </div>
      </div>

      <div>
        <label htmlFor="catalog-signal-startdelay" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Maximum Start Delay (days)
        </label>
        <input
          id="catalog-signal-startdelay"
          type="text"
          value={form.maxStartDelayDays}
          onChange={(e) => update({ maxStartDelayDays: e.target.value })}
          placeholder="7"
          className="input w-full"
        />
        <p className="text-xs text-dao-text-hint mt-1">
          How far in advance a poll may be scheduled. 0 = polls open immediately only (no scheduling).
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TimelockConfigForm - Form fields for TimelockNavigator (delay + expiry window)
// ═══════════════════════════════════════════════════════════════════════════

function TimelockConfigForm({
  form,
  update,
  gracePeriodSeconds,
}: {
  form: TimelockFormState
  update: (patch: Partial<TimelockFormState>) => void
  gracePeriodSeconds: number
}) {
  const DAY = 86400
  const delaySeconds = Math.floor(parseFloat(form.delayDays || '0') * DAY)
  const warnings = getTimelockWarnings(delaySeconds, gracePeriodSeconds)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="catalog-timelock-delay" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Delay (days)
          </label>
          <input
            id="catalog-timelock-delay"
            type="text"
            value={form.delayDays}
            onChange={(e) => update({ delayDays: e.target.value })}
            placeholder="2"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">
            How long a queued config change waits before it can execute. Min 10 minutes, max 30 days.
          </p>
        </div>
        <div>
          <label htmlFor="catalog-timelock-expiry" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Execution Window (days)
          </label>
          <input
            id="catalog-timelock-expiry"
            type="text"
            value={form.expiryWindowDays}
            onChange={(e) => update({ expiryWindowDays: e.target.value })}
            placeholder="7"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">
            How long a matured change stays executable before it expires. Min 1 hour, max 3650 days.
          </p>
        </div>
      </div>

      {(warnings.delayBelowRecommended || warnings.delayNotLongerThanGrace) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 space-y-1">
          {warnings.delayBelowRecommended && (
            <p className="text-xs text-amber-300">
              A delay under 2 days is a weak exit window — members may not have time to ragequit before a change lands.
            </p>
          )}
          {warnings.delayNotLongerThanGrace && (
            <p className="text-xs text-amber-300">
              The delay isn't longer than this DAO's grace period — for a reliable second ragequit window, set it longer.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SubscriptionConfigForm - Form fields for SubscriptionNavigator (fee menu + terms)
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionConfigForm({
  form,
  update,
}: {
  form: SubscriptionFormState
  update: (patch: Partial<SubscriptionFormState>) => void
}) {
  const setToken = (i: number, patch: Partial<SubscriptionTokenRow>) => {
    update({ tokens: form.tokens.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })
  }
  const addToken = () => update({ tokens: [...form.tokens, { address: '', fee: '' }] })
  const removeToken = (i: number) => update({ tokens: form.tokens.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-4">
      {/* Fee menu */}
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Accepted Tokens & Fees (per period)</label>
        <p className="text-xs text-dao-text-hint mb-2">
          Leave the address blank for native QUAI. Fees are in whole token units (resolved to the token's decimals at deploy). Immutable after deploy.
        </p>
        <div className="space-y-2">
          {form.tokens.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={t.address}
                onChange={(e) => setToken(i, { address: e.target.value })}
                placeholder="Token address (blank = native QUAI)"
                className="input flex-1 font-mono text-sm"
              />
              <input
                type="text"
                value={t.fee}
                onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setToken(i, { fee: e.target.value }) }}
                placeholder="Fee / period"
                className="input w-32 font-mono text-sm"
                inputMode="decimal"
              />
              {form.tokens.length > 1 && (
                <button type="button" onClick={() => removeToken(i)} className="text-xs text-red-400 hover:text-red-300 px-2">remove</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addToken} className="mt-2 text-sm text-primary-400 hover:text-primary-300">+ Add token</button>
      </div>

      {/* Terms */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="catalog-sub-period" className="block text-sm font-medium text-dao-text-secondary mb-1.5">Period (days)</label>
          <input id="catalog-sub-period" type="text" value={form.periodDays} onChange={(e) => update({ periodDays: e.target.value })} placeholder="30" className="input w-full" />
          <p className="text-xs text-dao-text-hint mt-1">Min 1 day, max ~3 years.</p>
        </div>
        <div>
          <label htmlFor="catalog-sub-grace" className="block text-sm font-medium text-dao-text-secondary mb-1.5">Grace (days)</label>
          <input id="catalog-sub-grace" type="text" value={form.graceDays} onChange={(e) => update({ graceDays: e.target.value })} placeholder="7" className="input w-full" />
          <p className="text-xs text-dao-text-hint mt-1">Window before a member is collectible.</p>
        </div>
        <div>
          <label htmlFor="catalog-sub-reward" className="block text-sm font-medium text-dao-text-secondary mb-1.5">Keeper Reward %</label>
          <input id="catalog-sub-reward" type="text" value={form.rewardPct} onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) update({ rewardPct: e.target.value }) }} placeholder="1" className="input w-full" />
          <p className="text-xs text-dao-text-hint mt-1">Loot reward on collection (0–100%).</p>
        </div>
      </div>

      {/* Enforcement mode */}
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">On lapse (enforcement)</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!form.burnOnCollect} onChange={() => update({ burnOnCollect: false })}
              className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0" />
            <span className="text-sm text-dao-text-secondary">Convert shares to loot (keep economic value)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={form.burnOnCollect} onChange={() => update({ burnOnCollect: true })}
              className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0" />
            <span className="text-sm text-dao-text-secondary">Burn shares</span>
          </label>
        </div>
      </div>

      {/* Initial members */}
      <div>
        <label htmlFor="catalog-sub-initial" className="block text-sm font-medium text-dao-text-secondary mb-1.5">Initial Members (optional)</label>
        <textarea
          id="catalog-sub-initial"
          value={form.initialMembers}
          onChange={(e) => update({ initialMembers: e.target.value })}
          placeholder="0x… addresses, one per line or comma-separated — each gets one complimentary period"
          className="input w-full min-h-[60px] resize-y font-mono text-sm"
          rows={2}
        />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// NFTGatedConfigForm - Form fields for NFTGatedNavigator
// ═══════════════════════════════════════════════════════════════════════════

function NFTGatedConfigForm({
  form,
  update,
}: {
  form: NFTGatedFormState
  update: (patch: Partial<NFTGatedFormState>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="catalog-nft-gate" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Gate Token Address (ERC-721)
        </label>
        <input
          id="catalog-nft-gate"
          type="text"
          value={form.gateToken}
          onChange={(e) => update({ gateToken: e.target.value })}
          placeholder="0x..."
          className="input w-full font-mono text-sm"
        />
        <p className="text-xs text-dao-text-hint mt-1">
          The ERC-721 collection whose holders may claim membership. Verify it points at the intended collection.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="catalog-nft-shares" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Shares Per Holder
          </label>
          <input
            id="catalog-nft-shares"
            type="text"
            value={form.sharesPerHolder}
            onChange={(e) => update({ sharesPerHolder: e.target.value })}
            placeholder="1"
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="catalog-nft-loot" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Loot Per Holder
          </label>
          <input
            id="catalog-nft-loot"
            type="text"
            value={form.lootPerHolder}
            onChange={(e) => update({ lootPerHolder: e.target.value })}
            placeholder="0"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">At least one of shares/loot must be &gt; 0</p>
        </div>
      </div>

      {/* Tribute mode toggle — makes the requireTribute/amount invariant unrepresentable-when-invalid */}
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-2">Claim Cost</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="catalog-nft-tribute-mode"
              checked={form.tributeMode === 'free'}
              onChange={() => update({ tributeMode: 'free', tributeAmount: '0' })}
              className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
            />
            <span className="text-sm text-dao-text-secondary">Free Mint</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="catalog-nft-tribute-mode"
              checked={form.tributeMode === 'tribute'}
              onChange={() => update({ tributeMode: 'tribute' })}
              className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
            />
            <span className="text-sm text-dao-text-secondary">Require Tribute</span>
          </label>
        </div>
      </div>

      {form.tributeMode === 'tribute' && (
        <div>
          <label htmlFor="catalog-nft-tribute" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Tribute Amount (QUAI)
          </label>
          <input
            id="catalog-nft-tribute"
            type="text"
            value={form.tributeAmount}
            onChange={(e) => update({ tributeAmount: e.target.value })}
            placeholder="0.1"
            className="input w-full"
          />
          <p className="text-xs text-dao-text-hint mt-1">
            Exact native QUAI required per claim, forwarded to the vault. Must be &gt; 0.
          </p>
        </div>
      )}
    </div>
  )
}
