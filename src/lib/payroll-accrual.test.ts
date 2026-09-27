import { describe, it, expect } from 'vitest'
import { batchAccrualSums, buildAccrualLines, sumPayrollRows, accrualTotal, type AccrualSums } from './payroll-accrual'

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
  it('balances a revenue commission budget with self-funded EPF and withholding', () => {
    // 10,000 budget = 9,350 gross + 650 ER; 8,613 net = gross - 550 EE - 187 WHT.
    const sums = sumPayrollRows([{
      gross: 9350, non_statutory_allowance: 0, epf_er: 650, epf_ee: 550,
      socso_er: 0, socso_ee: 0, eis_er: 0, eis_ee: 0,
      pcb: 0, withholding_tax: 187, net: 8613, skbbk_amount: 0,
    }])
    const lines = buildAccrualLines(sums, "Sep'26")
    expect(accrualTotal(sums)).toBe(10000)
    expect(lines.reduce((sum, line) => sum + (line.debit ?? 0), 0)).toBe(10000)
    expect(lines.reduce((sum, line) => sum + (line.credit ?? 0), 0)).toBe(10000)
    expect(lines.find(line => line.description?.startsWith('Withholding Tax Payable'))?.credit).toBe(187)
  })

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

describe('batchAccrualSums (unified Payroll, one batch)', () => {
  it('books a resubmit — only the difference — as a balanced JV', () => {
    // The dry-run top-up of 2026-09-27: basic +1,500 on one Finance row.
    const sums = batchAccrualSums({
      segment: 'finance', gross: 1500, non_statutory_allowance: 0,
      epf_er: 195, epf_ee: 165, socso_er: 26.2, socso_ee: 7.5, eis_er: 3, eis_ee: 3,
      pcb: 77.05, withholding_tax: 0, net: 1247.45, skbbk: 0,
    })
    expect(accrualTotal(sums)).toBe(1724.2)
    const lines = buildAccrualLines(sums, "Sep'26")
    const dr = lines.reduce((s, l) => s + (l.debit ?? 0), 0)
    const cr = lines.reduce((s, l) => s + (l.credit ?? 0), 0)
    expect(Math.round(dr * 100)).toBe(Math.round(cr * 100))
    expect(lines.find(l => l.accountCode === '4070')?.credit).toBe(1247.45)
  })

  it('reads the RPC\'s numeric strings', () => {
    const sums = batchAccrualSums({
      segment: 'director', gross: '14400.00', non_statutory_allowance: '0', epf_er: '1872.00', epf_ee: '1584.00',
      socso_er: '0', socso_ee: '0', eis_er: '0', eis_ee: '0', pcb: '1816.00', withholding_tax: '0', net: '11000.00', skbbk: '0',
    })
    expect(sums).toMatchObject({ basicEtc: 14400, epfEr: 1872, epfBoth: 3456, net: 11000 })
    expect(accrualTotal(sums)).toBe(16272)
  })
})
