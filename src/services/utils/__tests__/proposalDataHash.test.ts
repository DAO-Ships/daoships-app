import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import { hashProposalData, verifyProposalDataHash } from '../ProposalDecoder'
import { ProposalEncoder } from '../ProposalEncoder'

// DAOShip.hashOperation is keccak256(abi.encode(_transactions)) — NOT
// keccak256(_transactions). The action bytes come from the indexer while the hash is
// committed on-chain at submit time, so they are from different trust domains and were
// never cross-checked.

const DAO = '0x0000000000000000000000000000000000000001'
const MEMBER = '0x00000000000000000000000000000000000000ff'

describe('hashProposalData matches the contract rule', () => {
  it('applies the abi.encode layer, not a bare keccak', () => {
    const data = new ProposalEncoder(DAO).addMintShares([MEMBER], [1000n]).encode().proposalData
    const expected = quais.keccak256(
      quais.AbiCoder.defaultAbiCoder().encode(['bytes'], [data]),
    )
    expect(hashProposalData(data)).toBe(expected)
    // The common mistake produces a different value.
    expect(hashProposalData(data)).not.toBe(quais.keccak256(data))
  })

  it('is deterministic', () => {
    const data = new ProposalEncoder(DAO).addMintShares([MEMBER], [1n]).encode().proposalData
    expect(hashProposalData(data)).toBe(hashProposalData(data))
  })
})

describe('verifyProposalDataHash', () => {
  const data = new ProposalEncoder(DAO).addMintShares([MEMBER], [1000n]).encode().proposalData
  const hash = hashProposalData(data)

  it('accepts data matching its commitment', () => {
    expect(verifyProposalDataHash(data, hash)).toBe(true)
  })

  it('is case-insensitive on the hash', () => {
    expect(verifyProposalDataHash(data, hash.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  it('rejects substituted action bytes', () => {
    const tampered = new ProposalEncoder(DAO)
      .addMintShares([MEMBER], [999_999n])
      .encode().proposalData
    expect(verifyProposalDataHash(tampered, hash)).toBe(false)
  })

  it('returns null when there is nothing to verify', () => {
    // Distinguishes "unverifiable" from "verified mismatch" — the caller blocks only
    // on an actual mismatch.
    expect(verifyProposalDataHash(null, hash)).toBeNull()
    expect(verifyProposalDataHash(data, null)).toBeNull()
    expect(verifyProposalDataHash(undefined, undefined)).toBeNull()
  })

  it('returns null rather than throwing on malformed data', () => {
    expect(verifyProposalDataHash('not-hex', hash)).toBeNull()
  })
})
