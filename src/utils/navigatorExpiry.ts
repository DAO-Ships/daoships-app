// Navigator types whose on-chain config carries an `expiry` field (unix seconds, 0 = never).
const EXPIRY_BEARING_TYPES = new Set(['OnboarderNavigator', 'ERC20TributeNavigator'])

export function navigatorTypeHasExpiry(type: string | null | undefined): boolean {
  return !!type && EXPIRY_BEARING_TYPES.has(type)
}

export function isNavigatorExpired(expiry: bigint | undefined | null): boolean {
  if (!expiry || expiry === 0n) return false
  return BigInt(Math.floor(Date.now() / 1000)) > expiry
}
