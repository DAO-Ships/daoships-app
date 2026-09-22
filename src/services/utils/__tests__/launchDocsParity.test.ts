// ═══════════════════════════════════════════════════════════════════════════
// Cross-repo drift guards for the published launch path.
//
// This file used to assert that the launch tutorial repeated the 13-field type
// list as prose, because `@daoships/protocol` was a non-goal and an integrator
// had no codec to import — docs were the only copy, and prose copied from code
// drifts.
//
// That premise is gone. `@daoships/sdk` now exports INIT_PARAMS_TYPES and
// encodes the template itself, and the tutorial was rewritten around it: there
// is no hand-rolled type list left on the page to check, and no placeholder
// fields for a reader to fill in by hand.
//
// What can still drift is checked below: our codec against the one integrators
// actually import, and the version the tutorial tells them to install.
//
// Cross-repo, so each check skips when its sibling repo is not checked out
// beside this one. They run for anyone working locally, which is where both
// the docs and the SDK get edited.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { INIT_PARAMS_TYPES } from '../LaunchEncoder'

const SDK_LAUNCH = path.resolve(__dirname, '../../../../../daoships-sdk/src/launch.ts')
const SDK_PACKAGE = path.resolve(__dirname, '../../../../../daoships-sdk/package.json')
const DOC = path.resolve(
  __dirname,
  '../../../../../daoships-www/app/docs/developers/launch-from-typescript/page.mdx',
)

const sdkAvailable = fs.existsSync(SDK_LAUNCH) && fs.existsSync(SDK_PACKAGE)
const docAvailable = fs.existsSync(DOC) && fs.existsSync(SDK_PACKAGE)

describe.skipIf(!sdkAvailable)('published SDK encodes the same launch template', () => {
  it('exports the same 13 ABI types, in the same order', () => {
    const source = fs.readFileSync(SDK_LAUNCH, 'utf8')

    // The SDK writes the list inline inside Object.freeze([...]). Match from the
    // declaration to the first `]` — every type is a quoted literal, and
    // `address[]` contains a `]`, so slice on the closing bracket of the array
    // rather than the first one encountered.
    const decl = source.match(/export const INIT_PARAMS_TYPES\s*=\s*Object\.freeze\(\[(.*?)\]\s*as const\)/s)
    expect(decl, 'could not find INIT_PARAMS_TYPES in the SDK').toBeTruthy()

    const published = [...decl![1].matchAll(/'([a-z0-9[\]]+)'/g)].map((m) => m[1])

    expect(
      published,
      'The SDK\'s init-params layout has drifted from LaunchEncoder. An integrator '
      + 'using @daoships/sdk would build a template DAOShip.setUp cannot decode.',
    ).toEqual([...INIT_PARAMS_TYPES])
  })
})

describe.skipIf(!docAvailable)('published launch tutorial matches the SDK', () => {
  it('pins the version of @daoships/sdk that the SDK repo publishes', () => {
    const source = fs.readFileSync(DOC, 'utf8')
    const { version } = JSON.parse(fs.readFileSync(SDK_PACKAGE, 'utf8')) as { version: string }

    const pinned = [...source.matchAll(/@daoships\/sdk@([0-9a-zA-Z.-]+)/g)].map((m) => m[1])

    expect(pinned.length, 'the tutorial no longer pins an SDK version').toBeGreaterThan(0)
    expect(
      [...new Set(pinned)],
      'The tutorial installs an SDK version other than the one this repo publishes. '
      + 'A reader following it gets a different codec than the docs describe.',
    ).toEqual([version])
  })
})

describe.skipIf(sdkAvailable && docAvailable)('launch parity (partially skipped)', () => {
  it('reports what it could not check', () => {
    if (!sdkAvailable) console.warn(`[launch-parity] daoships-sdk not found at ${SDK_LAUNCH} — skipping codec check`)
    if (!docAvailable) console.warn(`[launch-parity] daoships-www not found at ${DOC} — skipping docs check`)
    expect(true).toBe(true)
  })
})
