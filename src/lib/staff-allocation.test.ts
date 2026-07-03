import { describe, it, expect } from 'vitest'
import {
  validateAllocationRows,
  hvRemainderPct,
  allocationPreview,
  type AllocationRow,
} from './staff-allocation'

describe('validateAllocationRows', () => {
  it('accepts an empty list (fully HV-absorbed)', () => {
    expect(validateAllocationRows([])).toEqual({ ok: true })
  })

  it('accepts a split summing to exactly 100', () => {
    const rows: AllocationRow[] = [
      { companyId: 'a', pct: 21.83 },
      { companyId: 'b', pct: 32.73 },
      { companyId: 'c', pct: 45.44 },
    ]
    expect(validateAllocationRows(rows)).toEqual({ ok: true })
  })

  it('accepts a partial split (remainder = HV share)', () => {
    expect(
      validateAllocationRows([
        { companyId: 'a', pct: 21.83 },
        { companyId: 'b', pct: 32.73 },
        { companyId: 'c', pct: 32.73 },
      ]),
    ).toEqual({ ok: true })
  })

  it('rejects a missing company', () => {
    const r = validateAllocationRows([{ companyId: '', pct: 50 }])
    expect(r.ok).toBe(false)
  })

  it('rejects duplicate companies', () => {
    const r = validateAllocationRows([
      { companyId: 'a', pct: 30 },
      { companyId: 'a', pct: 20 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Duplicate')
  })

  it('rejects zero / negative / non-finite pct', () => {
    expect(validateAllocationRows([{ companyId: 'a', pct: 0 }]).ok).toBe(false)
    expect(validateAllocationRows([{ companyId: 'a', pct: -5 }]).ok).toBe(false)
    expect(validateAllocationRows([{ companyId: 'a', pct: NaN }]).ok).toBe(false)
  })

  it('rejects a sum above 100', () => {
    const r = validateAllocationRows([
      { companyId: 'a', pct: 60 },
      { companyId: 'b', pct: 40.01 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('100')
  })

  it('tolerates float noise at exactly 100', () => {
    // 3 × 33.33 + 0.01 = 100.00 with float representation noise
    const r = validateAllocationRows([
      { companyId: 'a', pct: 33.33 },
      { companyId: 'b', pct: 33.33 },
      { companyId: 'c', pct: 33.33 },
      { companyId: 'd', pct: 0.01 },
    ])
    expect(r).toEqual({ ok: true })
  })
})

describe('hvRemainderPct', () => {
  it('is 100 with no rows', () => {
    expect(hvRemainderPct([])).toBe(100)
  })

  it('computes the CHOW WAI MAN remainder (12.71%)', () => {
    expect(
      hvRemainderPct([
        { companyId: 'hc', pct: 21.83 },
        { companyId: 'carres', pct: 32.73 },
        { companyId: '2990', pct: 32.73 },
      ]),
    ).toBe(12.71)
  })

  it('clamps at 0 for a full split', () => {
    expect(hvRemainderPct([{ companyId: 'a', pct: 100 }])).toBe(0)
  })
})

describe('allocationPreview', () => {
  it('reproduces the CHOW WAI MAN example (gross 5700)', () => {
    const p = allocationPreview(5700, [
      { companyId: 'hc', pct: 21.83 },
      { companyId: 'carres', pct: 32.73 },
      { companyId: '2990', pct: 32.73 },
    ])
    expect(p.lines.map((l) => l.amount)).toEqual([1244.31, 1865.61, 1865.61])
    expect(p.billedTotal).toBe(4975.53)
    expect(p.hvAmount).toBe(724.47) // 12.71% Venture share
    expect(p.billedTotal + p.hvAmount).toBe(5700)
  })

  it('HV share absorbs rounding drift so totals always reconcile', () => {
    // 3 × 1/3 of RM100.01 → each line rounds to 33.34, billed 100.02 > cost
    // with a naive split; with a 99.99% split the remainder keeps books equal.
    const p = allocationPreview(100.01, [
      { companyId: 'a', pct: 33.33 },
      { companyId: 'b', pct: 33.33 },
      { companyId: 'c', pct: 33.33 },
    ])
    const sum = Math.round((p.billedTotal + p.hvAmount) * 100) / 100
    expect(sum).toBe(100.01)
  })

  it('zero rows → everything is HV share', () => {
    const p = allocationPreview(6265.25, [])
    expect(p.billedTotal).toBe(0)
    expect(p.hvAmount).toBe(6265.25)
  })
})
