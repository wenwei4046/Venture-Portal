import { describe, it, expect } from 'vitest'
import { formatMoney, formatRate, cn } from './utils'

describe('formatMoney', () => {
  it('formats a positive integer with two decimal places', () => {
    expect(formatMoney(1234)).toBe('RM 1,234.00')
  })

  it('formats a fractional amount preserving two decimals', () => {
    expect(formatMoney(1234.5)).toBe('RM 1,234.50')
  })

  it('formats zero', () => {
    expect(formatMoney(0)).toBe('RM 0.00')
  })

  it('formats a negative amount with a leading minus', () => {
    // Note: the UI layer renders negatives as (X) parenthesis notation —
    // formatMoney itself returns the raw Intl format. See the statements
    // detail page for the parenthesis wrapper.
    expect(formatMoney(-1000)).toBe('RM -1,000.00')
  })

  it('formats large seven-figure amounts with thousand separators', () => {
    expect(formatMoney(1_234_567.89)).toBe('RM 1,234,567.89')
  })
})

describe('formatRate', () => {
  it('converts decimal rate to percentage with two decimals', () => {
    expect(formatRate(0.0525)).toBe('5.25%')
  })

  it('formats zero rate', () => {
    expect(formatRate(0)).toBe('0.00%')
  })

  it('rounds to two decimal places', () => {
    expect(formatRate(0.123456)).toBe('12.35%')
  })
})

describe('cn — class name joiner', () => {
  it('joins truthy class names with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filters out falsy values', () => {
    expect(cn('a', null, undefined, false, 'b')).toBe('a b')
  })

  it('returns empty string when all values are falsy', () => {
    expect(cn(null, undefined, false)).toBe('')
  })
})
