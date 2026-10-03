import { describe, it, expect } from 'vitest'
import { formatMoney, formatMoneyBare, formatRate, cn, fundingSourceFromTerms, getPeriodMonth, lentToFromNotes, formatIntlDate } from './utils'

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

describe('lentToFromNotes', () => {
  it('extracts 借给: value up to the next separator', () => {
    expect(lentToFromNotes('HC 定存 · 借给: 2990')).toBe('2990')
    expect(lentToFromNotes('借给：CONTS · 2026-07 收')).toBe('CONTS')
  })
  it('accepts 借去 / 转借给 and the no-colon form', () => {
    expect(lentToFromNotes('这笔借去 2990')).toBe('2990')
    expect(lentToFromNotes('转借给: CAR')).toBe('CAR')
  })
  it('returns null when no remark', () => {
    expect(lentToFromNotes('普通存款,没转借')).toBeNull()
    expect(lentToFromNotes(null)).toBeNull()
    expect(lentToFromNotes('')).toBeNull()
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

describe('getPeriodMonth', () => {
  // Regression, 2026-09-07. `lib/hierarchy-writes.ts` had reimplemented this
  // from raw UTC, and the copy decided whether an effective-dated commission
  // position could be edited in place. For the first eight hours of every
  // month the two answers differed, and the wrong one overwrote a position a
  // run had already been computed against. The fix was to delete the copy —
  // these pin the behaviour it must keep delegating to.
  it('takes the month from Malaysian wall-clock time, not the server’s UTC', () => {
    // 2026-10-01 07:00 MYT is still 2026-09-30 23:00 in UTC.
    expect(getPeriodMonth(new Date('2026-09-30T23:00:00Z'))).toBe('2026-10-01')
  })

  it('has not rolled over eight hours earlier', () => {
    // 2026-09-30 15:59 UTC is 23:59 MYT on the 30th — still September.
    expect(getPeriodMonth(new Date('2026-09-30T15:59:00Z'))).toBe('2026-09-01')
    expect(getPeriodMonth(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10-01')
  })

  it('crosses a year boundary the same way', () => {
    expect(getPeriodMonth(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
    expect(getPeriodMonth(new Date('2026-12-31T15:59:59Z'))).toBe('2026-12-01')
  })

  it('pads a single-digit month, so the string sorts and compares as a date', () => {
    // The `effectiveFrom >= from` guard in hierarchy-writes.ts is a STRING
    // comparison; an unpadded '2026-9-01' would sort after '2026-10-01'.
    expect(getPeriodMonth(new Date('2026-03-15T04:00:00Z'))).toBe('2026-03-01')
  })
})

describe('formatIntlDate — three-letter months', () => {
  const sep4 = new Date('2026-09-04T00:00:00Z')

  it('spells September Sep in en-GB and en-MY, which write Sept', () => {
    // The Arena read "closed on 13 Sept" beside its brand weeks' "Closed 13 Sep" (2026-10-03).
    expect(formatIntlDate(sep4, { day: 'numeric', month: 'short', timeZone: 'UTC' }, 'en-GB')).toBe('4 Sep')
    expect(formatIntlDate(sep4, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })).toBe('4 Sep 2026')
  })

  it('keeps the order and the clock of the locale', () => {
    expect(formatIntlDate(sep4, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }, 'en-MY')).toMatch(/^4 Sep, 12:00\sam$/) // ICU puts a narrow no-break space before am
    expect(formatIntlDate(sep4, { day: 'numeric', month: 'short', timeZone: 'UTC' }, 'en-US')).toBe('Sep 4')
  })

  it('leaves the other months and long or numeric months alone', () => {
    expect(formatIntlDate(new Date('2026-06-30T00:00:00Z'), { day: 'numeric', month: 'short', timeZone: 'UTC' }, 'en-AU')).toBe('30 Jun')
    expect(formatIntlDate(sep4, { month: 'long', year: 'numeric', timeZone: 'UTC' }, 'en-GB')).toBe('September 2026')
    expect(formatIntlDate(sep4, { day: 'numeric', month: 'numeric', timeZone: 'UTC' }, 'en-GB')).toBe('04/09')
  })
})
