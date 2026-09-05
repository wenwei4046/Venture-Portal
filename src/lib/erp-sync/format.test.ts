import { describe, expect, it } from 'vitest'
import { formatAgo } from './format'

const NOW = Date.parse('2026-09-05T10:00:00Z')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

describe('formatAgo', () => {
  it('starts in seconds, because the feed is measured in seconds', () => {
    expect(formatAgo(ago(0), NOW)).toBe('just now')
    expect(formatAgo(ago(12), NOW)).toBe('12 s ago')
    expect(formatAgo(ago(59), NOW)).toBe('59 s ago')
    expect(formatAgo(ago(180), NOW)).toBe('3 min ago')
    expect(formatAgo(ago(2 * 3600), NOW)).toBe('2 h ago')
    expect(formatAgo(ago(3 * 86400), NOW)).toBe('3 d ago')
  })

  it('falls back to a date past a week, and says never for nothing', () => {
    expect(formatAgo(ago(30 * 86400), NOW)).toBe('06 Aug 2026')
    expect(formatAgo(null, NOW)).toBe('never')
    expect(formatAgo('garbage', NOW)).toBe('never')
  })

  it('never goes negative on a clock ahead of the server', () => {
    expect(formatAgo(ago(-30), NOW)).toBe('just now')
  })
})
