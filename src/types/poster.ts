// ═══════════════════════════════════════════════════════════════════════════
// Poster Tag Types - matches the 7 recognized daoships.* poster tags
// ═══════════════════════════════════════════════════════════════════════════

export const POSTER_TAGS = {
  DAO_PROFILE_INITIAL: 'daoships.dao.profile.initial',
  DAO_PROFILE: 'daoships.dao.profile',
  DAO_ANNOUNCEMENT: 'daoships.dao.announcement',
  MEMBER_PROFILE: 'daoships.member.profile',
  PROPOSAL_VOTE_REASON: 'daoships.proposal.vote.reason',
  TREASURY_LABEL: 'daoships.treasury.label',
  NAVIGATOR_METADATA: 'daoships.navigator.metadata',
} as const

export type PosterTag = typeof POSTER_TAGS[keyof typeof POSTER_TAGS]
