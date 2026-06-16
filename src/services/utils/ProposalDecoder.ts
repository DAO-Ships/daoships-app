// ═══════════════════════════════════════════════════════════════════════════
// Proposal Action Decoder
//
// Decodes MultiSend proposal_data hex back into human-readable actions.
// Inverse of ProposalEncoder — used to display actions to voters.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { CONTRACT_ADDRESSES } from '@/config/contracts'
import { decodeGovernanceConfig, type GovernanceConfig } from './GovernanceEncoder'

const DAOSHIP_INTERFACE = new quais.Interface([
  'function mintShares(address[] to, uint256[] amount)',
  'function burnShares(address[] from, uint256[] amount)',
  'function mintLoot(address[] to, uint256[] amount)',
  'function burnLoot(address[] from, uint256[] amount)',
  'function setGovernanceConfig(bytes _governanceConfig)',
  'function setNavigators(address[] _navigators, uint256[] _permissions)',
  'function setGuildTokens(address[] _tokens, bool[] _enabled)',
  'function executeAsGovernance(address _to, uint256 _value, bytes _data)',
])

const ERC20_INTERFACE = new quais.Interface([
  'function transfer(address to, uint256 amount)',
])

const POSTER_INTERFACE = new quais.Interface([
  'function post(string content, string tag)',
])

// TimelockNavigator avatar-only actions. queueChange carries the SAME governance-config blob as
// DAOShip.setGovernanceConfig, so we decode it into the actual parameters too.
const TIMELOCK_INTERFACE = new quais.Interface([
  'function queueChange(bytes _governanceConfig)',
  'function cancelChange(uint256 changeId)',
  'function emergencyCancelAll()',
])

/** Serialize a decoded governance config for an action's `details` (bigints → strings). */
function govConfigToDetails(c: GovernanceConfig): Record<string, unknown> {
  return {
    votingPeriod: c.votingPeriod,
    gracePeriod: c.gracePeriod,
    proposalOffering: c.proposalOffering.toString(),
    quorumPercent: c.quorumPercent.toString(),
    sponsorThreshold: c.sponsorThreshold.toString(),
    minRetentionPercent: c.minRetentionPercent.toString(),
    defaultExpiryWindow: c.defaultExpiryWindow,
  }
}

/**
 * A decoded human-readable action from a proposal.
 */
export interface DecodedAction {
  type: 'transfer' | 'mintShares' | 'burnShares' | 'mintLoot' | 'burnLoot'
    | 'setGovernanceConfig' | 'queueGovernanceConfig' | 'setNavigators' | 'setGuildTokens'
    | 'posterPost' | 'custom'
  label: string
  details: Record<string, unknown>
}

/**
 * Parse packed MultiSend transactions from binary data.
 */
function parseMultiSendTxs(packedHex: string): Array<{ operation: number; to: string; value: bigint; data: string }> {
  const bytes = quais.getBytes(packedHex)
  const txs: Array<{ operation: number; to: string; value: bigint; data: string }> = []
  let offset = 0

  while (offset < bytes.length) {
    if (offset + 85 > bytes.length) break

    const operation = bytes[offset]
    offset += 1

    const toBytes = bytes.slice(offset, offset + 20)
    const to = quais.hexlify(toBytes)
    offset += 20

    const valueBytes = bytes.slice(offset, offset + 32)
    const value = BigInt(quais.hexlify(valueBytes))
    offset += 32

    const lenBytes = bytes.slice(offset, offset + 32)
    const dataLength = Number(BigInt(quais.hexlify(lenBytes)))
    offset += 32

    // Bounds check: prevent OOM from malicious data
    if (dataLength > 1_000_000 || offset + dataLength > bytes.length) break

    const data = dataLength > 0 ? quais.hexlify(bytes.slice(offset, offset + dataLength)) : '0x'
    offset += dataLength

    txs.push({ operation, to, value, data })
  }

  return txs
}

/**
 * Try to decode a function call against known interfaces.
 */
