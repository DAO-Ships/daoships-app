import { describe, it, expect } from 'vitest'
import { isNewerRecord } from '@/utils/realtime'

describe('isNewerRecord', () => {
  it('returns true when incoming has higher block_number', () => {
    expect(isNewerRecord(
      { block_number: 200 },
      { block_number: 100 },
    )).toBe(true)
  })

  it('returns false when incoming has equal block_number', () => {
    // Strict > comparison — equal records are not considered "newer"
    expect(isNewerRecord(
      { block_number: 100 },
      { block_number: 100 },
    )).toBe(false)
  })

  it('returns false when incoming has lower block_number', () => {
    expect(isNewerRecord(
      { block_number: 50 },
      { block_number: 100 },
    )).toBe(false)
  })

  it('falls back to created_at when block_number missing on incoming', () => {
    expect(isNewerRecord(
      { created_at: '2025-06-02T00:00:00Z' },
      { block_number: 100, created_at: '2025-06-01T00:00:00Z' },
    )).toBe(true)
  })

  it('falls back to created_at when block_number missing on existing', () => {
    expect(isNewerRecord(
      { block_number: 100, created_at: '2025-06-02T00:00:00Z' },
      { created_at: '2025-06-01T00:00:00Z' },
    )).toBe(true)
  })

  it('compares by created_at when both lack block_number', () => {
    expect(isNewerRecord(
      { created_at: '2025-06-02T00:00:00Z' },
      { created_at: '2025-06-01T00:00:00Z' },
    )).toBe(true)

    expect(isNewerRecord(
      { created_at: '2025-06-01T00:00:00Z' },
      { created_at: '2025-06-02T00:00:00Z' },
    )).toBe(false)
  })

  it('returns false when created_at timestamps are equal', () => {
    // Strict > comparison
    expect(isNewerRecord(
      { created_at: '2025-06-01T00:00:00Z' },
      { created_at: '2025-06-01T00:00:00Z' },
    )).toBe(false)
  })

  it('returns true when ordering cannot be determined (both empty)', () => {
    expect(isNewerRecord({}, {})).toBe(true)
  })

  it('returns true when ordering cannot be determined (null fields)', () => {
    expect(isNewerRecord(
      { block_number: null, created_at: null },
      { block_number: null, created_at: null },
    )).toBe(true)
  })

  it('returns true when incoming has data but existing has none', () => {
    expect(isNewerRecord(
      { block_number: 100 },
      {},
    )).toBe(true)
  })
})
