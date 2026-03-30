import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  secondsToDuration,
  formatDuration,
  formatCountdown,
  formatTimeAgo,
  parseDurationToSeconds,
} from '@/utils/time'

describe('secondsToDuration', () => {
  it('decomposes seconds correctly', () => {
    expect(secondsToDuration(90061)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
    })
  })

  it('handles zero', () => {
    expect(secondsToDuration(0)).toEqual({
      days: 0, hours: 0, minutes: 0, seconds: 0,
    })
  })

  it('handles negative values as zero', () => {
    expect(secondsToDuration(-100)).toEqual({
      days: 0, hours: 0, minutes: 0, seconds: 0,
    })
  })

  it('handles pure seconds', () => {
    expect(secondsToDuration(45)).toEqual({
      days: 0, hours: 0, minutes: 0, seconds: 45,
    })
  })

  it('handles pure minutes', () => {
    expect(secondsToDuration(120)).toEqual({
      days: 0, hours: 0, minutes: 2, seconds: 0,
    })
  })

  it('handles pure hours', () => {
    expect(secondsToDuration(7200)).toEqual({
      days: 0, hours: 2, minutes: 0, seconds: 0,
    })
  })

  it('handles pure days', () => {
    expect(secondsToDuration(172800)).toEqual({
      days: 2, hours: 0, minutes: 0, seconds: 0,
    })
  })
})

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45 seconds')
  })

  it('formats singular second', () => {
    expect(formatDuration(1)).toBe('1 second')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2 minutes, 5 seconds')
  })

  it('formats singular minute', () => {
    expect(formatDuration(60)).toBe('1 minute')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1 hour, 1 minute')
  })

  it('formats days and hours', () => {
    expect(formatDuration(90000)).toBe('1 day, 1 hour')
  })

  it('formats multiple days', () => {
    expect(formatDuration(259200)).toBe('3 days')
  })

  it('shows only two most significant units', () => {
    // 1 day, 2 hours, 3 minutes, 4 seconds -> "1 day, 2 hours"
    expect(formatDuration(93784)).toBe('1 day, 2 hours')
  })

  it('returns "0 seconds" for zero', () => {
    expect(formatDuration(0)).toBe('0 seconds')
  })

  it('returns "0 seconds" for negative values', () => {
    expect(formatDuration(-100)).toBe('0 seconds')
  })
})

describe('formatCountdown', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats future timestamp (seconds)', () => {
    // Mock Date.now to a known value
    const now = 1700000000000 // ms
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // Target is 1h 30m 45s from now (in seconds)
    const target = 1700000000 + 5445 // seconds
    const result = formatCountdown(target)
    expect(result).toBe('1h 30m 45s')
  })

  it('formats future timestamp (milliseconds auto-detect)', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // Target is 2h from now, in milliseconds
    const target = now + 7200000
    const result = formatCountdown(target)
    expect(result).toBe('2h')
  })

  it('returns "0s" for past timestamps', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // Target is in the past
    const target = 1699999000 // seconds, before now
    expect(formatCountdown(target)).toBe('0s')
  })

  it('returns "0s" for current timestamp', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatCountdown(1700000000)).toBe('0s')
  })

  it('formats days in countdown', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // 2 days + 3 hours from now
    const target = 1700000000 + 2 * 86400 + 3 * 3600
    const result = formatCountdown(target)
    expect(result).toBe('2d 3h')
  })
})

describe('formatTimeAgo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns "just now" for very recent timestamps', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 2)).toBe('just now')
  })

  it('formats seconds ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 30)).toBe('30 seconds ago')
  })

  it('formats 1 minute ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 90)).toBe('1 minute ago')
  })

  it('formats minutes ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 300)).toBe('5 minutes ago')
  })

  it('formats 1 hour ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 4000)).toBe('1 hour ago')
  })

  it('formats hours ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 10800)).toBe('3 hours ago')
  })

  it('formats 1 day ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 100000)).toBe('1 day ago')
  })

  it('formats days ago', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(formatTimeAgo(1700000000 - 432000)).toBe('5 days ago')
  })

  it('auto-detects millisecond timestamps', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    // Pass timestamp in milliseconds (> 1e12)
    expect(formatTimeAgo(now - 30000)).toBe('30 seconds ago')
  })
})

describe('parseDurationToSeconds', () => {
  it('parses "3 days" to 259200', () => {
    expect(parseDurationToSeconds('3 days')).toBe(259200)
  })

  it('parses "12 hours" to 43200', () => {
    expect(parseDurationToSeconds('12 hours')).toBe(43200)
  })

  it('parses "30 minutes" to 1800', () => {
    expect(parseDurationToSeconds('30 minutes')).toBe(1800)
  })

  it('parses plain seconds "180" to 180', () => {
    expect(parseDurationToSeconds('180')).toBe(180)
  })

  it('returns null for empty string', () => {
    expect(parseDurationToSeconds('')).toBeNull()
  })

  it('returns null for "invalid"', () => {
    expect(parseDurationToSeconds('invalid')).toBeNull()
  })

  it('parses "3 d" abbreviation to 259200', () => {
    expect(parseDurationToSeconds('3 d')).toBe(259200)
  })

  it('parses "1h" abbreviation to 3600', () => {
    expect(parseDurationToSeconds('1h')).toBe(3600)
  })
})
