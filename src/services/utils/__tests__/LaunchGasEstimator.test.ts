import { describe, it, expect } from 'vitest'
import { modelDeployGas, modelLaunchGas, modelPostGas } from '../LaunchGasEstimator'

// ═══════════════════════════════════════════════════════════════════════════
// The gas model is fitted to one real mainnet launch (Quai chain 9, DAO
// 0x001117dd…C3e9, blocks 9153192-9153206). These tests pin it to that
// measurement: the model must stay above the measured gas (an under-estimate
// would let a launch that runs out of QUAI through the affordability gate)
// without ballooning past it (an over-estimate blocks launches that would
// have succeeded).
// ═══════════════════════════════════════════════════════════════════════════

/** Model output must land in [measured, measured × 1.25]. */
function expectCalibrated(modeled: bigint, measured: number) {
  expect(Number(modeled)).toBeGreaterThanOrEqual(measured)
  expect(Number(modeled)).toBeLessThanOrEqual(measured * 1.25)
}

describe('LaunchGasEstimator gas model', () => {
  it('matches the measured OnboarderNavigator deploy (7235 code bytes)', () => {
    expectCalibrated(modelDeployGas('0x' + 'ab'.repeat(7235)), 1_426_553)
  })

  it('matches the measured ERC20TributeNavigator deploy (6043 code bytes)', () => {
    expectCalibrated(modelDeployGas('0x' + 'ab'.repeat(6043)), 1_219_292)
  })

  it('matches the measured launch tx (3 members, 2 guild tokens, 2 navigators, 3 vault owners)', () => {
    expectCalibrated(
      modelLaunchGas({
        memberCount: 3,
        guildTokenCount: 2,
        navigatorCount: 2,
        vaultOwnerCount: 3,
      }),
      1_500_465,
    )
  })

  it('matches the measured DAO profile post (~205 bytes of JSON)', () => {
    expectCalibrated(modelPostGas(205), 30_191)
  })

  it('scales with configuration size', () => {
    const small = modelLaunchGas({ memberCount: 1, guildTokenCount: 0, navigatorCount: 0, vaultOwnerCount: 1 })
    const large = modelLaunchGas({ memberCount: 20, guildTokenCount: 20, navigatorCount: 2, vaultOwnerCount: 5 })
    expect(large).toBeGreaterThan(small)
  })

  it('never returns zero for an empty configuration', () => {
    const gas = modelLaunchGas({ memberCount: 0, guildTokenCount: 0, navigatorCount: 0, vaultOwnerCount: 0 })
    expect(gas).toBeGreaterThan(0n)
  })
})