function tryDecodeFunctionData(iface: quais.Interface, data: string): { name: string; args: quais.Result } | null {
  try {
    const parsed = iface.parseTransaction({ data })
    if (parsed) return { name: parsed.name, args: parsed.args }
  } catch { /* not a match */ }
  return null
}

/**
 * Decode a single governance-wrapped inner call.
 */
function decodeGovernanceInner(innerData: string): DecodedAction | null {
  const decoded = tryDecodeFunctionData(DAOSHIP_INTERFACE, innerData)
  if (!decoded) return null

  switch (decoded.name) {
    case 'mintShares': {
      const addresses = decoded.args[0] as string[]
      const amounts = (decoded.args[1] as bigint[]).map((a) => quais.formatQuai(a))
      return {
        type: 'mintShares',
        label: `Mint shares to ${addresses.length} address${addresses.length === 1 ? '' : 'es'}`,
        details: { recipients: addresses.map((addr, i) => ({ address: addr, amount: amounts[i] })) },
      }
    }
    case 'burnShares': {
      const addresses = decoded.args[0] as string[]
      const amounts = (decoded.args[1] as bigint[]).map((a) => quais.formatQuai(a))
      return {
        type: 'burnShares',
        label: `Burn shares from ${addresses.length} address${addresses.length === 1 ? '' : 'es'}`,
        details: { targets: addresses.map((addr, i) => ({ address: addr, amount: amounts[i] })) },
      }
    }
    case 'mintLoot': {
      const addresses = decoded.args[0] as string[]
      const amounts = (decoded.args[1] as bigint[]).map((a) => quais.formatQuai(a))
      return {
        type: 'mintLoot',
        label: `Mint loot to ${addresses.length} address${addresses.length === 1 ? '' : 'es'}`,
        details: { recipients: addresses.map((addr, i) => ({ address: addr, amount: amounts[i] })) },
      }
    }
    case 'burnLoot': {
      const addresses = decoded.args[0] as string[]
      const amounts = (decoded.args[1] as bigint[]).map((a) => quais.formatQuai(a))
      return {
        type: 'burnLoot',
        label: `Burn loot from ${addresses.length} address${addresses.length === 1 ? '' : 'es'}`,
        details: { targets: addresses.map((addr, i) => ({ address: addr, amount: amounts[i] })) },
      }
    }
    case 'setGovernanceConfig': {
      const configBytes = decoded.args[0] as string
      const config = decodeGovernanceConfig(configBytes)
      return {
        type: 'setGovernanceConfig',
        label: 'Update governance configuration',
        details: config ? { config: govConfigToDetails(config) } : { configBytes },
      }
    }
    case 'setNavigators': {
      const navs = decoded.args[0] as string[]
      const perms = (decoded.args[1] as bigint[]).map((p) => Number(p))
      const disabling = perms.every((p) => p === 0)
      // All non-zero permissions → a grant (register). Mixed zero/non-zero → an update.
      const enabling = perms.length > 0 && perms.every((p) => p > 0)
      const label = disabling
        ? `Disable ${navs.length} navigator${navs.length === 1 ? '' : 's'}`
        : enabling
          ? `Register ${navs.length} navigator${navs.length === 1 ? '' : 's'}`
          : `Update ${navs.length} navigator${navs.length === 1 ? '' : 's'}`
      return {
        type: 'setNavigators',
        label,
        details: { navigators: navs.map((addr, i) => ({ address: addr, permission: perms[i] })) },
      }
    }
    case 'setGuildTokens': {
      const tokens = decoded.args[0] as string[]
      const enabled = decoded.args[1] as boolean[]
      return {
        type: 'setGuildTokens',
        label: `Update ${tokens.length} guild token${tokens.length === 1 ? '' : 's'}`,
        details: { tokens: tokens.map((addr, i) => ({ address: addr, enabled: enabled[i] })) },
      }
    }
    default:
      return null
  }
}

/**
 * Decode a single raw MultiSend transaction into a human-readable action.
 */
