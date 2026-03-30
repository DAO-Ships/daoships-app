// ═══════════════════════════════════════════════════════════════════════════
// DAO Types - matches ds_daos and ds_guild_tokens tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents a DAO (Decentralized Autonomous Organization) as stored in ds_daos.
 * The `id` is the DAOShip contract address.
 */
export interface Dao {
  /** DAOShip contract address (VARCHAR 42) */
  id: string
  created_at: string
  updated_at?: string
  tx_hash: string

  // Token contract addresses
  loot_address: string
  shares_address: string
  /** Vault / treasury address */
  avatar: string

  /** Factory/deployer address that launched this DAO (NOT NULL in schema) */
  launcher: string
  /** Whether a new vault was created during launch */
  new_vault: boolean

  // Token pause state
  loot_paused: boolean
  shares_paused: boolean

  // Governance configuration (BIGINT → number in JS)
  grace_period: number
  voting_period: number
  /** Generated column: voting_period + grace_period */
  voting_plus_grace_duration: number
  proposal_offering: string
  quorum_percent: string
  sponsor_threshold: string
  min_retention_percent: string
  /** Default proposal expiration window in seconds */
  default_expiry_window: number

  // Token metadata
  share_token_name?: string
  share_token_symbol?: string
  loot_token_name?: string
  loot_token_symbol?: string

  // Aggregate counts (BIGINT → number in JS)
  total_shares: string
  total_loot: string
  latest_sponsored_proposal_id: number
  proposal_count: number
  active_member_count: number

  // Lock flags
  admin_locked: boolean
  manager_locked: boolean
  governor_locked: boolean

  // Metadata (set via Poster records)
  name?: string
  description?: string
  avatar_img?: string

  /** Origin of DAO profile: 'launcher' | 'vault' | null */
  profile_source: string | null
}

/**
 * Governance configuration subset extracted from Dao for convenience.
 */
export interface DaoConfig {
  voting_period: number
  grace_period: number
  proposal_offering: string
  quorum_percent: string
  sponsor_threshold: string
  min_retention_percent: string
  default_expiry_window: number
}

/**
 * Represents a guild token as stored in ds_guild_tokens.
 * These are the ERC-20 tokens the DAO treasury accepts for ragequit.
 */
export interface GuildToken {
  /** Composite key: `${dao_id}-${token_address}` */
  id: string
  dao_id: string
  token_address: string
  enabled: boolean
  created_at: string
  tx_hash: string
}

/**
 * Represents a ragequit event as stored in ds_ragequits.
 */
export interface Ragequit {
  id: string
  dao_id: string
  member_address: string
  to_address: string
  shares_burned: string
  loot_burned: string
  tokens: string[]
  amounts: string[]
  created_at: string
  tx_hash: string
  block_number: string
}

/**
 * Extract the governance config from a full Dao object.
 */
export function extractDaoConfig(dao: Dao): DaoConfig {
  return {
    voting_period: dao.voting_period,
    grace_period: dao.grace_period,
    proposal_offering: dao.proposal_offering,
    quorum_percent: dao.quorum_percent,
    sponsor_threshold: dao.sponsor_threshold,
    min_retention_percent: dao.min_retention_percent,
    default_expiry_window: dao.default_expiry_window,
  }
}
