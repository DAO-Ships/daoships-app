// ═══════════════════════════════════════════════════════════════════════════
// Proposal Action Encoder (Builder Pattern)
//
// Encodes proposal actions for DAOShip.submitProposal().
// All proposals are encoded as MultiSend calldata (0x8d80ff0a + packed txs).
// The contract delegatecalls the MultiSend library with this data on process.
//
// Governance actions (mintShares, setNavigators, etc.) must be wrapped in
// executeAsGovernance(address, uint256, bytes) so the DAO's governance
// access control is satisfied.
//
// This encoding matches the on-chain E2E test in daoships-indexer.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { type MultiSendTx, encodeMultiSend } from './MultiSendEncoder'
import { type GovernanceConfig, encodeGovernanceConfig } from './GovernanceEncoder'
import { checksumAddress } from './AddressUtils'

/**
 * The DAOShip contract interface used to encode function calldata.
 */
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

/**
 * ERC-20 transfer interface for funding proposals.
 */
const ERC20_INTERFACE = new quais.Interface([
  'function transfer(address to, uint256 amount)',
])

/**
 * Poster contract interface for on-chain metadata.
 */
const POSTER_INTERFACE = new quais.Interface([
  'function post(string content, string tag)',
])

/**
 * MultiSend function selector for wrapping packed transactions.
 */
const MULTISEND_SELECTOR = '0x8d80ff0a'

/**
 * Encoded proposal output ready for DAOShip.submitProposal().
 */
export interface EncodedProposal {
  /** The proposalData bytes passed to submitProposal */
  proposalData: string
  /** Target addresses for each action */
  actionsTo: string[]
  /** Native value for each action */
  actionsValue: bigint[]
  /** Calldata for each action */
  actionsData: string[]
}

/**
 * Builder for encoding proposal actions.
 *
 * Usage:
 *   const encoded = new ProposalEncoder(daoShipAddress)
 *     .addMintShares(['0x...'], [1000n])
 *     .addMintLoot(['0x...'], [500n])
 *     .encode()
 */
export class ProposalEncoder {
  private transactions: MultiSendTx[] = []
  private daoShipAddress: string

  /**
   * @param daoShipAddress - The DAOShip contract address that actions target
   */
  constructor(daoShipAddress: string) {
    this.daoShipAddress = checksumAddress(daoShipAddress)
  }

  /**
   * Wrap an inner calldata in executeAsGovernance(daoShipAddr, 0, innerData).
   * Required for governance-protected functions (mint/burn shares/loot,
   * setGovernanceConfig, setNavigators, setGuildTokens).
   */
  private wrapGovernance(innerData: string): string {
    return DAOSHIP_INTERFACE.encodeFunctionData('executeAsGovernance', [
      this.daoShipAddress,
      0n,
      innerData,
    ])
  }

  /**
   * Add a governance-wrapped action targeting the DAOShip contract.
   */
  private addGovernanceAction(innerData: string): void {
    this.transactions.push({
      operation: 0,
      to: this.daoShipAddress,
      value: 0n,
      data: this.wrapGovernance(innerData),
    })
  }

  /**
   * Add an ERC-20 transfer action.
   * If tokenAddress is the zero address, sends native token instead.
   */
  addTransfer(to: string, tokenAddress: string, amount: bigint): this {
    const checksumTo = checksumAddress(to)
    const isNative = tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000'

    if (isNative) {
      this.transactions.push({
        operation: 0,
        to: checksumTo,
        value: amount,
        data: '0x',
      })
    } else {
      const checksumToken = checksumAddress(tokenAddress)
      const data = ERC20_INTERFACE.encodeFunctionData('transfer', [checksumTo, amount])
      this.transactions.push({
        operation: 0,
        to: checksumToken,
        value: 0n,
        data,
      })
    }
    return this
  }

  /**
   * Add a mintShares action (governance-wrapped).
   */
  addMintShares(to: string[], amounts: bigint[]): this {
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('mintShares', [to.map(checksumAddress), amounts])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a burnShares action (governance-wrapped).
   */
  addBurnShares(from: string[], amounts: bigint[]): this {
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('burnShares', [from.map(checksumAddress), amounts])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a mintLoot action (governance-wrapped).
   */
  addMintLoot(to: string[], amounts: bigint[]): this {
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('mintLoot', [to.map(checksumAddress), amounts])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a burnLoot action (governance-wrapped).
   */
  addBurnLoot(from: string[], amounts: bigint[]): this {
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('burnLoot', [from.map(checksumAddress), amounts])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a setGovernanceConfig action (governance-wrapped).
   */
  addSetGovernanceConfig(config: GovernanceConfig): this {
    const encodedConfig = encodeGovernanceConfig(config)
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('setGovernanceConfig', [encodedConfig])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a setNavigators action (governance-wrapped).
   */
  addSetNavigators(navigators: string[], permissions: bigint[]): this {
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('setNavigators', [navigators.map(checksumAddress), permissions])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a setGuildTokens action (governance-wrapped).
   */
  addSetGuildTokens(tokens: string[], enabled: boolean[]): this {
    const innerData = DAOSHIP_INTERFACE.encodeFunctionData('setGuildTokens', [tokens.map(checksumAddress), enabled])
    this.addGovernanceAction(innerData)
    return this
  }

  /**
   * Add a Poster.post() action to publish on-chain metadata.
   * The DAO vault is msg.sender, so the indexer treats this as VERIFIED.
   */
  addPosterPost(posterAddress: string, content: string, tag: string): this {
    const data = POSTER_INTERFACE.encodeFunctionData('post', [content, tag])
    this.transactions.push({
      operation: 0,
      to: checksumAddress(posterAddress),
      value: 0n,
      data,
    })
    return this
  }

  /**
   * Add a custom action with arbitrary calldata.
   */
  addCustomAction(to: string, value: bigint, data: string): this {
    this.transactions.push({
      operation: 0,
      to: checksumAddress(to),
      value,
      data,
    })
    return this
  }

  /**
   * Encode all queued transactions into MultiSend calldata.
   *
   * Output format matches the on-chain E2E test:
   *   0x8d80ff0a + ABI.encode(['bytes'], [packedTransactions])
   *
   * This is the raw MultiSend.multiSend(bytes) calldata that the
   * DAOShip contract delegatecalls on proposal processing.
   *
   * @returns Encoded proposal data ready for DAOShip.submitProposal()
   */
  encode(): EncodedProposal {
    if (this.transactions.length === 0) {
      throw new Error('Proposal must contain at least one action')
    }

    // Pack all transactions into MultiSend binary format
    const packed = encodeMultiSend(this.transactions)

    // Wrap as MultiSend.multiSend(bytes) calldata
    const abiCoder = quais.AbiCoder.defaultAbiCoder()
    const encodedParam = abiCoder.encode(['bytes'], [packed])
    const proposalData = MULTISEND_SELECTOR + encodedParam.slice(2)

    return {
      proposalData,
      actionsTo: this.transactions.map((tx) => tx.to),
      actionsValue: this.transactions.map((tx) => tx.value),
      actionsData: this.transactions.map((tx) => tx.data),
    }
  }
}
