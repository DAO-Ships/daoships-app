// ═══════════════════════════════════════════════════════════════════════════
// ContractMetadataService — ABI resolution from IPFS bytecode metadata
// ═══════════════════════════════════════════════════════════════════════════
//
// Resolution cascade:
//   1. In-memory cache (LRU, 200 entries)
//   2. Fetch bytecode via wallet provider
//   3. Detect EIP-1167 minimal proxy → recurse into implementation
//   4. Decode CBOR metadata → extract IPFS CID
//   5. Fetch Solidity metadata JSON from IPFS gateway
//   6. Parse ABI from metadata.output.abi
//   7. Detect EIP-1967 proxy (upgradeTo/implementation in ABI) → recurse
//   8. Fallback: Quaiscan explorer API
//   9. Fallback: null (manual paste or raw hex)
//
// All RPC calls go through baseService.getProvider() (wallet provider)
// due to CORS restrictions on direct RPC.
// ═══════════════════════════════════════════════════════════════════════════

import { decode, AuxdataStyle } from '@ethereum-sourcify/bytecode-utils'
import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { NETWORK_CONFIG } from '@/config/contracts'

const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.qu.ai'
const FETCH_TIMEOUT_MS = 10_000
const MAX_PROXY_DEPTH = 3
const MAX_RESPONSE_BYTES = 1_048_576 // 1MB

// IPFS CID validation: CIDv0 (Qm... base58) or CIDv1 (baf... base32).
// A malicious contract can embed any string in its CBOR metadata section —
// this guard prevents that string from being interpolated into a fetch URL.
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{51,63})$/

// ── Cache ────────────────────────────────────────────────────────────────

interface AbiCacheEntry {
  abi: quais.JsonFragment[] | null
  source: AbiSource | null
}

const abiCache = new Map<string, AbiCacheEntry>()
const MAX_CACHE = 200

function cacheSet(address: string, entry: AbiCacheEntry) {
  const key = address.toLowerCase()
  if (abiCache.size >= MAX_CACHE && !abiCache.has(key)) {
    const oldest = abiCache.keys().next().value!
    abiCache.delete(oldest)
  }
  abiCache.set(key, entry)
}

// ── Types ────────────────────────────────────────────────────────────────

export type AbiSource = 'ipfs' | 'explorer'

export interface AbiResult {
  abi: quais.JsonFragment[] | null
  source: AbiSource | null
}

// ── Contract Detection ───────────────────────────────────────────────────

/**
 * Check if an address is a deployed contract (has bytecode).
 */
export async function isContract(address: string): Promise<boolean> {
  const provider = baseService.getProvider()
  const code = await provider.getCode(quais.getAddress(address))
  return code !== '0x' && code !== '0x0' && code.length > 2
}

// ── ABI Fetching ─────────────────────────────────────────────────────────

/**
 * Resolve the ABI for a contract address.
 * Tries IPFS bytecode metadata first, then explorer API.
 */
export async function fetchAbi(address: string): Promise<AbiResult> {
  const key = address.toLowerCase()
  const cached = abiCache.get(key)
  if (cached) return cached

  // Try IPFS bytecode metadata (with proxy detection)
  const ipfsResult = await fetchAbiFromIpfs(address, 0)
  if (ipfsResult) {
    const entry: AbiCacheEntry = { abi: ipfsResult, source: 'ipfs' }
    cacheSet(key, entry)
    return entry
  }

  // Fallback: explorer API
  const explorerResult = await fetchAbiFromExplorer(address)
  if (explorerResult) {
    const entry: AbiCacheEntry = { abi: explorerResult, source: 'explorer' }
    cacheSet(key, entry)
    return entry
  }

  const entry: AbiCacheEntry = { abi: null, source: null }
  cacheSet(key, entry)
  return entry
}

// ── IPFS Metadata Resolution ─────────────────────────────────────────────

