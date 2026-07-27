// ═══════════════════════════════════════════════════════════════════════════
// Poster Content Validation Schemas (6 canonical tags)
// ═══════════════════════════════════════════════════════════════════════════

import { isValidUrl } from '@/utils/url'
import { POSTER_TAGS } from '@/types/poster'

/**
 * Validation result for poster content.
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Field definition for a poster schema.
 */
interface FieldDef {
  required?: boolean
  maxLength?: number
  type?: 'string' | 'url' | 'enum'
  enumValues?: string[]
}

/**
 * Schema definitions keyed by poster tag.
 * Field names match the indexer's expected content_json structure.
 * All schemas implicitly require schemaVersion (enforced in validate fn).
 */
const POSTER_SCHEMAS: Record<string, Record<string, FieldDef>> = {
  [POSTER_TAGS.DAO_PROFILE_INITIAL]: {
    daoAddress: { required: true, maxLength: 42, type: 'string' },
    name: { required: true, maxLength: 64, type: 'string' },
    description: { required: true, maxLength: 280, type: 'string' },
    avatar: { type: 'url' },
    banner: { type: 'url' },
  },
  [POSTER_TAGS.DAO_PROFILE]: {
    daoAddress: { required: true, maxLength: 42, type: 'string' },
    name: { maxLength: 64, type: 'string' },
    description: { maxLength: 280, type: 'string' },
    avatar: { type: 'url' },
    banner: { type: 'url' },
  },
  [POSTER_TAGS.DAO_ANNOUNCEMENT]: {
    daoAddress: { required: true, maxLength: 42, type: 'string' },
    title: { required: true, maxLength: 100, type: 'string' },
    body: { maxLength: 500, type: 'string' },
    severity: { type: 'enum', enumValues: ['info', 'warning', 'critical'] },
    url: { type: 'url' },
    expiresAt: { maxLength: 30, type: 'string' },
  },
  [POSTER_TAGS.MEMBER_PROFILE]: {
    name: { required: true, maxLength: 32, type: 'string' },
    bio: { maxLength: 160, type: 'string' },
    avatar: { type: 'url' },
  },
  [POSTER_TAGS.PROPOSAL_VOTE_REASON]: {
    daoAddress: { required: true, maxLength: 42, type: 'string' },
    reason: { required: true, maxLength: 500, type: 'string' },
  },
  [POSTER_TAGS.NAVIGATOR_ALLOWLIST]: {
    daoAddress: { required: true, maxLength: 42, type: 'string' },
    navigatorAddress: { required: true, maxLength: 42, type: 'string' },
    root: { required: true, maxLength: 66, type: 'string' },
  },
}

/**
 * True when this tag has a schema to validate against.
 *
 * Not every POSTER_TAG does: `daoships.dao.navigators` is a bare address array,
 * and `daoships.signal.poll` has its own validator (validateSignalPollLabels)
 * because its rules depend on the poll's on-chain optionCount. Callers that
 * validate generically must gate on this — validatePosterContent reports an
 * unschema'd tag as INVALID, which would reject those two posts outright.
 */
export function hasPosterSchema(tag: string): boolean {
  return tag in POSTER_SCHEMAS
}

/**
 * Validate poster content against the schema for a given tag.
 *
 * @param tag     - A POSTER_TAGS constant
 * @param content - The content object to validate
 * @returns Validation result with errors array
 */
export function validatePosterContent(
  tag: string,
  content: Record<string, unknown>,
): ValidationResult {
  const schema = POSTER_SCHEMAS[tag]
  if (!schema) {
    return { valid: false, errors: [`Unknown poster tag: ${tag}`] }
  }

  const errors: string[] = []

  // schemaVersion is required on all posts
  if (!content.schemaVersion) {
    errors.push('schemaVersion is required')
  }

  for (const [field, def] of Object.entries(schema)) {
    const value = content[field]

    // Required field check
    if (def.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`)
      continue
    }

    // Skip optional absent fields
    if (value === undefined || value === null || value === '') continue

    // Type check
    if (typeof value !== 'string') {
      errors.push(`${field} must be a string`)
      continue
    }

    // Length check
    if (def.maxLength && value.length > def.maxLength) {
      errors.push(`${field} must be ${def.maxLength} characters or fewer`)
    }

    // URL validation
    if (def.type === 'url' && !isValidUrl(value)) {
      errors.push(`${field} must be a valid URL (https or ipfs)`)
    }

    // Enum validation
    if (def.type === 'enum' && def.enumValues && !def.enumValues.includes(value)) {
      errors.push(`${field} must be one of: ${def.enumValues.join(', ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// Mirror of the indexer's validateSignalPoll limits (daoships.signal.poll).
const SIGNAL_POLL_MIN_OPTIONS = 2
const SIGNAL_POLL_MAX_OPTIONS = 10
const SIGNAL_POLL_LABEL_MAX = 200
const SIGNAL_POLL_DESCRIPTION_MAX = 1000

/**
 * Validate a `daoships.signal.poll` labels payload before posting. The generic flat-field
 * validator can't express the `options` array, so this is bespoke. Mirrors the indexer's
 * `validateSignalPoll` so we never spend gas on a post the indexer will discard.
 *
 * Note: the cross-check `options.length === on-chain optionCount` cannot happen here (the
 * indexer enforces it at apply time); the caller pins the count instead — see SignalPlugin.
 */
export function validateSignalPollLabels(content: {
  options?: unknown
  description?: unknown
  discussionUrl?: unknown
}): ValidationResult {
  const errors: string[] = []

  const { options, description, discussionUrl } = content

  if (!Array.isArray(options)) {
    errors.push('options must be an array')
  } else {
    if (options.length < SIGNAL_POLL_MIN_OPTIONS || options.length > SIGNAL_POLL_MAX_OPTIONS) {
      errors.push(`options must have between ${SIGNAL_POLL_MIN_OPTIONS} and ${SIGNAL_POLL_MAX_OPTIONS} entries`)
    }
    options.forEach((opt, i) => {
      if (typeof opt !== 'string' || opt.trim() === '') {
        errors.push(`option ${i + 1} must be a non-empty label`)
      } else if (opt.length > SIGNAL_POLL_LABEL_MAX) {
        errors.push(`option ${i + 1} must be ${SIGNAL_POLL_LABEL_MAX} characters or fewer`)
      }
    })
  }

  if (description !== undefined && description !== null && description !== '') {
    if (typeof description !== 'string') {
      errors.push('description must be a string')
    } else if (description.length > SIGNAL_POLL_DESCRIPTION_MAX) {
      errors.push(`description must be ${SIGNAL_POLL_DESCRIPTION_MAX} characters or fewer`)
    }
  }

  if (discussionUrl !== undefined && discussionUrl !== null && discussionUrl !== '') {
    if (typeof discussionUrl !== 'string' || !isValidUrl(discussionUrl)) {
      errors.push('discussionUrl must be a valid URL (https or ipfs)')
    }
  }

  return { valid: errors.length === 0, errors }
}
