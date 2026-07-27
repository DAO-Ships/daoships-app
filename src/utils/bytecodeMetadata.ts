// ═══════════════════════════════════════════════════════════════════════════
// Solidity metadata (CBOR auxdata) → IPFS CIDv0
//
// quais.ContractFactory requires a valid 46-char CIDv0 for on-chain source
// verification. Those CIDs used to be hand-copied literals sitting next to the
// bytecode they describe, with a comment asking the next person to keep the two
// in sync. Update one without the other and the deploy is either rejected or
// verified against the wrong source — with nothing in CI to notice.
//
// Deriving from the bytecode removes the second copy entirely.
//
// NOTE: `@ethereum-sourcify/bytecode-utils` is a dependency and would be the
// obvious tool, but its `decode()` rejects every navigator artifact we ship with
// "Unsupported auxdata style" — with and without the 0x prefix. The layout below
// is the standard solc appendix and is parsed directly instead.
//
// Layout, at the very end of the creation bytecode:
//
//   … <cbor auxdata> <2-byte big-endian auxdata length>
//
// and within the auxdata, for solc's default IPFS metadata hash:
//
//   a2                          CBOR map, 2 entries
//   64 69706673                 text(4) "ipfs"
//   58 22 <34 bytes>            bytes(34) = multihash (0x1220 sha2-256 + 32B)
//   64 736f6c63                 text(4) "solc"
//   43 <3 bytes>                bytes(3) compiler version
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

/** CBOR key `"ipfs"` followed by `bytes(34)` — the multihash header. */
const IPFS_MARKER = '64697066735822'

/** sha2-256 multihash: 0x12 (fn) 0x20 (32-byte digest) + 32 bytes = 34 bytes. */
const MULTIHASH_BYTES = 34

/**
 * Extract the IPFS CIDv0 from a contract's compiled bytecode.
 *
 * @param bytecode - Creation bytecode, 0x-prefixed or not.
 * @returns The `Qm…` CIDv0, or null when the bytecode carries no IPFS metadata
 *          (e.g. compiled with `bytecodeHash: "none"`, or a bzzr appendix).
 */
export function extractIpfsCid(bytecode: string): string | null {
  const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode
  if (hex.length < 8 || !/^[0-9a-fA-F]+$/.test(hex)) return null

  // Trailing 2 bytes are the auxdata length, in bytes.
  const auxLenBytes = parseInt(hex.slice(-4), 16)
  if (!Number.isFinite(auxLenBytes) || auxLenBytes <= 0) return null

  const auxStart = hex.length - 4 - auxLenBytes * 2
  if (auxStart < 0) return null

  const aux = hex.slice(auxStart, hex.length - 4).toLowerCase()

  const markerAt = aux.indexOf(IPFS_MARKER)
  if (markerAt < 0) return null

  const digestStart = markerAt + IPFS_MARKER.length
  const digest = aux.slice(digestStart, digestStart + MULTIHASH_BYTES * 2)
  if (digest.length !== MULTIHASH_BYTES * 2) return null

  try {
    return quais.encodeBase58('0x' + digest)
  } catch {
    return null
  }
}

/**
 * Like {@link extractIpfsCid}, but throws rather than returning null.
 *
 * Deploy paths use this: quais.ContractFactory rejects a missing or malformed
 * CID anyway, and failing here names the contract instead of surfacing an opaque
 * factory error after the user has already approved.
 */
export function requireIpfsCid(bytecode: string, contractName: string): string {
  const cid = extractIpfsCid(bytecode)
  if (!cid) {
    throw new Error(
      `Could not derive an IPFS CID from ${contractName} bytecode. `
      + 'The artifact may have been compiled without IPFS metadata.',
    )
  }
  return cid
}