async function fetchAbiFromIpfs(address: string, depth: number): Promise<quais.JsonFragment[] | null> {
  if (depth >= MAX_PROXY_DEPTH) return null

  try {
    const provider = baseService.getProvider()
    const bytecode = await provider.getCode(quais.getAddress(address))
    if (!bytecode || bytecode === '0x' || bytecode.length < 4) return null

    // Check for EIP-1167 minimal proxy
    const implAddress = detectMinimalProxy(bytecode)
    if (implAddress) {
      return fetchAbiFromIpfs(implAddress, depth + 1)
    }

    // Decode CBOR metadata from bytecode
    const metadata = decode(bytecode, AuxdataStyle.SOLIDITY)
    if (!metadata?.ipfs) return null

    // Validate CID shape before using it in a URL — the CBOR blob is attacker-controlled.
    if (!CID_RE.test(metadata.ipfs)) {
      console.warn('[ContractMetadataService] Invalid IPFS CID in bytecode:', metadata.ipfs)
      return null
    }

    // Fetch metadata JSON from IPFS (encodeURIComponent as defense-in-depth)
    const url = `${IPFS_GATEWAY}/ipfs/${encodeURIComponent(metadata.ipfs)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null

    // Enforce byte limit on response body (don't trust Content-Length header alone)
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_BYTES) return null

    const body = await response.text()
    if (body.length > MAX_RESPONSE_BYTES) return null
    const metadataJson = JSON.parse(body)
    const abi = metadataJson?.output?.abi
    if (!Array.isArray(abi) || abi.length === 0) return null

    // Check if this looks like a proxy (has upgradeTo/implementation) → follow EIP-1967
    if (looksLikeProxy(abi) && depth < MAX_PROXY_DEPTH) {
      const implAddr = await getEip1967Implementation(address)
      if (implAddr) {
        const implAbi = await fetchAbiFromIpfs(implAddr, depth + 1)
        if (implAbi) return implAbi
      }
    }

    return abi
  } catch {
    return null
  }
}

// ── Explorer API Fallback ────────────────────────────────────────────────

async function fetchAbiFromExplorer(address: string): Promise<quais.JsonFragment[] | null> {
  try {
    const checksummed = quais.getAddress(address)
    const explorerBase = new URL('/api', NETWORK_CONFIG.blockExplorerUrl)
    explorerBase.searchParams.set('module', 'contract')
    explorerBase.searchParams.set('action', 'getabi')
    explorerBase.searchParams.set('address', checksummed)
    const url = explorerBase.toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null

    const data = await response.json()
    if (data.status !== '1' || !data.result) return null

    const abi = typeof data.result === 'string' ? JSON.parse(data.result) : data.result
    if (!Array.isArray(abi) || abi.length === 0) return null

    return abi
  } catch {
    return null
  }
}

// ── Proxy Detection ──────────────────────────────────────────────────────

/**
 * Detect EIP-1167 minimal proxy pattern in bytecode.
 * Returns the implementation address or null.
 */
function detectMinimalProxy(bytecode: string): string | null {
  const hex = bytecode.toLowerCase()
  // Standard EIP-1167: 363d3d373d3d3d363d73{20 bytes}5af43d82803e903d91602b57fd5bf3
  const prefix = '363d3d373d3d3d363d73'
  const suffix = '5af43d82803e903d91602b57fd5bf3'
  const idx = hex.indexOf(prefix)
  if (idx === -1) return null
  const addrStart = idx + prefix.length
  const addrHex = hex.slice(addrStart, addrStart + 40)
  if (addrHex.length !== 40) return null
  const afterAddr = hex.slice(addrStart + 40)
  if (!afterAddr.startsWith(suffix)) return null
  try {
    return quais.getAddress('0x' + addrHex)
  } catch {
    return null
  }
}

/**
 * Check if an ABI looks like a proxy contract.
 */
function looksLikeProxy(abi: quais.JsonFragment[]): boolean {
  const names = new Set(abi.filter((e) => e.type === 'function').map((e) => e.name))
  return names.has('upgradeTo') || names.has('upgradeToAndCall') || names.has('implementation')
}

/**
 * Read the EIP-1967 implementation storage slot.
 */
async function getEip1967Implementation(proxyAddress: string): Promise<string | null> {
  try {
    const provider = baseService.getProvider()
    // EIP-1967 implementation slot: bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
    const slot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
    const value = await provider.getStorage(quais.getAddress(proxyAddress), slot)
    if (!value || value === '0x' + '00'.repeat(32)) return null
    // Address is last 20 bytes of the 32-byte slot
    const addrHex = '0x' + value.slice(-40)
    return quais.getAddress(addrHex)
  } catch {
    return null
  }
}
