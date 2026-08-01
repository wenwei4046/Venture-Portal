import { describe, it, expect } from 'vitest'
import {
  allocateExpense,
  billedTotal,
  headcountByCompany,
  type AllocCompany,
  type StaffSplit,
} from '@/lib/billing-allocator'

const COS: AllocCompany[] = [
  { id: 'conts', label: 'CONTS' },
  { id: 'car', label: 'CAR' },
  { id: 'hc', label: 'HC' },
]

// 2 full-timers at CONTS, one 50/50 CAR+own, one full own.
const STAFF: StaffSplit[] = [
  { companyId: 'conts', pct: 100 },
  { companyId: 'conts', pct: 100 },
  { companyId: 'car', pct: 50 },
  { companyId: null, pct: 50 },
  { companyId: null, pct: 100 },
]

describe('headcountByCompany', () => {
  it('sums split percentages into FTE heads', () => {
    const hc = headcountByCompany(STAFF)
    expect(hc.get('conts')).toBe(2)
    expect(hc.get('car')).toBe(0.5)
    expect(hc.get(null)).toBe(1.5)
  })
})

describe('allocateExpense — headcount', () => {
  it('allocates by FTE share with the own share flagged, not billed', () => {
    const lines = allocateExpense(
      { description: 'Rent', amount: 4000, method: 'headcount' },
      { companies: COS, staffSplits: STAFF, hcLabel: '2026-07' },
    )
    // total 4 heads: own 1.5, conts 2, car 0.5
    const own = lines.find((l) => l.isOwnShare)!
    expect(own.companyId).toBeNull()
    expect(own.amount).toBe(1500)
    expect(own.detail).toContain('1.50/4.00')
    expect(own.detail).toContain('2026-07')
    expect(lines.find((l) => l.companyId === 'conts')!.amount).toBe(2000)
    expect(lines.find((l) => l.companyId === 'car')!.amount).toBe(500)
    expect(billedTotal(lines)).toBe(2500) // own 1500 excluded
  })

  it('throws when there is no headcount at all', () => {
    expect(() =>
      allocateExpense(
        { description: 'Rent', amount: 100, method: 'headcount' },
        { companies: COS, staffSplits: [] },
      ),
    ).toThrow(/no headcount/)
  })

  it('throws when headcount is own-only (nothing billable)', () => {
    expect(() =>
      allocateExpense(
        { description: 'Rent', amount: 100, method: 'headcount' },
        { companies: COS, staffSplits: [{ companyId: null, pct: 100 }] },
      ),
    ).toThrow(/allocates nothing/)
  })
})

describe('allocateExpense — percentage', () => {
  it('splits by percentage and lands the penny on the last row', () => {
    const lines = allocateExpense(
      {
        description: 'Software',
        amount: 100,
        method: 'percentage',
        percentSplits: [
          { companyId: 'conts', pct: 33.33 },
          { companyId: 'car', pct: 33.33 },
          { companyId: 'hc', pct: 33.34 },
        ],
      },
      { companies: COS, staffSplits: [] },
    )
    expect(lines.map((l) => l.amount)).toEqual([33.33, 33.33, 33.34])
    expect(billedTotal(lines)).toBe(100)
  })

  it('rejects percentages that do not total 100', () => {
    expect(() =>
      allocateExpense(
        {
          description: 'X',
          amount: 100,
          method: 'percentage',
          percentSplits: [{ companyId: 'conts', pct: 60 }],
        },
        { companies: COS, staffSplits: [] },
      ),
    ).toThrow(/total 100/)
  })
})

describe('allocateExpense — equal', () => {
  it('splits equally and reconstructs the amount exactly', () => {
    const lines = allocateExpense(
      { description: 'Misc', amount: 100, method: 'equal' },
      { companies: COS, staffSplits: [] },
    )
    // 33.33 × 3 = 99.99 → last row picks up the penny.
    expect(lines.map((l) => l.amount)).toEqual([33.33, 33.33, 33.34])
    expect(billedTotal(lines)).toBe(100)
  })
})

describe('allocateExpense — custom', () => {
  it('takes amounts as typed with no reconciliation', () => {
    const lines = allocateExpense(
      {
        description: 'One-off',
        amount: 500,
        method: 'custom',
        customSplits: [
          { companyId: 'conts', amount: 300 },
          { companyId: 'car', amount: 150 },
        ],
      },
      { companies: COS, staffSplits: [] },
    )
    expect(billedTotal(lines)).toBe(450) // deliberately ≠ 500, script parity
    expect(lines.every((l) => l.detail === 'Custom')).toBe(true)
  })
})

describe('validation', () => {
  it('rejects a non-positive amount', () => {
    expect(() =>
      allocateExpense(
        { description: 'X', amount: 0, method: 'equal' },
        { companies: COS, staffSplits: [] },
      ),
    ).toThrow(/positive/)
  })

  it('rejects an unknown company in splits', () => {
    expect(() =>
      allocateExpense(
        {
          description: 'X',
          amount: 10,
          method: 'custom',
          customSplits: [{ companyId: 'ghost', amount: 10 }],
        },
        { companies: COS, staffSplits: [] },
      ),
    ).toThrow(/unknown company/)
  })
})
