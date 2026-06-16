import { describe, it, expect } from 'vitest'
import type { Navigator } from '@/types'
import { navigatorNeedsSanction, getNavigatorSanctionInfo, getNavigatorUnsanctionInfo, isPermissionManagedNavigator } from '@/utils/navigatorSanction'

const DAO_ID = '0x00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const VAULT = '0x00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const NAV = '0x00cccccccccccccccccccccccccccccccccccccc'

function makeNav(over: Partial<Navigator>): Navigator {
  return {
    id: `${DAO_ID}-${NAV}`,
    dao_id: DAO_ID,
    navigator_address: NAV,
    deployer: null,
    created_at: '2026-06-14T00:00:00Z',
    permission: 0,
    permission_label: 'None',
    permission_ever_granted: false,
    trust_status: 'self_asserted',
    is_active: true,
    paused: false,
    navigator_type: null,
    name: null,
    description: null,
    deploy_block: null,
    allowlist_root: null,
    ...over,
  } as Navigator
}

describe('navigatorNeedsSanction', () => {
  it('returns false for an unclassifiable (null type) navigator', () => {
    expect(navigatorNeedsSanction(makeNav({ navigator_type: null }))).toBe(false)
  })

  it('never invites sanctioning a fabricated (impersonation) navigator', () => {
    const nav = makeNav({ navigator_type: 'SignalNavigator', trust_status: 'fabricated' })
    expect(navigatorNeedsSanction(nav)).toBe(false)
  })

  describe('read-only (Signal)', () => {
    it('needs sanction while self_asserted', () => {
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'SignalNavigator', trust_status: 'self_asserted' }))).toBe(true)
    })
    it('does not need sanction once sanctioned', () => {
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'SignalNavigator', trust_status: 'sanctioned' }))).toBe(false)
    })
  })

  describe('permissioned', () => {
    it('a deployed-but-never-granted permissioned nav (permission 0) still needs sanction', () => {
      // Same runtime predicate as a read-only nav — classification must come from the catalog.
      const nav = makeNav({ navigator_type: 'OnboarderNavigator', permission: 0, trust_status: 'sanctioned' })
      expect(navigatorNeedsSanction(nav)).toBe(true)
    })
    it('does not need sanction once the MANAGER bit is held', () => {
      const nav = makeNav({ navigator_type: 'OnboarderNavigator', permission: 2, permission_ever_granted: true, trust_status: 'sanctioned' })
      expect(navigatorNeedsSanction(nav)).toBe(false)
    })
    it('Timelock needs the GOVERNOR bit (4), not MANAGER (2)', () => {
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'TimelockNavigator', permission: 2 }))).toBe(true)
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'TimelockNavigator', permission: 4 }))).toBe(false)
    })
  })

  describe('module (Budget)', () => {
    it('needs sanction until enabled (sanctioned trust AND active)', () => {
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'BudgetNavigator', trust_status: 'self_asserted', is_active: false }))).toBe(true)
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'BudgetNavigator', trust_status: 'sanctioned', is_active: false }))).toBe(true)
      expect(navigatorNeedsSanction(makeNav({ navigator_type: 'BudgetNavigator', trust_status: 'sanctioned', is_active: true }))).toBe(false)
    })
  })
})

describe('isPermissionManagedNavigator', () => {
  it('excludes a read-only (Signal) navigator — even when sanctioned', () => {
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: 'SignalNavigator', trust_status: 'sanctioned' }))).toBe(false)
  })

  it('excludes a vault-module (Budget) navigator', () => {
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: 'BudgetNavigator' }))).toBe(false)
  })

  it('includes permissioned navigators (even before they are granted)', () => {
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: 'OnboarderNavigator', permission: 0 }))).toBe(true)
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: 'TimelockNavigator', permission: 4 }))).toBe(true)
  })

  it('includes anything that ever held a permission (revoked permissioned nav)', () => {
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: 'SignalNavigator', permission: 0, permission_ever_granted: true }))).toBe(true)
  })

  it('includes unknown/custom types by default (so they stay revocable)', () => {
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: 'SomeCustomNavigator', permission: 2 }))).toBe(true)
    expect(isPermissionManagedNavigator(makeNav({ navigator_type: null, permission: 0 }))).toBe(true)
  })
})

describe('getNavigatorSanctionInfo', () => {
  it('returns null for an unclassifiable navigator', () => {
    expect(getNavigatorSanctionInfo(makeNav({ navigator_type: null }), { daoId: DAO_ID })).toBeNull()
  })

  it('read-only → navigator-sanction deep-link', () => {
    const info = getNavigatorSanctionInfo(makeNav({ navigator_type: 'SignalNavigator' }), { daoId: DAO_ID })
    expect(info?.sanctionClass).toBe('readonly')
    expect(info?.needsSanction).toBe(true)
    expect(info?.href).toBe(`/dao/${DAO_ID}/proposals/new?type=navigator-sanction&sanctionAddress=${NAV}`)
  })

  it('permissioned → setNavigators deep-link with the right bit + name', () => {
    const info = getNavigatorSanctionInfo(
      makeNav({ navigator_type: 'TimelockNavigator', name: 'My Timelock' }),
      { daoId: DAO_ID },
    )
    expect(info?.sanctionClass).toBe('permissioned')
    expect(info?.href).toBe(`/dao/${DAO_ID}/proposals/new?type=navigator&addAddress=${NAV}&addPermission=4&addName=My%20Timelock`)
    expect(info?.ctaLabel).toContain('GOVERNOR')
  })

  it('module → enableModule custom-action href when a vault is known', () => {
    const info = getNavigatorSanctionInfo(makeNav({ navigator_type: 'BudgetNavigator' }), { daoId: DAO_ID, vaultAddress: VAULT })
    expect(info?.sanctionClass).toBe('module')
    expect(info?.href).toContain('type=custom')
    expect(info?.href).toContain(`customTo=${VAULT}`)
  })

  it('module → null href when the vault address is not yet available', () => {
    const info = getNavigatorSanctionInfo(makeNav({ navigator_type: 'BudgetNavigator' }), { daoId: DAO_ID, vaultAddress: null })
    expect(info?.sanctionClass).toBe('module')
    expect(info?.href).toBeNull()
  })
})

describe('getNavigatorUnsanctionInfo', () => {
  it('returns a remove deep-link for a sanctioned read-only (Signal) navigator', () => {
    const info = getNavigatorUnsanctionInfo(makeNav({ navigator_type: 'SignalNavigator', trust_status: 'sanctioned' }), { daoId: DAO_ID })
    expect(info).not.toBeNull()
    expect(info?.href).toBe(`/dao/${DAO_ID}/proposals/new?type=navigator-sanction&sanctionAddress=${NAV}&sanctionMode=remove`)
    expect(info?.ctaLabel).toBe('Propose unsanctioning')
  })

  it('returns null for a read-only navigator that is not sanctioned (use the sanction path)', () => {
    expect(getNavigatorUnsanctionInfo(makeNav({ navigator_type: 'SignalNavigator', trust_status: 'self_asserted' }), { daoId: DAO_ID })).toBeNull()
  })

  it('returns null for permissioned and module navigators', () => {
    expect(getNavigatorUnsanctionInfo(makeNav({ navigator_type: 'OnboarderNavigator', permission: 2, trust_status: 'sanctioned' }), { daoId: DAO_ID })).toBeNull()
    expect(getNavigatorUnsanctionInfo(makeNav({ navigator_type: 'BudgetNavigator', trust_status: 'sanctioned', is_active: true }), { daoId: DAO_ID })).toBeNull()
  })
})
