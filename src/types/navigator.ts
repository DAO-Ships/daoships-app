// ═══════════════════════════════════════════════════════════════════════════
// Navigator Types - matches ds_navigators and ds_navigator_events tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Numeric navigator permission levels.
 * These map to the bitmask values used in the DAOShip contract.
 *
 * Bit 0 = Admin, Bit 1 = Manager, Bit 2 = Governor
 */
export enum NavigatorPermission {
  None = 0,
  AdminOnly = 1,
  ManagerOnly = 2,
  AdminAndManager = 3,
  GovernorOnly = 4,
  AdminAndGovernor = 5,
  ManagerAndGovernor = 6,
  All = 7,
}

/**
 * String labels matching the `ds_navigator_permission` PostgreSQL enum.
 */
export type NavigatorPermissionLabel =
  | 'none'
  | 'admin'
  | 'manager'
  | 'admin_manager'
  | 'governor'
  | 'admin_governor'
  | 'manager_governor'
  | 'all'

/**
 * Map from numeric permission to its label.
 */
export const NAVIGATOR_PERMISSION_LABELS: Record<NavigatorPermission, NavigatorPermissionLabel> = {
  [NavigatorPermission.None]: 'none',
  [NavigatorPermission.AdminOnly]: 'admin',
  [NavigatorPermission.ManagerOnly]: 'manager',
  [NavigatorPermission.AdminAndManager]: 'admin_manager',
  [NavigatorPermission.GovernorOnly]: 'governor',
  [NavigatorPermission.AdminAndGovernor]: 'admin_governor',
  [NavigatorPermission.ManagerAndGovernor]: 'manager_governor',
  [NavigatorPermission.All]: 'all',
}

/**
 * Represents a navigator as stored in ds_navigators.
 */
export interface Navigator {
  /** Composite key: `${dao_id}-${navigator_address}` */
  id: string
  dao_id: string
  navigator_address: string

  created_at: string

  permission: number
  permission_label: NavigatorPermissionLabel

  is_active: boolean
  paused: boolean

  navigator_type: string | null
  name: string | null
  description: string | null

  tx_hash: string
}

/**
 * Represents a navigator event as stored in ds_navigator_events.
 * Events include onboard actions from navigator contracts.
 */
export interface NavigatorEvent {
  id: string
  dao_id: string
  navigator_address: string
  event_type: string
  contributor: string
  shares_minted: string
  loot_minted: string
  amount: string
  metadata: Record<string, unknown> | null

  created_at: string
  tx_hash: string
  block_number: string
}
