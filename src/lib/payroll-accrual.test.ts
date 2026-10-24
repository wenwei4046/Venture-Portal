import { describe, it, expect } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'
import { batchAccrualSums, buildAccrualLines, sumPayrollRows, accrualTotal, segmentLabel, postPayrollBatchAccrualJVs, type AccrualSums } from './payroll-accrual'
import type { JournalLine } from './journal'

const debitOn = (lines: JournalLine[], code: string) => Math.round(lines.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit ?? 0), 0) * 100) / 100
const totals = (lines: JournalLine[]) => ({
  dr: Math.round(lines.reduce((s, l) => s + (l.debit ?? 0), 0) * 100) / 100,
  cr: Math.round(lines.reduce((s, l) => s + (l.credit ?? 0), 0) * 100) / 100,
})

// HOUZS Venture's director share puts Venture Office's part in segment
// 'corporate' (mig 20261013233000); the E2E of 2026-10-13 posted it as
// "corporate Salary - Dec'27 · batch #1" before Venture Office had a label.
describe('segmentLabel', () => {
  it('names every segment a payroll batch books, Venture Office’s included', () => {
    expect(['hr', 'finance', 'marketing', 'director_office', 'director', 'it', 'revenue_department', 'corporate'].map(segmentLabel)).toEqual([
      'HR', 'Finance', 'Marketing', 'Director Office', 'Director', 'IT', 'Revenue Department', 'Venture Office',
    ])
  })

  it('keeps a segment it does not know as it is', () => {
    expect(segmentLabel('treasury')).toBe('treasury')
  })
})

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

// 2026-10-21 (user: 这些扣款你就 accrual salary 少进就行 → 那accrual 分开底薪和佣金记 →
// 对，跟8月一样分开记 → 自动 accrual 也改成这样): Revenue Department's Sep'26
// batch #3 carried RM 4,677.73 of pay-line deductions (drop sales, PETER's
// 4,000), its JV came out that much out of balance and never posted. The
// deductions now lower the salary; a commission team's pay splits the way
// JE-202609-0945 was posted by hand.
const revenueSep = {
  segment: 'revenue_department', gross: '254378.44', non_statutory_allowance: '0.00', epf_er: '6180.00', epf_ee: '5610.00',
  socso_er: '623.95', socso_ee: '178.25', eis_er: '71.30', eis_ee: '71.30', pcb: '6433.80', withholding_tax: '1613.11',
  net: '235589.80', skbbk: '204.45',
}
const revenueSepSplit = { segment: 'revenue_department', salary: '249700.71', basic: '51000.00', travelling: '4760.27', accommodation: '3469.83', food: '2672.00' }

