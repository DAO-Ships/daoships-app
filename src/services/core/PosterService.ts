import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import PosterABI from '@/config/abi/Poster.json'
import { CONTRACT_ADDRESSES } from '@/config/contracts'
import { POSTER_TAGS } from '@/types/poster'

// ═══════════════════════════════════════════════════════════════════════════
// PosterService - On-chain metadata via the Poster contract
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Poster contract is a shared singleton for publishing arbitrary
 * on-chain metadata. The daoships-indexer watches for `NewPost` events
 * and processes them based on the `tag` parameter.
 *
 * All recognized tags are defined in POSTER_TAGS (src/types/poster.ts).
 * The indexer silently ignores unrecognized tags.
 *
 * All posts include `schemaVersion: '1.0'` — the indexer rejects posts
 * without this field.
 */

const SCHEMA_VERSION = '1.0'
const MAX_CONTENT_BYTES = 16384

class PosterService {

  private getPosterAddress(): string {
    return CONTRACT_ADDRESSES.POSTER
  }

  private getWriteContract(): quais.Contract {
    return new quais.Contract(
      this.getPosterAddress(),
      PosterABI,
      baseService.requireSigner(),
    )
  }

  /**
   * Post content on-chain with a tag.
   * Emits a `NewPost(address indexed user, string content, string indexed tag)` event.
   *
   * @param content - JSON-stringified metadata (schemaVersion injected automatically)
   * @param tag - Category tag from POSTER_TAGS consumed by the daoships-indexer
   */
  async post(content: string, tag: string): Promise<void> {
    // Enforce 16KB size limit to avoid wasting gas on posts the indexer will reject
    const contentBytes = new TextEncoder().encode(content).length
    if (contentBytes > MAX_CONTENT_BYTES) {
      throw new Error(`Content exceeds maximum size (${contentBytes} bytes > ${MAX_CONTENT_BYTES} bytes)`)
    }

    const contract = this.getWriteContract()
    const tx = await contract['post(string,string)'](content, tag)
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('Poster.post transaction reverted')
    }
  }

  /**
   * Inject schemaVersion and stringify a payload for posting.
   */
  private stringify(payload: Record<string, unknown>): string {
    return JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...payload })
  }

  // ─── Typed convenience methods (aligned with indexer's 7 canonical tags) ──

  /**
   * Post initial DAO profile during launch. Called by deployer wallet.
   * Trust level: VERIFIED_INITIAL
   * Permanently invalidated once the vault posts a governance-approved profile.
   */
  async postDaoProfileInitial(profile: {
    daoAddress: string
    name: string
    description: string
    avatar?: string
    banner?: string
    links?: Record<string, string>
    tags?: string[]
    chainId?: number
  }): Promise<void> {
    return this.post(this.stringify(profile), POSTER_TAGS.DAO_PROFILE_INITIAL)
  }

  /**
   * Post DAO profile via governance proposal (vault is msg.sender).
   * Trust level: VERIFIED
   * Supports partial updates: set field to null to remove, omit to keep unchanged.
   * Note: This must be encoded as a proposal action, not called directly.
   */
  async postDaoProfile(profile: {
    daoAddress: string
    name?: string
    description?: string | null
    avatar?: string | null
    banner?: string | null
    links?: Record<string, string> | null
    tags?: string[] | null
  }): Promise<void> {
    return this.post(this.stringify(profile), POSTER_TAGS.DAO_PROFILE)
  }

  /**
   * Post a DAO announcement via governance proposal (vault is msg.sender).
   * Trust level: VERIFIED
   */
  async postDaoAnnouncement(announcement: {
    daoAddress: string
    title: string
    body?: string
    severity?: 'info' | 'warning' | 'critical'
    url?: string
    expiresAt?: string
  }): Promise<void> {
    return this.post(this.stringify(announcement), POSTER_TAGS.DAO_ANNOUNCEMENT)
  }

  /**
   * Post a member profile. Called directly by member wallet.
   * Trust level: MEMBER
   */
  async postMemberProfile(profile: {
    daoAddress?: string
    name: string
    bio?: string
    avatar?: string
  }): Promise<void> {
    return this.post(this.stringify(profile), POSTER_TAGS.MEMBER_PROFILE)
  }

  /**
   * Post a vote reason. Called after submitting a vote on-chain.
   * Trust level: MEMBER
   * Note: The `vote` field is informational only — canonical vote direction
   * comes from the on-chain SubmitVote event, not this self-reported field.
   */
  async postVoteReason(voteReason: {
    daoAddress: string
    proposalId?: number
    vote?: boolean
    reason: string
  }): Promise<void> {
    return this.post(this.stringify(voteReason), POSTER_TAGS.PROPOSAL_VOTE_REASON)
  }

  /**
   * Post navigator allowlist (StandardMerkleTree dump + addresses).
   * Called by the deployer after deploying a navigator with an allowlist.
   * Trust level: SEMI_TRUSTED (deployer wallet is msg.sender)
   *
   * The `treeDump` field is the output of StandardMerkleTree.dump() —
   * it contains the full tree structure needed to reconstruct proofs.
   */
  async postNavigatorAllowlist(data: {
    daoAddress: string
    navigatorAddress: string
    root: string
    addresses: string[]
    treeDump: unknown
  }): Promise<void> {
    return this.post(this.stringify(data), POSTER_TAGS.NAVIGATOR_ALLOWLIST)
  }
}

export const posterService = new PosterService()
