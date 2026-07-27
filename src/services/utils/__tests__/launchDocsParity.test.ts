// ═══════════════════════════════════════════════════════════════════════════
// The published launch tutorial duplicates the 13-field type list as prose.
//
// That duplication is the point of this test. `@daoships/protocol` is an
// explicit non-goal, so an external integrator cannot import our codec — they
// copy the list out of docs/developers/launch-from-typescript. Their launch is
// therefore only as correct as that page, and prose copied from code drifts.
//
// This session alone produced two live examples of exactly that: the docs
// carried two non-functional RPC URLs, and a complete Orchard address set
// belonging to a deployment nobody uses.
//
// Cross-repo, so it skips when daoships-www is not checked out beside this one —
// the same reason the ABI-vs-artifacts check was dropped from the deployment
// gates. It runs for anyone working locally, which is where the docs get edited.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { INIT_PARAMS_TYPES } from '../LaunchEncoder'

const DOC = path.resolve(
  __dirname,
  '../../../../../daoships-www/app/docs/developers/launch-from-typescript/page.mdx',
)

const available = fs.existsSync(DOC)

describe.skipIf(!available)('published launch tutorial matches the codec', () => {
  const source = available ? fs.readFileSync(DOC, 'utf8') : ''

  it('documents the same 13 ABI types, in the same order', () => {
    // The tutorial writes the list inline on one line. Match the LINE rather
    // than a bracketed region — `address[]` contains a `]`, so a non-greedy
    // `[^\]]*?` terminates inside the first array type and silently reads a
    // truncated list.
    const line = source.split('\n').find((l) => /^\s*\["address"/.test(l))
    expect(line, 'could not find the type list in the tutorial').toBeDefined()

    const documented = [...line!.matchAll(/"([a-z0-9[\]]+)"/g)].map((m) => m[1])

    expect(
      documented,
      'The tutorial\'s field list has drifted from LaunchEncoder. An integrator copying '
      + 'from the docs would build a template DAOShip.setUp cannot decode.',
    ).toEqual([...INIT_PARAMS_TYPES])
  })

  it('still tells readers the first three fields are launcher-filled placeholders', () => {
    // If this wording disappears, someone will pass real addresses and wonder
    // why they are ignored.
    expect(source).toMatch(/filled by launcher|placeholder/i)
  })
})

describe.skipIf(available)('docs parity (skipped)', () => {
  it('reports why it could not run', () => {
    console.warn(`[docs-parity] daoships-www not found at ${DOC} — skipping`)
    expect(true).toBe(true)
  })
})
