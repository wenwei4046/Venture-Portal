import { describe, it, expect } from 'vitest'
import { formatMoney, formatMoneyBare, formatRate, cn, fundingSourceFromTerms } from './utils'

describe('fundingSourceFromTerms', () => {
  it('extracts 资金来源: value up to the next · separator', () => {
    expect(fundingSourceFromTerms('EMI 分期 · 月息4% · 6期 · [LO#3] · 资金来源: HC-58k')).toBe('HC-58k')
    expect(fundingSourceFromTerms('一次还清 · 月息2% · 1期 · [LO#13] · 资金来源: MK')).toBe('MK')
    expect(fundingSourceFromTerms('自定义分期 · 月息2% · 2期 · Kingsley经手 · [LO#11] · 资金来源: WL-King')).toBe('WL-King')
  })
  it('extracts the 资金从…借过来 form', () => {
    expect(fundingSourceFromTerms('新增 · 利息/期数/方式未定 · 放款日2026-04-30 · [LO-NEW-2990] · 资金从 Kingsley 借过来')).toBe('Kingsley')
  })
  it('supports full-width colon', () => {
    expect(fundingSourceFromTerms('EMI 分期 · 资金来源：2990')).toBe('2990')
  })
  it('returns null when no remark', () => {
    expect(fundingSourceFromTerms('EMI 分期 · 月息4% · 6期')).toBeNull()
    expect(fundingSourceFromTerms(null)).toBeNull()
    expect(fundingSourceFromTerms('')).toBeNull()
  })
})

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

  it('formats a negative amount in parenthesis notation (DESIGN.md contra format)', () => {
    // Negatives use accounting parenthesis, NOT a leading minus.
    // DESIGN.md: "| Negative (contra) | `(1,234.56)` | mono + `--danger` color |"
    expect(formatMoney(-1000)).toBe('RM (1,000.00)')
  })

  it('formats a negative fractional amount in parenthesis notation', () => {
    expect(formatMoney(-5847.7)).toBe('RM (5,847.70)')
  })

  it('formats null and undefined as zero (not a negative)', () => {
    expect(formatMoney(null)).toBe('RM 0.00')
    expect(formatMoney(undefined)).toBe('RM 0.00')
  })

  it('formats large seven-figure amounts with thousand separators', () => {
    expect(formatMoney(1_234_567.89)).toBe('RM 1,234,567.89')
  })
})

describe('formatMoneyBare — no RM prefix', () => {
  it('formats a positive integer without RM prefix', () => {
    expect(formatMoneyBare(1234)).toBe('1,234.00')
  })

  it('formats zero without RM prefix', () => {
    expect(formatMoneyBare(0)).toBe('0.00')
  })

  it('formats a negative amount in parenthesis notation without RM', () => {
    expect(formatMoneyBare(-1000)).toBe('(1,000.00)')
  })

  it('formats a negative fractional amount without RM', () => {
    expect(formatMoneyBare(-5847.7)).toBe('(5,847.70)')
  })

  it('formats null and undefined as zero without RM', () => {
    expect(formatMoneyBare(null)).toBe('0.00')
    expect(formatMoneyBare(undefined)).toBe('0.00')
  })

  it('formats large seven-figure amounts with thousand separators', () => {
    expect(formatMoneyBare(1_234_567.89)).toBe('1,234,567.89')
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
