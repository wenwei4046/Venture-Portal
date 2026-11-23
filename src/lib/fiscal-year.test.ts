import { describe, expect, it } from 'vitest'
import { fyEndOf, fyFirstDay, fyLabel, fyStartOf } from './fiscal-year'

// 2026-11-24 — the user: "我的结账是在6月" … "第一年是2025一月到2026 6月".

describe('the financial year', () => {
  it('runs the first one eighteen months, January 2025 to June 2026', () => {
    for (const ym of ['2025-01', '2025-12', '2026-01', '2026-06']) {
      expect(fyStartOf(ym)).toBe('2025-01')
      expect(fyEndOf(ym)).toBe('2026-06')
    }
    expect(fyLabel('2026-03-31')).toBe('FY Jan 2025 – Jun 2026')
  })

  it('runs every one after it July to June', () => {
    expect(fyStartOf('2026-07')).toBe('2026-07')
    expect(fyStartOf('2026-12-31')).toBe('2026-07')
    expect(fyStartOf('2027-06-30')).toBe('2026-07')
    expect(fyEndOf('2026-11')).toBe('2027-06')
    expect(fyStartOf('2027-07')).toBe('2027-07')
    expect(fyFirstDay('2027-02-14')).toBe('2026-07-01')
    expect(fyLabel('2026-11')).toBe('FY Jul 2026 – Jun 2027')
  })

  it('stands the calendar year in before the company', () => {
    expect(fyStartOf('2024-08')).toBe('2024-01')
    expect(fyEndOf('2024-08')).toBe('2024-12')
  })
})
