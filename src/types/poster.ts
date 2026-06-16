// ═══════════════════════════════════════════════════════════════════════════
// Poster Tag Types - matches the recognized daoships.* poster tags
// ═══════════════════════════════════════════════════════════════════════════

export const POSTER_TAGS = {
  DAO_PROFILE_INITIAL: 'daoships.dao.profile.initial',
  DAO_PROFILE: 'daoships.dao.profile',
  DAO_ANNOUNCEMENT: 'daoships.dao.announcement',
  MEMBER_PROFILE: 'daoships.member.profile',
  PROPOSAL_VOTE_REASON: 'daoships.proposal.vote.reason',
  NAVIGATOR_ALLOWLIST: 'daoships.navigator.allowlist',
  // Vault-authenticated (VERIFIED) sanction list of read-only navigators. The array is the
  // DAO's COMPLETE sanctioned set (last-write-wins) — omitting an address de-sanctions it,
  // [] clears all. Must be posted by the vault, so it's wrapped in a governance proposal.
  DAO_NAVIGATORS: 'daoships.dao.navigators',
  // Off-chain option labels + context for a SignalNavigator poll. Posted DIRECTLY by the poll
  // creator (msg.sender == PollCreated.creator) in a second tx after createPoll mines. The
  // indexer accepts it only while the poll is Pending/Active and only when options.length
  // matches the on-chain optionCount; last-write-wins so the creator can correct labels.
  SIGNAL_POLL: 'daoships.signal.poll',
} as const

export type PosterTag = typeof POSTER_TAGS[keyof typeof POSTER_TAGS]
