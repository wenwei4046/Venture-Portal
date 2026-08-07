import { describe, it, expect } from 'vitest'
import { buildAccrualLines, sumPayrollRows, accrualTotal, type AccrualSums } from './payroll-accrual'

// June Finance — the known-good fixture, verified to the sen against the
// manually-booked JE-202606-0228.
const juneFinance: AccrualSums = {
  basicEtc: 20344.56,
  nonStatAllowance: 600,
  epfEr: 2562,
  socsoEr: 336.95,
  eisEr: 38.5,
  net: 18162.01,
  epfBoth: 4789,
  socsoBoth: 433.2,
  skbbk: 144.45,
  eisBoth: 77,
  pcb: 276.35,
}

describe('buildAccrualLines', () => {
  it('replicates the manual JV line set and balances', () => {
    const lines = buildAccrualLines(juneFinance, "Jun'26")
    expect(lines).toHaveLength(11)
    const dr = lines.reduce((s, l) => s + (l.debit ?? 0), 0)
    const cr = lines.reduce((s, l) => s + (l.credit ?? 0), 0)
    expect(Math.round(dr * 100)).toBe(Math.round(cr * 100))
    expect(dr).toBeCloseTo(23882.01, 2)
    expect(lines.find(l => l.accountCode === '9030')?.debit).toBe(20344.56)
    expect(lines.filter(l => l.accountCode === '4072').map(l => l.credit)).toEqual([433.2, 144.45])
    expect(lines.find(l => l.accountCode === '4074')?.credit).toBe(276.35)
  })

  it('skips zero lines (June director had no allowance)', () => {
    const lines = buildAccrualLines({ ...juneFinance, nonStatAllowance: 0 }, "Jun'26")
    expect(lines.find(l => l.accountCode === '9084')).toBeUndefined()
    expect(lines).toHaveLength(10)
  })
})

describe('sumPayrollRows', () => {
  it('aggregates the verified mapping (gross − non-stat drives 9030)', () => {
    const s = sumPayrollRows([
      {
        gross: 5700, non_statutory_allowance: 200, epf_er: 660, epf_ee: 605,
        socso_er: 95.35, socso_ee: 27.25, eis_er: 10.9, eis_ee: 10.9,
        pcb: 122.75, net: 4893.25, skbbk_amount: 40.85,
      },
    ])
    expect(s.basicEtc).toBe(5500)
    expect(s.nonStatAllowance).toBe(200)
    expect(s.epfBoth).toBe(1265)
    expect(s.socsoBoth).toBe(122.6)
    expect(s.skbbk).toBe(40.85)
    expect(s.eisBoth).toBe(21.8)
    expect(accrualTotal(s)).toBe(6466.25) // June DO JV total (JE-202606-0227)
  })
})
