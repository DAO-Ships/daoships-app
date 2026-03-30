// ═══════════════════════════════════════════════════════════════════════════
// Navigator Catalog - Registry of all navigator types (shipped + planned)
// ═══════════════════════════════════════════════════════════════════════════

export interface NavigatorCatalogEntry {
  type: string
  name: string
  icon: string         // SVG path data for a 24x24 viewBox
  shortDescription: string
  description: string
  permission: number
  permissionLabel: string
  pattern: 'membership' | 'vesting' | 'treasury' | 'safety' | 'information' | 'adaptive' | 'recurring'
  status: 'shipped' | 'planned'
  features: string[]
  warningText?: string
}

// ─── SVG icon path data (24x24 viewBox) ──────────────────────────────────

export const NAVIGATOR_ICONS: Record<string, string> = {
  // Coin - for native token tribute
  coin: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.5v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.65c.1 1.7 1.36 2.66 2.85 2.97V19h1.72v-1.67c1.52-.29 2.72-1.16 2.72-2.74 0-2.22-1.86-2.97-3.63-3.45z',
  // Token - for ERC20 tribute
  token: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  // Clock/Timelock
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
  // Wallet - for budget/treasury
  wallet: 'M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 00-2 2v8a2 2 0 002 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  // Chart bar - for signal/polls
  chartBar: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
  // Users - for delegate registry
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  // Shield - for circuit breaker / safety
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  // Key - for NFT gated
  key: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  // Zap - for oracle/adaptive
  zap: 'M7 2v11h3v9l7-12h-4l4-8z',
  // Signal - for information/polls
  signal: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  // Calendar - for subscription/recurring
  calendar: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z',
  // Lock - for vesting
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
}

// ─── Catalog entries ──────────────────────────────────────────────────────

