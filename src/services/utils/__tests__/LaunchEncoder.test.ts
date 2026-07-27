// ═══════════════════════════════════════════════════════════════════════════
// C3: the 13-field launch template, previously inline in a React hook with no
// validation and no test — while the 7-field governance blob it WRAPS has had a
// validating codec all along.
//
// Field order here is consensus-critical: DAOShip.setUp abi.decodes this blob,
// and a wrong count or order reverts during initialization with no clearer
// signal than a failed transaction. That exact bug has already happened on this
// project, on the smaller blob (governanceConfig 6 -> 7 fields).
//
// It is also the least recoverable place to be wrong. By the time the launch
// reverts, any navigators earlier in the pipeline are deployed and paid for.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import {
  INIT_PARAMS_TYPES,
  INIT_PARAMS_FIELDS,
  PLACEHOLDER_ADDRESS,
  encodeLaunchInitParams,
  decodeLaunchInitParams,
  validateLaunchInitParams,
  type LaunchInitParams,
} from '../LaunchEncoder'

const A = '0x001117dd3c8574bc34227074472fb64349d2c3e9'
const B = '0x002abA2592A1111b8EcfFcA98A7f30b8de30cA58'
const MULTISEND = '0x002ae8A47C2da497fe569AfCF0486410aA1093E0'
const GOV = quais.AbiCoder.defaultAbiCoder().encode(
  ['uint32', 'uint32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint32'],
  [604800, 259200, 0n, 2000n, 0n, 5000n, 604800],
)

function params(over: Partial<LaunchInitParams> = {}): LaunchInitParams {
  return {
    multisendLibrary: MULTISEND,
    governanceConfig: GOV,
    navigators: [],
    navigatorPermissions: [],
    initMembers: [A],
    initShareAmounts: [100n],
    initLootAmounts: [0n],
    guildTokens: [],
    pauseSharesOnLaunch: false,
    pauseLootOnLaunch: false,
    ...over,
  }
}

describe('the field list is a consensus-critical constant', () => {
  it('is exactly 13 fields', () => {
    // DAOShip.setUp decodes 13. Any change here is a contract-compatibility
    // change, not a refactor.
    expect(INIT_PARAMS_TYPES).toHaveLength(13)
    expect(INIT_PARAMS_FIELDS).toHaveLength(13)
  })

  it('pins the exact order', () => {
    expect([...INIT_PARAMS_TYPES]).toEqual([
      'address', 'address', 'address', 'address', 'bytes',
      'address[]', 'uint256[]', 'address[]', 'uint256[]', 'uint256[]',
      'address[]', 'bool', 'bool',
    ])
    expect([...INIT_PARAMS_FIELDS]).toEqual([
      'lootToken', 'sharesToken', 'avatar', 'multisendLibrary', 'governanceConfig',
      'navigators', 'navigatorPermissions', 'initMembers', 'initShareAmounts',
      'initLootAmounts', 'guildTokens', 'pauseSharesOnLaunch', 'pauseLootOnLaunch',
    ])
  })

  it('keeps names and types index-aligned', () => {
    expect(INIT_PARAMS_FIELDS).toHaveLength(INIT_PARAMS_TYPES.length)
  })
})

describe('encodeLaunchInitParams', () => {
  it('round-trips through decode', () => {
    const p = params({
      navigators: [A, B],
      navigatorPermissions: [2n, 4n],
      initMembers: [A, B],
      initShareAmounts: [100n, 50n],
      initLootAmounts: [0n, 25n],
      guildTokens: [A, B],
      pauseSharesOnLaunch: true,
    })
    const decoded = decodeLaunchInitParams(encodeLaunchInitParams(p))

    expect(decoded.navigatorPermissions).toEqual([2n, 4n])
    expect(decoded.initShareAmounts).toEqual([100n, 50n])
    expect(decoded.initLootAmounts).toEqual([0n, 25n])
    expect(decoded.pauseSharesOnLaunch).toBe(true)
    expect(decoded.pauseLootOnLaunch).toBe(false)
    expect(decoded.governanceConfig).toBe(GOV)
    expect(decoded.multisendLibrary).toBe(quais.getAddress(MULTISEND))
  })

  it('emits placeholders for the three fields the launcher overwrites', () => {
    const d = decodeLaunchInitParams(encodeLaunchInitParams(params()))
    expect(d.lootToken).toBe(PLACEHOLDER_ADDRESS)
    expect(d.sharesToken).toBe(PLACEHOLDER_ADDRESS)
    expect(d.avatar).toBe(PLACEHOLDER_ADDRESS)
  })

  it('nests the governance blob as bytes rather than splicing it', () => {
    // governanceConfig is field 4 and is itself ABI-encoded. Flattening it would
    // shift every subsequent field.
    const d = decodeLaunchInitParams(encodeLaunchInitParams(params()))
    const gov = quais.AbiCoder.defaultAbiCoder().decode(
      ['uint32', 'uint32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint32'],
      d.governanceConfig,
    )
    expect(Number(gov[0])).toBe(604800)
    expect(gov[3]).toBe(2000n)
  })

  it('produces a blob decodable by the exact contract type list', () => {
    // The real assurance: what setUp will do to it.
    expect(() => quais.AbiCoder.defaultAbiCoder()
      .decode([...INIT_PARAMS_TYPES], encodeLaunchInitParams(params()))).not.toThrow()
  })

  it('handles an empty DAO — no navigators, no guild tokens', () => {
    const d = decodeLaunchInitParams(encodeLaunchInitParams(params()))
    expect(d.navigators).toEqual([])
    expect(d.guildTokens).toEqual([])
  })
})

describe('validation — the checks that would otherwise be on-chain reverts', () => {
  it('rejects mismatched member parallel arrays (LengthMismatch)', () => {
    expect(() => encodeLaunchInitParams(params({ initShareAmounts: [100n, 50n] })))
      .toThrow(/same length/)
    expect(() => encodeLaunchInitParams(params({ initLootAmounts: [] })))
      .toThrow(/same length/)
  })

  it('rejects mismatched navigator arrays', () => {
    expect(() => encodeLaunchInitParams(params({ navigators: [A], navigatorPermissions: [] })))
      .toThrow(/navigators and navigatorPermissions/)
  })

  it('rejects unsorted guild tokens (TokensNotSorted)', () => {
    // The contract checks the ordering rather than sorting for you.
    expect(() => encodeLaunchInitParams(params({ guildTokens: [B, A] })))
      .toThrow(/ascending address order/)
  })

  it('rejects duplicate guild tokens', () => {
    expect(() => encodeLaunchInitParams(params({ guildTokens: [A, A] })))
      .toThrow(/ascending address order/)
  })

  it('accepts correctly sorted guild tokens', () => {
    expect(() => encodeLaunchInitParams(params({ guildTokens: [A, B] }))).not.toThrow()
  })

  it('rejects an empty governance config', () => {
    // The 6-vs-7-field version of this mistake caused a fatal abi.decode revert
    // during initialization; an empty blob is the same class of failure.
    expect(() => encodeLaunchInitParams(params({ governanceConfig: '0x' })))
      .toThrow(/governanceConfig is empty/)
  })

  it('validates without encoding, for callers that want to check first', () => {
    expect(() => validateLaunchInitParams(params({ guildTokens: [B, A] }))).toThrow()
    expect(() => validateLaunchInitParams(params())).not.toThrow()
  })
})
