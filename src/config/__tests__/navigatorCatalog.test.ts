import { describe, it, expect } from 'vitest'
import { NAVIGATOR_CATALOG, getGroupedCatalog } from '@/config/navigatorCatalog'

describe('NAVIGATOR_CATALOG', () => {
  it('all entries have required fields', () => {
    for (const entry of NAVIGATOR_CATALOG) {
      expect(entry.type).toBeTruthy()
      expect(entry.name).toBeTruthy()
      expect(entry.icon).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(typeof entry.permission).toBe('number')
      expect(['shipped', 'planned']).toContain(entry.status)
    }
  })

  it('all shipped entries have status shipped', () => {
    const shipped = NAVIGATOR_CATALOG.filter((e) => e.status === 'shipped')
    for (const entry of shipped) {
      expect(entry.status).toBe('shipped')
    }
  })

  it('all planned entries have status planned', () => {
    const planned = NAVIGATOR_CATALOG.filter((e) => e.status === 'planned')
    for (const entry of planned) {
      expect(entry.status).toBe('planned')
    }
  })

  it('permission values are valid (0, 1, 2, 3, or 4)', () => {
    const validPermissions = [0, 1, 2, 3, 4]
    for (const entry of NAVIGATOR_CATALOG) {
      expect(validPermissions).toContain(entry.permission)
    }
  })

  it('single-permission labels match the bitmask (ADMIN=1, MANAGER=2, GOVERNOR=4)', () => {
    // Guards against the Timelock/Oracle bug where GOVERNOR was set to 3 (ADMIN|MANAGER).
    const LABEL_BIT: Record<string, number> = { ADMIN: 1, MANAGER: 2, GOVERNOR: 4 }
    for (const entry of NAVIGATOR_CATALOG) {
      const bit = LABEL_BIT[entry.permissionLabel]
      if (bit === undefined) continue // 'None' / 'Vault Module' are not single-permission labels
      expect(entry.permission).toBe(bit)
    }
  })

  it('has at least 2 shipped navigators', () => {
    const shipped = NAVIGATOR_CATALOG.filter((e) => e.status === 'shipped')
    expect(shipped.length).toBeGreaterThanOrEqual(2)
  })

  it('SignalNavigator is shipped and read-only (no permission)', () => {
    const signal = NAVIGATOR_CATALOG.find((e) => e.type === 'SignalNavigator')
    expect(signal).toBeDefined()
    expect(signal?.status).toBe('shipped')
    expect(signal?.permission).toBe(0)
  })

  it('every entry has a non-empty icon path', () => {
    for (const entry of NAVIGATOR_CATALOG) {
      expect(entry.icon).toBeTruthy()
      expect(entry.icon.length).toBeGreaterThan(0)
    }
  })
})

describe('getGroupedCatalog', () => {
  it('returns non-empty groups', () => {
    const groups = getGroupedCatalog()
    expect(groups.length).toBeGreaterThan(0)
  })

  it('every group has a label and at least one entry', () => {
    const groups = getGroupedCatalog()
    for (const group of groups) {
      expect(group.label).toBeTruthy()
      expect(group.entries.length).toBeGreaterThan(0)
    }
  })

  it('all catalog entries are accounted for in groups', () => {
    const groups = getGroupedCatalog()
    const groupedEntries = groups.flatMap((g) => g.entries)
    // Every catalog entry should appear in some group
    for (const entry of NAVIGATOR_CATALOG) {
      expect(groupedEntries).toContainEqual(entry)
    }
  })
})