export const NAVIGATOR_CATALOG: NavigatorCatalogEntry[] = [
  // ── Shipped ─────────────────────────────────────────────────────────────
  {
    type: 'OnboarderNavigator',
    name: 'Onboarder Navigator',
    icon: NAVIGATOR_ICONS.coin,
    shortDescription: 'Native QUAI tribute for membership',
    description: 'Accept native QUAI tribute for shares/loot',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'membership',
    status: 'shipped',
    features: [
      'Multiplier mode',
      'Fixed-price mode',
      'Mint caps',
      'Per-address caps',
      'Allowlists',
      'Expiry dates',
    ],
  },
  {
    type: 'ERC20TributeNavigator',
    name: 'ERC-20 Tribute Navigator',
    icon: NAVIGATOR_ICONS.token,
    shortDescription: 'ERC-20 token tribute for membership',
    description: 'Accept any ERC-20 token as tribute for shares/loot',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'membership',
    status: 'shipped',
    features: [
      'Any ERC-20 token',
      'User-specified amounts',
      'Mint caps',
      'Per-address caps',
      'Allowlists',
    ],
  },

  // ── Planned ─────────────────────────────────────────────────────────────
  {
    type: 'TimelockNavigator',
    name: 'Timelock Navigator',
    icon: NAVIGATOR_ICONS.clock,
    shortDescription: 'Mandatory delay on governance changes',
    description: 'Mandatory delay on governance parameter changes',
    permission: 3,
    permissionLabel: 'GOVERNOR',
    pattern: 'safety',
    status: 'planned',
    features: [
      'Configurable delay period',
      'Queued proposal execution',
      'Emergency cancel capability',
    ],
  },
  {
    type: 'BudgetNavigator',
    name: 'Budget Navigator',
    icon: NAVIGATOR_ICONS.wallet,
    shortDescription: 'Pre-approved spending budgets',
    description: 'Pre-approved spending budgets with payroll automation',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'treasury',
    status: 'planned',
    features: [
      'Spending budgets',
      'Payroll automation',
      'Multi-token support',
      'Period-based limits',
    ],
  },
  {
    type: 'SignalNavigator',
    name: 'Signal Navigator',
    icon: NAVIGATOR_ICONS.signal,
    shortDescription: 'Non-binding governance polls',
    description: 'Non-binding governance polls and temperature checks',
    permission: 0,
    permissionLabel: 'None',
    pattern: 'information',
    status: 'planned',
    features: [
      'Temperature checks',
      'Non-binding polls',
      'Weighted by shares',
      'Custom voting periods',
    ],
  },
  {
    type: 'DelegateRegistryNavigator',
    name: 'Delegate Registry Navigator',
    icon: NAVIGATOR_ICONS.users,
    shortDescription: 'On-chain delegate profiles',
    description: 'On-chain delegate profiles and discovery',
    permission: 0,
    permissionLabel: 'None',
    pattern: 'information',
    status: 'planned',
    features: [
      'Delegate profiles',
      'On-chain discovery',
      'Delegation history',
      'Performance metrics',
    ],
  },
  {
    type: 'NFTGatedNavigator',
    name: 'NFT-Gated Navigator',
    icon: NAVIGATOR_ICONS.key,
    shortDescription: 'Gate membership behind NFT ownership',
    description: 'Gate membership behind NFT ownership',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'membership',
    status: 'planned',
    features: [
      'ERC-721 support',
      'ERC-1155 support',
      'Collection-based gating',
      'Trait-based gating',
    ],
  },
  {
    type: 'VestingNavigator',
    name: 'Vesting Navigator',
    icon: NAVIGATOR_ICONS.lock,
    shortDescription: 'Time-locked share issuance',
    description: 'Time-locked share issuance with cliff and linear vesting',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'vesting',
    status: 'planned',
    features: [
      'Cliff periods',
      'Linear vesting',
      'Revocable grants',
      'Multiple beneficiaries',
    ],
  },
  {
    type: 'CircuitBreakerNavigator',
    name: 'Circuit Breaker Navigator',
    icon: NAVIGATOR_ICONS.shield,
    shortDescription: 'Auto-pause on anomalous activity',
    description: 'Auto-pause on anomalous activity',
    permission: 1,
    permissionLabel: 'ADMIN',
    pattern: 'safety',
    status: 'planned',
    features: [
      'Anomaly detection',
      'Auto-pause triggers',
      'Configurable thresholds',
      'Admin override',
    ],
    warningText: 'Requires ADMIN permission. Use with caution.',
  },
  {
    type: 'OracleNavigator',
    name: 'Oracle Navigator',
    icon: NAVIGATOR_ICONS.zap,
    shortDescription: 'Adaptive governance parameters',
    description: 'Adaptive governance parameter adjustment',
    permission: 3,
    permissionLabel: 'GOVERNOR',
    pattern: 'adaptive',
    status: 'planned',
    features: [
      'External data feeds',
      'Parameter adjustment',
      'Quorum adaptation',
      'Activity-based tuning',
    ],
  },
  {
    type: 'SubscriptionNavigator',
    name: 'Subscription Navigator',
    icon: NAVIGATOR_ICONS.calendar,
    shortDescription: 'Recurring membership fees',
    description: 'Recurring membership fees with auto-enforcement',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'recurring',
    status: 'planned',
    features: [
      'Recurring fees',
      'Auto-enforcement',
      'Grace periods',
      'Multi-tier membership',
    ],
  },
]

// ─── Grouped by pattern category ──────────────────────────────────────────

export interface CatalogGroup {
  label: string
  pattern: string[]
  entries: NavigatorCatalogEntry[]
}

/**
 * Get the catalog entry for a navigator type string (from navigatorType() on-chain).
 */
export function getCatalogEntry(navigatorType: string): NavigatorCatalogEntry | undefined {
  return NAVIGATOR_CATALOG.find(e => e.type === navigatorType)
}

/**
 * Get the SVG icon path for a navigator type. Falls back to a generic lightning bolt.
 */
export function getNavigatorIcon(navigatorType: string): string {
  const entry = getCatalogEntry(navigatorType)
  return entry?.icon || NAVIGATOR_ICONS.zap
}

export function getGroupedCatalog(): CatalogGroup[] {
  const groups: { label: string; patterns: string[] }[] = [
    { label: 'Membership', patterns: ['membership'] },
    { label: 'Safety & Governance', patterns: ['safety'] },
    { label: 'Treasury', patterns: ['treasury'] },
    { label: 'Community', patterns: ['information'] },
    { label: 'Advanced', patterns: ['vesting', 'adaptive', 'recurring'] },
  ]

  return groups
    .map((group) => ({
      label: group.label,
      pattern: group.patterns,
      entries: NAVIGATOR_CATALOG.filter((entry) =>
        group.patterns.includes(entry.pattern),
      ),
    }))
    .filter((group) => group.entries.length > 0)
}
