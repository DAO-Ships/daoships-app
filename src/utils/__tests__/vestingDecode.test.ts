import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import {
  buildCreateScheduleAction,
  buildRevokeScheduleAction,
  decodeVestingAction,
} from '@/utils/vestingProposals'

const NAV = '0x0000000000000000000000000000000000000abc'
const BENEFICIARY = '0x000000000000000000000000000000000000beef'

describe('decodeVestingAction', () => {
  it('round-trips a createSchedule action built by the app', () => {
    const params = {
      beneficiary: BENEFICIARY,
      totalAmount: quais.parseQuai('10000'),
      startTime: 0n,
      cliffDuration: BigInt(90 * 86400),
      vestingDuration: BigInt(365 * 86400),
      isLoot: false,
    }
    const action = buildCreateScheduleAction(NAV, params)
    const decoded = decodeVestingAction(action.data)

    expect(decoded?.kind).toBe('createSchedule')
    if (decoded?.kind !== 'createSchedule') throw new Error('wrong kind')
    expect(decoded.beneficiary.toLowerCase()).toBe(BENEFICIARY)
    expect(decoded.totalAmount).toBe(params.totalAmount)
    expect(decoded.startTime).toBe(0n)
    expect(decoded.cliffDuration).toBe(params.cliffDuration)
    expect(decoded.vestingDuration).toBe(params.vestingDuration)
    expect(decoded.isLoot).toBe(false)
  })

  it('captures isLoot=true and an absolute start time', () => {
    const start = 1_900_000_000n
    const action = buildCreateScheduleAction(NAV, {
      beneficiary: BENEFICIARY,
      totalAmount: quais.parseQuai('1'),
      startTime: start,
      cliffDuration: 0n,
      vestingDuration: BigInt(30 * 86400),
      isLoot: true,
    })
    const decoded = decodeVestingAction(action.data)
    if (decoded?.kind !== 'createSchedule') throw new Error('wrong kind')
    expect(decoded.isLoot).toBe(true)
    expect(decoded.startTime).toBe(start)
    expect(decoded.cliffDuration).toBe(0n)
  })

  it('decodes a revoke action', () => {
    const action = buildRevokeScheduleAction(NAV, 7n)
    const decoded = decodeVestingAction(action.data)
    expect(decoded?.kind).toBe('revoke')
    if (decoded?.kind !== 'revoke') throw new Error('wrong kind')
    expect(decoded.scheduleId).toBe(7n)
  })

  it('returns null for empty / unrecognized calldata', () => {
    expect(decodeVestingAction('0x')).toBeNull()
    expect(decodeVestingAction('')).toBeNull()
    expect(decodeVestingAction(undefined)).toBeNull()
    expect(decodeVestingAction('0xdeadbeef')).toBeNull()
  })
})
