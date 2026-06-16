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
  pattern: 'membership' | 'vesting' | 'treasury' | 'safety' | 'information' | 'recurring'
  status: 'shipped' | 'planned'
  features: string[]
  warningText?: string
}

// ─── SVG icon path data (24x24 viewBox, OUTLINE/stroke style) ─────────────
// Heroicons-v2 outline paths — rendered with fill="none" stroke="currentColor"
// strokeWidth={2} to match the app's nav icon language. Render via <NavigatorGlyph>.

export const NAVIGATOR_ICONS: Record<string, string> = {
  // Coin - for native token tribute (currency-dollar)
  coin: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  // Token - for ERC20 tribute (banknotes)
  token: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  // Clock/Timelock
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  // Wallet - for budget/treasury
  wallet: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3',
  // Chart bar - for signal/polls
  chartBar: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  // Users - generic group/registry icon (user-group)
  users: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  // Shield - for safety (shield-check)
  shield: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  // Key - for NFT gated
  key: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  // Zap - generic fallback icon (bolt)
  zap: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  // Signal - for information/polls (speaker-wave / broadcast)
  signal: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z',
  // Calendar - for subscription/recurring (calendar-days)
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  // Lock - for vesting (lock-closed)
  lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
}

// ─── Catalog entries ──────────────────────────────────────────────────────

export const NAVIGATOR_CATALOG: NavigatorCatalogEntry[] = [
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
  {
    type: 'NFTGatedNavigator',
    name: 'NFT-Gated Navigator',
    icon: NAVIGATOR_ICONS.key,
    shortDescription: 'Gate membership behind ERC-721 ownership',
    description: 'ERC-721 holders claim shares/loot — one claim per token, forever',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'membership',
    status: 'shipped',
    features: [
      'ERC-721 collection gating',
      'One claim per tokenId (anti-recycle)',
      'Free-mint or native tribute',
      'Mandatory mint cap',
      'Per-wallet cap, expiry, allowlist, pause',
    ],
    warningText: 'ERC-721 only. Shares are a claim ticket — they persist after the NFT is sold. Not revocable membership.',
  },
  {
    type: 'TimelockNavigator',
    name: 'Timelock Navigator',
    icon: NAVIGATOR_ICONS.clock,
    shortDescription: 'Delay governance-config changes',
    description: 'Queues setGovernanceConfig behind a mandatory delay — a second ragequit window for config changes.',
    permission: 4,
    permissionLabel: 'GOVERNOR',
    pattern: 'safety',
    status: 'shipped',
    features: [
      'Mandatory delay on governance-config changes',
      'Second ragequit window (members exit before it lands)',
      'Queued changes are visible and cancellable',
      'Permissionless execution once matured',
      'Emergency cancel-all + pause',
    ],
    warningText: 'Advisory, not enforced: a proposal can still bypass it via a direct config change. The app routes config changes through the timelock and warns on bypasses. Must hold GOVERNOR (4) — and be the only GOVERNOR navigator — for the guarantee to hold.',
  },
  {
    type: 'BudgetNavigator',
    name: 'Budget Navigator',
    icon: NAVIGATOR_ICONS.wallet,
    shortDescription: 'Recurring treasury budgets',
    description: 'Governance approves a recurring budget; a per-budget manager disburses treasury funds within a per-period allowance and a lifetime ceiling — no proposal per payment. Treasury-disbursement only (it never mints).',
    permission: 0,
    permissionLabel: 'Vault Module',
    pattern: 'treasury',
    status: 'shipped',
    features: [
      'Per-budget manager',
      'Per-period allowance (auto-resets, no keeper)',
      'Lifetime ceiling cap',
      'Native QUAI + any ERC-20',
      'Batch payroll disbursement',
      'Pause / cancel kill switches',
    ],
    warningText: 'Treasury access via vault module — NOT a DAOShip permission. Enabled by a governance proposal calling vault.enableModule (not setNavigators). All spending is bounded by the per-budget allowance + ceiling; a compromised manager is capped per period.',
  },
  {
    type: 'SignalNavigator',
    name: 'Signal Navigator',
    icon: NAVIGATOR_ICONS.signal,
    shortDescription: 'Non-binding governance polls',
    description: 'Share-weighted temperature-check polls — non-binding, no on-chain execution',
    permission: 0,
    permissionLabel: 'None',
    pattern: 'information',
    status: 'shipped',
    features: [
      'Share-weighted polls (loot excluded)',
      'Snapshot at poll start (anti vote-buying)',
      'Scheduled or immediate polls',
      '2–10 options, custom durations',
      'No permission — needs DAO sanction to surface',
    ],
    warningText: 'Non-binding & read-only. Polls surface only after the DAO sanctions this navigator via governance.',
  },
  {
    type: 'VestingNavigator',
    name: 'Vesting Navigator',
    icon: NAVIGATOR_ICONS.lock,
    shortDescription: 'Vest shares or loot on a cliff + linear schedule',
    description: 'Mints shares or loot to a beneficiary as they vest — cliff + linear, claimed incrementally (no escrow).',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'vesting',
    status: 'shipped',
    features: [
      'Cliff + linear vesting',
      'Shares OR loot per schedule',
      'Incremental minting on claim (no escrow)',
      'Beneficiary or governance can claim',
      'Non-destructive revoke (freezes accrual)',
    ],
    warningText: 'No escrow — unvested tokens carry no power until claimed. No global dilution cap: size totalAmount vs supply. Revoke freezes future accrual but does NOT claw back already-minted tokens. The navigator must keep MANAGER (2) or claims fail.',
  },
  {
    type: 'SubscriptionNavigator',
    name: 'Subscription Navigator',
    icon: NAVIGATOR_ICONS.calendar,
    shortDescription: 'Recurring membership dues',
    description: 'Members pull-pay periodic dues (native QUAI or ERC-20) to the treasury to keep their membership current. Past a grace window, anyone can collect a lapsed member — converting their shares to loot (default) or burning them — for a small keeper reward.',
    permission: 2,
    permissionLabel: 'MANAGER',
    pattern: 'recurring',
    status: 'shipped',
    features: [
      'Pull payment (no infinite approvals)',
      'Multi-token menu: native QUAI + ERC-20s',
      'Grace period + permissionless keeper collection',
      'Convert-to-loot (default) or burn enforcement',
      'Governance enrollment (one complimentary period)',
      'Pre-payment & pay-for-another supported',
    ],
    warningText: 'MANAGER permission: can convert/burn the shares of members past their grace window and mint a small loot keeper reward. The token menu, fees, period, grace, and enforcement mode are immutable — redeploy to change them. Collection can be blocked if removing a large member would breach the sponsor threshold.',
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
    { label: 'Advanced', patterns: ['vesting', 'recurring'] },
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
