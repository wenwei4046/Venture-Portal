import { describe, expect, it } from 'vitest'
import { formatAgo, keyHint, matchOutcomeNote } from './format'

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

describe('matchOutcomeNote', () => {
  it('says how many orders moved', () => {
    expect(matchOutcomeNote('Chea Huan', { matched: 207, locked: 0 })).toBe(
      'Chea Huan: 207 orders now pay this salesperson.',
    )
    expect(matchOutcomeNote('Junie', { matched: 1, locked: 0 })).toBe(
      'Junie: 1 order now pays this salesperson.',
    )
  })

  it('names the orders an applied run kept, because they keep the name on the list', () => {
    expect(matchOutcomeNote('Kingsley', { matched: 150, locked: 35 })).toBe(
      "Kingsley: 150 orders now pay this salesperson. 35 orders stayed put: their month's " +
        'commission run is applied. Reopen that run and press Match again.',
    )
  })

  it('still confirms a match that had nothing to back-fill', () => {
    expect(matchOutcomeNote('Yuny', { matched: 0, locked: 0 })).toBe(
      'Yuny is remembered — no order was waiting on the answer.',
    )
  })
})

describe('keyHint', () => {
  it('shows only the last four characters', () => {
    expect(keyHint('abcdefghijklmnopqrstuvwxyz')).toBe('····wxyz')
    expect(keyHint('  abcdefghijklmnop  ')).toBe('····mnop')
  })

  it('hides a short key entirely', () => {
    expect(keyHint('short')).toBe('····')
    expect(keyHint('')).toBe('····')
  })
})
