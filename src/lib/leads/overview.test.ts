import { describe, expect, it } from 'vitest'
import { daysIn, figuresOf, isBranding, overviewRange, pct, rm, spendStale, times, type OverviewData } from './overview'

// The owner's sheet (2026-11-17), its "Performance Overview": spend RM15,906.40 (with SST), 560 inquiries, 62 visits,
// 44 orders, RM158,895 sales → CPL RM28.40, visit rate 11.07%, conversion 70.97%, ROAS 9.99, 10.01%, CPA RM361.51,
// AOV RM3,611.25.
const sheet: OverviewData = {
  inquiries: [{ outletId: 'kj', n: 500 }, { outletId: null, n: 60 }],
  visits: [{ outletId: 'kj', source: 'facebook', n: 62 }],
  sales: [{ outletId: 'kj', source: 'facebook', orders: 44, amount: 158895 }],
  spend: [{ outletId: 'kj', funnel: 15906.4 / 1.08, branding: 0 }],
  accounts: [],
}

describe('figuresOf', () => {
  it('works the sheet out the same', () => {
    const f = figuresOf(sheet, () => true, 46)
    expect(rm(f.spend)).toBe('RM15,906.40')
    expect(f.inquiries).toBe(560)
    expect(rm(f.cpl)).toBe('RM28.40')
    expect(pct(f.visitRate)).toBe('11.07%')
    expect(pct(f.conversion)).toBe('70.97%')
    expect(times(f.roas)).toBe('9.99')
    expect(pct(f.spendShare)).toBe('10.01%')
    expect(rm(f.cpa)).toBe('RM361.51')
    expect(rm(f.aov)).toBe('RM3,611.25')
    expect(rm(f.avgDaily)).toBe('RM345.79')
    expect(f.salesBy.facebook).toBe(158895)
    expect(f.visitsBy.facebook).toBe(62)
  })
  it('keeps to the outlets asked; nothing to divide reads —', () => {
    const f = figuresOf(sheet, o => o === 'pj', 30)
    expect([f.spend, f.inquiries, f.cpl, f.roas, f.aov]).toEqual([0, 0, null, null, null])
    expect(figuresOf(sheet, o => o === null, 30).inquiries).toBe(60)
  })
  it('adds SST to Meta’s spend, funnel and branding apart', () => {
    const f = figuresOf({ ...sheet, spend: [{ outletId: 'kj', funnel: 100, branding: 50 }] }, () => true, 1)
    expect([f.metaSpend, Math.round(f.spend * 100) / 100, Math.round(f.funnel * 100) / 100, Math.round(f.branding * 100) / 100]).toEqual([150, 162, 108, 54])
  })
})

describe('overviewRange', () => {
  it('opens on this month; last month is the whole of it; custom stays inside a year and today', () => {
    expect(overviewRange(undefined, '2026-11-17')).toMatchObject({ key: 'month', from: '2026-11-01', to: '2026-11-17', label: 'Nov 2026' })
    expect(overviewRange('last', '2026-01-10')).toMatchObject({ from: '2025-12-01', to: '2025-12-31', label: 'Dec 2025' })
    expect(overviewRange('7', '2026-11-17')).toMatchObject({ from: '2026-11-11', to: '2026-11-17' })
    expect(overviewRange('custom', '2026-11-17', '2026-11-01', '2026-12-31')).toMatchObject({ from: '2026-11-01', to: '2026-11-17' })
    expect(overviewRange('custom', '2026-11-17', '2020-01-01', '2026-11-17').from).toBe('2025-11-17')
  })
})

describe('the rest', () => {
  it('counts days both ends included', () => {
    expect([daysIn('2026-11-01', '2026-11-30'), daysIn('2026-11-17', '2026-11-17')]).toEqual([30, 1])
  })
  it('reads awareness, reach and video views as branding', () => {
    expect(['OUTCOME_AWARENESS', 'reach', 'VIDEO_VIEWS'].every(isBranding)).toBe(true)
    expect(['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'MESSAGES', null].some(isBranding)).toBe(false)
  })
  it('asks Meta for days not read, and the recent days again after an hour', () => {
    const now = Date.parse('2026-11-17T10:00:00Z')
    const acct = (days: number, fetchedAt: string | null) => [{ accountId: '1', name: 'A', outletId: null, fetchedAt, days }]
    expect(spendStale([], '2026-10-01', '2026-10-31', '2026-11-17', now)).toBe(true)
    expect(spendStale(acct(30, '2026-11-01T08:30:00Z'), '2026-10-01', '2026-10-31', '2026-11-17', now)).toBe(true)
    expect(spendStale(acct(31, '2026-11-01T08:30:00Z'), '2026-10-01', '2026-10-31', '2026-11-17', now)).toBe(false)
    expect(spendStale(acct(17, '2026-11-17T09:30:00Z'), '2026-11-01', '2026-11-17', '2026-11-17', now)).toBe(false)
    expect(spendStale(acct(17, '2026-11-17T08:30:00Z'), '2026-11-01', '2026-11-17', '2026-11-17', now)).toBe(true)
  })
})