function decodeSingleTx(tx: { to: string; value: bigint; data: string }): DecodedAction {
  const posterAddr = CONTRACT_ADDRESSES.POSTER.toLowerCase()

  // Check for executeAsGovernance wrapper
  const govCall = tryDecodeFunctionData(DAOSHIP_INTERFACE, tx.data)
  if (govCall?.name === 'executeAsGovernance') {
    const innerData = govCall.args[2] as string
    const inner = decodeGovernanceInner(innerData)
    if (inner) return inner
  }

  // Check for Poster.post() call
  if (tx.to.toLowerCase() === posterAddr) {
    const posterCall = tryDecodeFunctionData(POSTER_INTERFACE, tx.data)
    if (posterCall?.name === 'post') {
      const content = posterCall.args[0] as string
      const tag = posterCall.args[1] as string
      let parsedContent: Record<string, unknown> | null = null
      try { parsedContent = JSON.parse(content) } catch { /* not JSON */ }
      return {
        type: 'posterPost',
        label: tag.includes('profile') ? 'Update DAO profile'
          : tag.includes('announcement') ? 'DAO Announcement'
          : `Post to Poster (${tag})`,
        details: { tag, content: parsedContent || content },
      }
    }
  }

  // Check for ERC-20 transfer
  const erc20 = tryDecodeFunctionData(ERC20_INTERFACE, tx.data)
  if (erc20?.name === 'transfer') {
    return {
      type: 'transfer',
      label: 'Transfer ERC-20 tokens',
      details: {
        token: tx.to,
        recipient: erc20.args[0] as string,
        amount: quais.formatQuai(erc20.args[1] as bigint),
      },
    }
  }

  // Native transfer (no calldata or empty)
  if (tx.value > 0n && (tx.data === '0x' || tx.data.length <= 2)) {
    return {
      type: 'transfer',
      label: 'Transfer QUAI',
      details: { recipient: tx.to, amount: quais.formatQuai(tx.value), token: 'QUAI' },
    }
  }

  // TimelockNavigator avatar-only actions (queueChange carries a governance-config blob).
  const tlCall = tryDecodeFunctionData(TIMELOCK_INTERFACE, tx.data)
  if (tlCall?.name === 'queueChange') {
    const config = decodeGovernanceConfig(tlCall.args[0] as string)
    return {
      type: 'queueGovernanceConfig',
      label: 'Queue governance-config change (via timelock)',
      details: {
        timelock: tx.to,
        ...(config ? { config: govConfigToDetails(config) } : { configBytes: tlCall.args[0] }),
      },
    }
  }
  if (tlCall?.name === 'cancelChange') {
    return {
      type: 'custom',
      label: 'Cancel a queued timelock change',
      details: { target: tx.to, value: tx.value.toString(), calldata: tx.data },
    }
  }
  if (tlCall?.name === 'emergencyCancelAll') {
    return {
      type: 'custom',
      label: 'Emergency-cancel all queued timelock changes',
      details: { target: tx.to, value: tx.value.toString(), calldata: tx.data },
    }
  }

  // Unknown / custom
  return {
    type: 'custom',
    label: 'Custom contract call',
    details: { target: tx.to, value: tx.value.toString(), calldata: tx.data },
  }
}

/**
 * Decode a full proposal_data hex string into an array of human-readable actions.
 *
 * @param proposalData - The raw hex string from proposal.proposal_data
 * @returns Array of decoded actions, or empty array if decoding fails
 */
export function decodeProposalActions(proposalData: string | undefined | null): DecodedAction[] {
  if (!proposalData || proposalData === '0x') return []

  try {
    const MULTISEND_SELECTOR = '0x8d80ff0a'
    if (!proposalData.startsWith(MULTISEND_SELECTOR)) return []

    // Decode the ABI-wrapped bytes parameter
    const abiCoder = quais.AbiCoder.defaultAbiCoder()
    const encodedParam = '0x' + proposalData.slice(MULTISEND_SELECTOR.length)
    const [packedBytes] = abiCoder.decode(['bytes'], encodedParam)

    // Parse the packed MultiSend transactions
    const txs = parseMultiSendTxs(packedBytes as string)
    return txs.map(decodeSingleTx)
  } catch {
    return []
  }
}