describe('a batch with pay-line deductions (Revenue Sep\'26)', () => {
  it('books the salary net of them, so the JV balances', () => {
    const sums = batchAccrualSums(revenueSep)
    expect(sums.deductions).toBe(4677.73)
    const lines = buildAccrualLines(sums, "Sep'26")
    expect(debitOn(lines, '9030')).toBe(249700.71)
    expect(totals(lines)).toEqual({ dr: 256575.96, cr: 256575.96 })
    expect(accrualTotal(sums)).toBe(256575.96)
  })

  it('splits a commission team as August: basic 9030, commission 9093, claims to Travelling, Hostel and Staff Allowance', () => {
    const sums = batchAccrualSums(revenueSep, revenueSepSplit)
    const lines = buildAccrualLines(sums, "Sep'26")
    expect(['9030', '9093', '9090', '9098', '9084'].map(code => debitOn(lines, code))).toEqual([51000, 187798.61, 4760.27, 3469.83, 2672])
    expect(totals(lines)).toEqual({ dr: 256575.96, cr: 256575.96 })
    expect(accrualTotal(sums)).toBe(256575.96)
  })

  it('takes a commission part below nothing off 9093 as a credit', () => {
    // PEI FEN alone: commission 2,748.10 carries her basic 2,500 and the
    // company's 372.75; with her 524 of food the rest of it is −124.65.
    const sums = batchAccrualSums(
      { segment: 'revenue_department', gross: 2899.35, non_statutory_allowance: 0, epf_er: 325, epf_ee: 275, socso_er: 42.85, socso_ee: 12.25, eis_er: 4.9, eis_ee: 4.9, pcb: 0, withholding_tax: 0, net: 2607.2, skbbk: 0 },
      { segment: 'revenue_department', salary: 2899.35, basic: 2500, travelling: 0, accommodation: 0, food: 524 },
    )
    const lines = buildAccrualLines(sums, "Sep'26")
    expect(lines.find(l => l.accountCode === '9093')?.credit).toBe(124.65)
    expect(totals(lines)).toEqual({ dr: 3396.75, cr: 3396.75 })
  })

  it('leaves a department without commission as it was', () => {
    const sums = batchAccrualSums({ ...revenueSep, segment: 'finance', gross: 1500, non_statutory_allowance: 0, epf_er: 195, epf_ee: 165, socso_er: 26.2, socso_ee: 7.5, eis_er: 3, eis_ee: 3, pcb: 77.05, withholding_tax: 0, net: 1247.45, skbbk: 0 })
    expect(sums.deductions).toBe(0)
    expect(buildAccrualLines(sums, "Sep'26").map(l => l.accountCode)).toEqual(['9030', '9081', '9082', '9083', '4070', '4071', '4072', '4073', '4074'])
  })
})

describe('sumPayrollRows with a deduction (the run approval)', () => {
  it('books the salary net of it', () => {
    // STANLEY's Sep'26 row: RM 117.80 of drop sales between gross and net.
    const sums = sumPayrollRows([{
      gross: 17294.94, non_statutory_allowance: 0, epf_er: 840, epf_ee: 770, socso_er: 104.15, socso_ee: 29.75,
      eis_er: 11.9, eis_ee: 11.9, pcb: 930, withholding_tax: 0, net: 15435.49, skbbk_amount: 0,
    }])
    expect(sums.deductions).toBe(117.8)
    const lines = buildAccrualLines(sums, "Sep'26")
    expect(debitOn(lines, '9030')).toBe(17177.14)
    expect(totals(lines).dr).toBe(totals(lines).cr)
  })
})

describe('posting a batch\'s accrual', () => {
  function database(existing: Array<{ segment: string; total_amount: number }> = []) {
    return recordingSupabase(
      call => (call.table === 'payroll_batches' ? { data: { batch_no: 3 } } : {}),
      fn =>
        fn === 'payroll_batch_accrual_sums' ? { data: [revenueSep] }
        : fn === 'payroll_batch_commission_split' ? { data: [revenueSepSplit] }
        : fn === 'get_payroll_accrual_totals_for' ? { data: existing }
        : fn === 'post_journal_entry_as_caller' ? { data: 'je-new' }
        : {},
    )
  }

  it('posts a commission team\'s batch split and net of its deductions', async () => {
    const db = database()
    const result = await postPayrollBatchAccrualJVs(db.client as never, { periodMonth: '2026-09-01', batchId: 'batch-3', userId: 'hr-manager' })
    expect(result.posted).toEqual(['revenue_department'])
    const post = db.rpcs.find(r => r.fn === 'post_journal_entry_as_caller')?.args as { p_description: string; p_segment: string; p_transaction_date: string; p_lines: Array<{ account_code: string; debit: number | null }> }
    expect(post).toMatchObject({ p_description: "Revenue Department Salary - Sep'26 · batch #3", p_segment: 'revenue_department', p_transaction_date: '2026-09-30' })
    const debit = (code: string) => post.p_lines.filter(l => l.account_code === code).reduce((s, l) => s + (l.debit ?? 0), 0)
    expect(['9030', '9093', '9090', '9098', '9084'].map(debit)).toEqual([51000, 187798.61, 4760.27, 3469.83, 2672])
  })

  it('leaves alone a batch already accrued at that total (JE-202609-0945, posted by hand)', async () => {
    const db = database([{ segment: 'revenue_department', total_amount: 256575.96 }])
    const result = await postPayrollBatchAccrualJVs(db.client as never, { periodMonth: '2026-09-01', batchId: 'batch-3', userId: 'hr-manager' })
    expect(result).toEqual({ posted: [], skipped: ['revenue_department'] })
    expect(db.rpcs.some(r => r.fn === 'post_journal_entry_as_caller')).toBe(false)
  })
})

