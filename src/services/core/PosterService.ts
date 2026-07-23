import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import PosterABI from '@/config/abi/Poster.json'
import { CONTRACT_ADDRESSES } from '@/config/contracts'
import { POSTER_TAGS } from '@/types/poster'
import { assertAffordable, modelPostGas } from '../utils/LaunchGasEstimator'
import type { DaoTheme } from '@/utils/daoTheme'

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

    // Cheap relative to a launch, but a post that dies for lack of gas leaves a
    // freshly launched DAO with no profile — surface the shortfall instead.
    await assertAffordable(modelPostGas(contentBytes), 'Post to Poster')

    const tx = await contract['post(string,string)'](content, tag)
    await confirmTx(tx, { label: 'Poster.post' })
  }

  /**
   * Inject schemaVersion and stringify a payload for posting.
   * Control characters are stripped to match the indexer's server-side scrubbing,
   * preventing silent UX mismatches where the user sees one thing and the
   * indexer stores another.
   */
  private stringify(payload: Record<string, unknown>): string {
    const clean = this.stripControlChars({ schemaVersion: SCHEMA_VERSION, ...payload })
    return JSON.stringify(clean)
  }

  /**
   * Recursively strip C0 control characters (except \t, \n, \r), DEL, and C1
   * controls from all string values in a payload. Mirrors the daoships-indexer's
   * server-side sanitization.
   */
  private stripControlChars<T>(value: T): T {
    if (typeof value === 'string') {
      // eslint-disable-next-line no-control-regex
      return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') as unknown as T
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.stripControlChars(v)) as unknown as T
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.stripControlChars(v)
      }
      return out as unknown as T
    }
    return value
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
    theme?: DaoTheme
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
    theme?: DaoTheme | null
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

  /**
   * Build the content string for a `daoships.dao.navigators` sanction post.
   *
   * Does NOT post directly — a vault (VERIFIED) post must execute from the avatar, so the
   * caller wraps this in a governance proposal action (Poster.post(content, tag)).
   *
   * The `navigators` array is the DAO's COMPLETE sanctioned set (last-write-wins): omit an
   * address to de-sanction it, pass [] to clear all. Always pre-fill the current set so a
   * governor can't accidentally drop existing endorsements.
   */
  buildSanctionNavigatorsContent(
    daoAddress: string,
    navigators: { address: string; type?: string }[],
  ): string {
    return this.stringify({
      daoAddress: daoAddress.toLowerCase(),
      navigators: navigators.map((n) => ({
        address: n.address.toLowerCase(),
        ...(n.type ? { type: n.type } : {}),
      })),
    })
  }

  /**
   * Post option labels + context for a SignalNavigator poll. Called DIRECTLY by the poll
   * creator's wallet in a second tx after createPoll mines (the indexer accepts it only when
   * msg.sender == PollCreated.creator and the poll is still Pending/Active). Last-write-wins,
   * so the same call re-posts to correct labels.
   *
   * `options.length` MUST equal the poll's on-chain optionCount or the indexer discards the
   * post (the UI then renders numeric options). `pollId` is the per-navigator id.
   */
  async postSignalPollLabels(labels: {
    daoAddress: string
    navigatorAddress: string
    pollId: number
    options: string[]
    description?: string
    discussionUrl?: string
  }): Promise<void> {
    return this.post(
      this.stringify({
        daoAddress: labels.daoAddress.toLowerCase(),
        navigatorAddress: labels.navigatorAddress.toLowerCase(),
        pollId: labels.pollId,
        options: labels.options,
        ...(labels.description ? { description: labels.description } : {}),
        ...(labels.discussionUrl ? { discussionUrl: labels.discussionUrl } : {}),
      }),
      POSTER_TAGS.SIGNAL_POLL,
    )
  }

  /** The Poster contract address (for encoding a Poster.post proposal action). */
  getPosterContractAddress(): string {
    return this.getPosterAddress()
  }
}

export const posterService = new PosterService()
