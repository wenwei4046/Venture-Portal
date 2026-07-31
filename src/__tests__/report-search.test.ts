import { describe, it, expect } from 'vitest'
import {
  matchesAccount,
  highlight,
  ancestorsOfMatches,
  normalizeQuery,
} from '@/lib/report-search'

describe('matchesAccount', () => {
  it('matches on code and on name, case-insensitively', () => {
    expect(matchesAccount('9030', '9030', 'Salary Expense')).toBe(true)
    expect(matchesAccount('salary', '9030', 'Salary Expense')).toBe(true)
    expect(matchesAccount('SALARY EXPENSE', '9030', 'Salary Expense')).toBe(true)
    expect(matchesAccount('903', '9030', 'Salary Expense')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesAccount('rental', '9030', 'Salary Expense')).toBe(false)
  })

  it('treats an empty or whitespace query as no search at all', () => {
    expect(matchesAccount('', '9030', 'Salary Expense')).toBe(false)
    expect(matchesAccount('   ', '9030', 'Salary Expense')).toBe(false)
    expect(normalizeQuery('  Salary  ')).toBe('salary')
  })

  it('tolerates a missing code or name', () => {
    expect(matchesAccount('total', null, 'Total revenue')).toBe(true)
    expect(matchesAccount('9030', '9030', null)).toBe(true)
  })
})

describe('highlight', () => {
  it('splits around every occurrence', () => {
    expect(highlight('Salary Expense - Salary', 'salary')).toEqual([
      { text: 'Salary', hit: true },
      { text: ' Expense - ', hit: false },
      { text: 'Salary', hit: true },
    ])
  })

  it('preserves the original casing of the matched run', () => {
    expect(highlight('SALARY Expense', 'salary')).toEqual([
      { text: 'SALARY', hit: true },
      { text: ' Expense', hit: false },
    ])
  })

  it('returns one plain part when there is no query or no match', () => {
    expect(highlight('Salary Expense', '')).toEqual([{ text: 'Salary Expense', hit: false }])
    expect(highlight('Salary Expense', 'rent')).toEqual([
      { text: 'Salary Expense', hit: false },
    ])
  })

  it('rebuilds the original string exactly', () => {
    const text = 'Interest in Suspense - Recv - Hookka'
    expect(highlight(text, 's').map((p) => p.text).join('')).toBe(text)
  })
})

describe('ancestorsOfMatches', () => {
  // Pre-order rows, the order both report views render in.
  const rows = [
    { key: 'a', depth: 0 },
    { key: 'a1', depth: 1 },
    { key: 'a1x', depth: 2 },
    { key: 'b', depth: 0 },
    { key: 'b1', depth: 1 },
  ]

  it('opens every ancestor of a deep match', () => {
    const open = ancestorsOfMatches(rows, (r) => r.key === 'a1x')
    expect(open).toEqual(new Set(['a', 'a1']))
  })

  it('opens nothing for a top-level match', () => {
    expect(ancestorsOfMatches(rows, (r) => r.key === 'b')).toEqual(new Set())
  })

  it('does not leak ancestors across sibling branches', () => {
    // b1 must NOT drag in 'a' or 'a1' from the earlier branch.
    expect(ancestorsOfMatches(rows, (r) => r.key === 'b1')).toEqual(new Set(['b']))
  })

  it('unions ancestors across several matches', () => {
    const open = ancestorsOfMatches(rows, (r) => r.key === 'a1x' || r.key === 'b1')
    expect(open).toEqual(new Set(['a', 'a1', 'b']))
  })

  it('returns empty when nothing matches', () => {
    expect(ancestorsOfMatches(rows, () => false)).toEqual(new Set())
  })
})
