// ═══════════════════════════════════════════════════════════════════════════
// Poster Tag Types - matches the 6 recognized daoships.* poster tags
// ═══════════════════════════════════════════════════════════════════════════

export const POSTER_TAGS = {
  DAO_PROFILE_INITIAL: 'daoships.dao.profile.initial',
  DAO_PROFILE: 'daoships.dao.profile',
  DAO_ANNOUNCEMENT: 'daoships.dao.announcement',
  MEMBER_PROFILE: 'daoships.member.profile',
  PROPOSAL_VOTE_REASON: 'daoships.proposal.vote.reason',
  NAVIGATOR_ALLOWLIST: 'daoships.navigator.allowlist',
} as const

export type PosterTag = typeof POSTER_TAGS[keyof typeof POSTER_TAGS]
