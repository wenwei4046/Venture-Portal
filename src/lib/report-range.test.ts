import { describe, expect, it } from 'vitest'
import { crossYearFromChoices, fromChoices, rangeLabel, reportRange, shiftMonth, toChoices } from './report-range'

// 2026-10-09 — the month-by-month reports' From – To (the user's Claude Design handoff).

describe('a report period', () => {
  it('runs from January to this month unless asked', () => {
    expect(reportRange({}, '2026-10')).toEqual({ from: '2026-01', to: '2026-10', year: 2026, throughMonth: 10, wholeYear: true })
  })
  it('takes From and To in one year', () => {
    expect(reportRange({ from: '2026-05', period: '2026-09' }, '2026-10')).toEqual({ from: '2026-05', to: '2026-09', year: 2026, throughMonth: 9, wholeYear: false })
  })
  it('puts a From after To, or in another year, back to January', () => {
    expect(reportRange({ from: '2026-11', period: '2026-09' }, '2026-10').from).toBe('2026-01')
    expect(reportRange({ from: '2025-11', period: '2026-03' }, '2026-10').from).toBe('2026-01')
    expect(reportRange({ from: 'junk', period: 'junk' }, '2026-10').to).toBe('2026-10')
  })
})

// 2026-10-25 — a department's page reaches back across the year: its "12 months" is Nov – Oct.
describe('a period across the year', () => {
  it('takes a From up to eleven months before To, and says where the builders start', () => {
    expect(reportRange({ from: '2025-11', period: '2026-10' }, '2026-10', { crossYear: true })).toEqual({
      from: '2025-11',
      to: '2026-10',
      year: 2026,
      throughMonth: 10,
      wholeYear: false,
      buildFrom: '2025-11',
    })
  })
  it('keeps a From in To’s year as the reports take it, with nothing to start earlier', () => {
    expect(reportRange({ from: '2026-05', period: '2026-10' }, '2026-10', { crossYear: true })).toEqual({ from: '2026-05', to: '2026-10', year: 2026, throughMonth: 10, wholeYear: false })
  })
  it('puts a From further back, or after To, to January', () => {
    expect(reportRange({ from: '2025-10', period: '2026-10' }, '2026-10', { crossYear: true }).from).toBe('2026-01')
    expect(reportRange({ from: '2026-11', period: '2026-10' }, '2026-10', { crossYear: true }).from).toBe('2026-01')
  })
  it('offers the twelve months up to To', () => {
    const from = crossYearFromChoices('2026-10')
    expect(from).toHaveLength(12)
    expect(from[0]).toBe('2025-11')
    expect(from[11]).toBe('2026-10')
    expect(shiftMonth('2026-03', -5)).toBe('2025-10')
  })
})

describe('its words and choices', () => {
  it('names the range', () => {
    expect(rangeLabel('2026-01', '2026-10')).toBe('Jan – Oct 2026')
    expect(rangeLabel('2026-10', '2026-10')).toBe('Oct 2026')
    expect(rangeLabel('2025-11', '2026-10')).toBe('Nov 2025 – Oct 2026')
  })
  it('offers To back to January last year, latest first, and From up to To', () => {
    const to = toChoices('2026-03')
    expect(to[0]).toBe('2026-03')
    expect(to[to.length - 1]).toBe('2025-01')
    expect(to).toHaveLength(15)
    expect(fromChoices('2026-03')).toEqual(['2026-01', '2026-02', '2026-03'])
  })
})
