import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalDetail layout guards — mobile behaviour must not regress.
//
// VotingSidebar was mounted TWICE (`hidden lg:block` + `lg:hidden`), so React mounted
// both and each ran its own 1-second countdown setInterval. The fix collapses them to
// one mount positioned by CSS grid, which requires two things to stay true:
//
//   1. The grid classes remain `lg:`-prefixed ONLY. Below lg the container is a plain
//      block, so the single sidebar renders in DOM order — after the content, exactly
//      where the old `lg:hidden` instance appeared. (That instance's `order-first` was
//      inert: `order` needs a flex/grid parent, and there is none below lg.)
//   2. Mobile voting actions keep coming from the fixed bottom bar, not the sidebar.
// ═══════════════════════════════════════════════════════════════════════════

const RAW = readFileSync(
  join(process.cwd(), 'src/pages/dao/ProposalDetail.tsx'),
  'utf8',
)

/**
 * Comments are stripped before the class assertions run: the file documents the old
 * `hidden lg:block` / `order-first` wrappers in prose, and a naive substring check would
 * match that explanation rather than real JSX.
 */
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('VotingSidebar is mounted exactly once', () => {
  it('has a single <VotingSidebar mount site', () => {
    expect(SRC.split('<VotingSidebar').length - 1).toBe(1)
  })

  it('no longer uses breakpoint-hidden duplicate wrappers', () => {
    expect(SRC).not.toMatch(/className="[^"]*hidden lg:block/)
    expect(SRC).not.toMatch(/className="[^"]*order-first/)
  })

  it('positions the single sidebar with explicit desktop grid placement', () => {
    expect(SRC).toContain('lg:col-start-2')
    expect(SRC).toContain('lg:row-start-1')
    // Sticky must be desktop-only; it was previously on a desktop-only wrapper.
    expect(SRC).toContain('lg:sticky')
  })

  it('pins the content column so the sidebar cannot reflow it', () => {
    expect(SRC).toContain('lg:col-start-1')
  })
})

describe('mobile layout is preserved', () => {
  it('keeps the grid desktop-only, so mobile stays plain block flow', () => {
    expect(SRC).toContain('lg:grid lg:grid-cols-[1fr,360px]')
    // A bare `grid`/`flex` on that container would change mobile stacking.
    expect(SRC).not.toMatch(/className=\{`\$\{isTerminal \? '' : '(grid|flex) /)
  })

  it('does not make the sidebar sticky on mobile', () => {
    // A mobile-sticky sidebar would cover content on small screens.
    expect(SRC).not.toMatch(/className="sticky top-4"/)
  })

  it('spaces the sidebar from the content column it is a sibling of', () => {
    // The left column's rhythm comes from `space-y-6`, which does not reach a sibling.
    // Without `mt-6` the sidebar butts directly against ProposalVotes below `lg`.
    const wrapper = SRC.match(/className="([^"]*lg:col-start-2[^"]*)"/)?.[1] ?? ''
    expect(wrapper).toContain('mt-6')
    // Desktop must reset it: the sidebar is row-start-1, so a top margin there would
    // drop it below the content it aligns with.
    expect(wrapper).toContain('lg:mt-0')
  })

  it('keeps the fixed bottom action bar that provides mobile voting', () => {
    expect(SRC).toContain('lg:hidden fixed bottom-0')
  })

  it('keeps the spacer that stops the bottom bar covering content', () => {
    expect(SRC).toContain('env(safe-area-inset-bottom)')
  })
})
