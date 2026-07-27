// ═══════════════════════════════════════════════════════════════════════════
// CREATE2 prediction — the pure math behind salt mining
//
// Extracted from SaltMiner (private method) and saltMiner.worker (inline), where
// it was duplicated and untestable. Salt mining is the one computation whose
// failure mode is silent and expensive: predict the wrong address and the launch
// deploys somewhere else, or reverts on a shard-prefix check, after the user has
// already paid for the navigator deploys that ran first.
//
// Three details decide correctness, and all three are easy to get wrong:
//
//   1. The salt SENDER is DAOShipAndVaultLauncher, never the user's EOA. The
//      launcher is msg.sender to both factories at deploy time
//      (DAOShipAndVaultLauncher.sol passes address(this)).
//
//   2. The two factories pack salts DIFFERENTLY:
//        QuaiVaultFactory  keccak256(abi.encodePacked(address, bytes32))
//        DAOShipLauncher   keccak256(abi.encodePacked(address, uint256))
//      Same user salt, different full salt, different address.
//
//   3. Shares/Loot/DAOShip are ERC-1167 minimal proxies of their singletons; the
//      vault is a QuaiVaultProxy whose initCodeHash embeds constructor args —
//      including the PREDICTED DAOShip address. That dependency is why mining is
//      two-phase and cannot be collapsed.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

/**
 * How a factory derives its CREATE2 salt from (sender, userSalt).
 *
 * `bytes32` — QuaiVaultFactory. `uint256` — DAOShipLauncher.
 */
export type SaltPacking = 'bytes32' | 'uint256'

// ERC-1167 minimal proxy CREATION code, with the implementation address spliced
// in between. The runtime code (what ends up on chain) drops the first 10 bytes.
const MINIMAL_PROXY_PREFIX = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73'
const MINIMAL_PROXY_SUFFIX = '5af43d82803e903d91602b57fd5bf3'

/**
 * ERC-1167 minimal proxy creation bytecode for a given implementation.
 *
 * The address is spliced in raw and lowercased — this is bytecode, not an ABI
 * argument, so a checksummed string would change the bytes and therefore the
 * predicted address.
 */
export function minimalProxyBytecode(singleton: string): string {
  const addr = singleton.toLowerCase().replace('0x', '')
  if (addr.length !== 40) {
    throw new Error(`minimalProxyBytecode: expected a 20-byte address, got "${singleton}"`)
  }
  return MINIMAL_PROXY_PREFIX + addr + MINIMAL_PROXY_SUFFIX
}

/** initCodeHash for an ERC-1167 clone of `singleton`. */
export function minimalProxyInitCodeHash(singleton: string): string {
  return quais.keccak256(minimalProxyBytecode(singleton))
}

/**
 * Derive the full CREATE2 salt a factory will use.
 *
 * @param sender    The address that is `msg.sender` to the factory — the
 *                  LAUNCHER for a launch flow, not the user's wallet.
 * @param userSalt  32-byte hex salt chosen by the miner.
 * @param packing   Which factory's packing rule applies.
 */
export function packSalt(sender: string, userSalt: string, packing: SaltPacking): string {
  if (packing === 'bytes32') {
    return quais.keccak256(quais.solidityPacked(['address', 'bytes32'], [sender, userSalt]))
  }
  return quais.keccak256(
    quais.solidityPacked(['address', 'uint256'], [sender, BigInt(userSalt)]),
  )
}

/**
 * Predict a CREATE2 address end to end.
 *
 * @param factory      The deploying contract (QuaiVaultFactory or DAOShipLauncher).
 * @param sender       `msg.sender` to that factory — see packSalt.
 * @param userSalt     32-byte hex salt.
 * @param initCodeHash keccak256 of the full creation code.
 * @param packing      The factory's salt packing rule.
 */
export function predictCreate2Address(
  factory: string,
  sender: string,
  userSalt: string,
  initCodeHash: string,
  packing: SaltPacking,
): string {
  return quais.getCreate2Address(factory, packSalt(sender, userSalt, packing), initCodeHash)
}

/**
 * True when an address is usable on Cyprus-1.
 *
 * Both halves are required: the `0x00` byte prefix places it in the zone, and
 * `isQuaiAddress` rejects values that carry the prefix but are not valid Quai
 * addresses. This is the predicate salt mining searches for, at roughly 1 in 256.
 */
export function isCyprus1Address(address: string): boolean {
  return address.toLowerCase().startsWith('0x00') && quais.isQuaiAddress(address)
}
