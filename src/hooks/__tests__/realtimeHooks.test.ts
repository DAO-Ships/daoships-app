import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// The nine realtime hooks were the same forty lines copy-pasted, and had already
// drifted twice:
//   - only four of nine debounced, so a vote sweep or reorg-tombstone wave fired one
//     refetch per row
//   - useRealtimeVotes invalidated ['votes', …], a key no query was registered under,
//     leaving that channel silently inert
//
// These are structural guarantees: they hold because the body now exists once. The
// assertions below fail if someone reintroduces a bespoke subscription.
// ═══════════════════════════════════════════════════════════════════════════

const HOOKS_DIR = join(process.cwd(), 'src/hooks')

const realtimeHooks = readdirSync(HOOKS_DIR)
  .filter((f) => f.startsWith('useRealtime') && f.endsWith('.ts') && f !== 'useRealtimeTable.ts')

describe('realtime hooks all delegate to useRealtimeTable', () => {
  it('finds the expected set of hooks', () => {
    expect(realtimeHooks).toHaveLength(9)
  })

  it.each(realtimeHooks)('%s uses the shared primitive', (file) => {
    const src = readFileSync(join(HOOKS_DIR, file), 'utf8')
    expect(src).toContain('useRealtimeTable')
  })

  it.each(realtimeHooks)('%s does not hand-roll a subscription', (file) => {
    const src = readFileSync(join(HOOKS_DIR, file), 'utf8')
    // A bespoke channel would reintroduce the drift this refactor removed.
    expect(src).not.toContain('.channel(')
    expect(src).not.toContain('postgres_changes')
    expect(src).not.toContain('removeChannel')
  })

  it.each(realtimeHooks)('%s stays small enough to read at a glance', (file) => {
    const lines = readFileSync(join(HOOKS_DIR, file), 'utf8').split('\n').length
    expect(lines).toBeLessThan(45)
  })
})

describe('the drift that motivated the extraction cannot recur', () => {
  it('debouncing is applied centrally, not per hook', () => {
    const shared = readFileSync(join(HOOKS_DIR, 'useRealtimeTable.ts'), 'utf8')
    expect(shared).toContain('useDebouncedCallback')

    // Previously five of nine omitted it entirely.
    for (const file of realtimeHooks) {
      expect(readFileSync(join(HOOKS_DIR, file), 'utf8')).not.toContain('useDebouncedCallback')
    }
  })

  it('subscribes to DELETE as well, since reorg tombstones arrive that way', () => {
    const shared = readFileSync(join(HOOKS_DIR, 'useRealtimeTable.ts'), 'utf8')
    expect(shared).toContain("event: '*'")
  })

  it('useRealtimeVotes targets the key useProposalVotes actually registers', () => {
    const votes = readFileSync(join(HOOKS_DIR, 'useRealtimeVotes.ts'), 'utf8')
    const query = readFileSync(join(HOOKS_DIR, 'useProposalVotes.ts'), 'utf8')
    expect(query).toContain("'proposalVotes'")
    expect(votes).toContain("'proposalVotes'")
    // The old, unregistered key.
    expect(votes).not.toMatch(/queryKeys:.*\['votes'/)
  })
})