// 2026-10-24 (HR: "kris and peter PCB I updated amount Kris - RM647.90 Peter -
// RM1429.15"): a resubmit may lower a deduction no PV pays yet. September's
// batch #4, as production's dry run built it: KRIS PCB −1,174.00 and PETER
// −392.75, their net pay up by the same, nothing to fund. The payable that came
// down goes on the debit side — before, a negative credit was dropped and the
// JV either came out empty (and was skipped) or out of balance.
const revenueSepResubmit = {
  segment: 'revenue_department', gross: '0.00', non_statutory_allowance: '0.00', epf_er: '0.00', epf_ee: '0.00',
  socso_er: '0.00', socso_ee: '0.00', eis_er: '0.00', eis_ee: '0.00', pcb: '-1566.75', withholding_tax: '0.00',
  net: '1566.75', skbbk: '0.00',
}

describe('a resubmit that lowered a deduction (Revenue Sep\'26 batch #4)', () => {
  it('moves the PCB payable to the salary payable: Dr 4074 / Cr 4070', () => {
    const sums = batchAccrualSums(revenueSepResubmit, { segment: 'revenue_department', salary: '0.00', basic: '0.00', travelling: '0.00', accommodation: '0.00', food: '0.00' })
    expect(sums.deductions).toBe(0)
    const lines = buildAccrualLines(sums, "Sep'26")
    expect(lines.map(l => [l.accountCode, l.debit ?? null, l.credit ?? null])).toEqual([
      ['4070', null, 1566.75],
      ['4074', 1566.75, null],
    ])
    expect(lines.find(l => l.accountCode === '4074')?.description).toBe("PCB Payable - Sep'26")
    expect(accrualTotal(sums)).toBe(1566.75)
  })

  it('balances a lowered employee EPF beside a raised employer EPF', () => {
    // EPF employee −100, employer +100: KWSP owes the same, the net pay +100 is funded by the CTC +100.
    const lines = buildAccrualLines(batchAccrualSums({ ...revenueSepResubmit, pcb: 0, epf_er: 100, epf_ee: -100, net: 100 }), "Sep'26")
    expect(totals(lines)).toEqual({ dr: 100, cr: 100 })
    expect(lines.map(l => l.accountCode)).toEqual(['9081', '4070'])
  })

  it('posts the batch as the HR user', async () => {
    const db = recordingSupabase(
      call => (call.table === 'payroll_batches' ? { data: { batch_no: 4 } } : {}),
      fn =>
        fn === 'payroll_batch_accrual_sums' ? { data: [revenueSepResubmit] }
        : fn === 'payroll_batch_commission_split' ? { data: [] }
        : fn === 'get_payroll_accrual_totals_for' ? { data: [] }
        : fn === 'post_journal_entry_as_caller' ? { data: 'je-new' }
        : {},
    )
    const result = await postPayrollBatchAccrualJVs(db.client as never, { periodMonth: '2026-09-01', batchId: 'batch-4', userId: 'hr-manager' })
    expect(result.posted).toEqual(['revenue_department'])
    const post = db.rpcs.find(r => r.fn === 'post_journal_entry_as_caller')?.args as { p_description: string; p_lines: Array<{ account_code: string; debit: number | null; credit: number | null }> }
    expect(post.p_description).toBe("Revenue Department Salary - Sep'26 · batch #4")
    expect(post.p_lines.map(l => [l.account_code, l.debit, l.credit])).toEqual([['4070', null, 1566.75], ['4074', 1566.75, null]])
  })
})
