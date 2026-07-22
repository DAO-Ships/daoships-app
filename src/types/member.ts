// ═══════════════════════════════════════════════════════════════════════════
// Member Types - matches ds_members table
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents a DAO member as stored in ds_members.
 */
export interface Member {
  /** Composite key: `${dao_id}-${member_address}` */
  id: string
  dao_id: string
  member_address: string

  created_at: string

  shares: string
  loot: string

  delegating_to?: string | null
  /** Delegated share voting power */
  voting_power?: string

  votes?: number

  last_activity_at?: string | null
  updated_at?: string | null
}

/**
 * Represents a delegation event as stored in ds_delegations.
 */
export interface DelegationEvent {
  id: number
  dao_id: string
  delegator: string
  from_delegate: string
  to_delegate: string
  created_at: string
  tx_hash: string
}

/**
 * Extended member type that includes delegation context.
 * Used when displaying a member alongside who delegates to them.
 */
export interface MemberWithDelegation extends Member {
  /** Addresses that have delegated their shares to this member */
  delegators: string[]
  /** Total voting power: own shares + delegated shares */
  total_voting_power: string
}
