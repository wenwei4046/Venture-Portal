import { describe, it, expect } from 'vitest'
import { addMonths, buildInstallmentAging, monthsBetween, sumBuckets } from './loan-aging'

describe('month helpers', () => {
  it('monthsBetween / addMonths', () => {
    expect(monthsBetween('2026-04', '2026-07')).toBe(3)
    expect(monthsBetween('2026-07', '2026-07')).toBe(0)
    expect(monthsBetween('2026-08', '2026-07')).toBe(-1)
    expect(addMonths('2026-11', 2)).toBe('2027-01')
  })
})

describe('buildInstallmentAging', () => {
  // 12,000 @ 1%/mo × 12 → installment 1,000 + 120 = 1,120
  const base = { principal: 12000, monthlyRate: 0.01, tenureMonths: 12 }

  it('nothing due before the first installment month', () => {
    const b = buildInstallmentAging({ ...base, firstDueYM: '2026-08', asOfYM: '2026-07', totalPaid: 0 })
    expect(b.total).toBe(0)
  })

  it('ages unpaid installments into the right buckets', () => {
    // first due May; as of Jul → May (2 mo late), Jun (1), Jul (current)
    const b = buildInstallmentAging({ ...base, firstDueYM: '2026-05', asOfYM: '2026-07', totalPaid: 0 })
    expect(b).toEqual({ current: 1120, m1: 1120, m2: 1120, m3: 0, total: 3360 })
  })

  it('allocates payments FIFO — oldest due first', () => {
    // paid exactly one installment → May cleared, Jun + Jul remain
    const b = buildInstallmentAging({ ...base, firstDueYM: '2026-05', asOfYM: '2026-07', totalPaid: 1120 })
    expect(b).toEqual({ current: 1120, m1: 1120, m2: 0, m3: 0, total: 2240 })
  })

  it('partial payment leaves the remainder on the oldest installment', () => {
    const b = buildInstallmentAging({ ...base, firstDueYM: '2026-05', asOfYM: '2026-07', totalPaid: 1000 })
    expect(b.m2).toBe(120)
    expect(b.total).toBe(2360)
  })

  it('lumps 3+ months into m3', () => {
    const b = buildInstallmentAging({ ...base, firstDueYM: '2026-01', asOfYM: '2026-07', totalPaid: 0 })
    // Jan–Apr are 3+ months late (ages 6,5,4,3), May=2, Jun=1, Jul=current
    expect(b.m3).toBe(4480)
    expect(b.total).toBe(7840)
  })

  it('sumBuckets totals per column', () => {
    const a = buildInstallmentAging({ ...base, firstDueYM: '2026-06', asOfYM: '2026-07', totalPaid: 0 })
    const s = sumBuckets([a, a])
    expect(s.current).toBe(2240)
    expect(s.m1).toBe(2240)
    expect(s.total).toBe(4480)
  })
})
