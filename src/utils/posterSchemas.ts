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
