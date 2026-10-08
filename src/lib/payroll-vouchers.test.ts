import { describe, expect, it } from 'vitest'
import {
  filterLockedBatches,
  foldPayrollPoolRows,
  isPayrollReference,
  lockPayrollBatches,
  payrollBatchLabel,
  poolRowVoucherNo,
  type LedgerFilters,
  type PayrollVoucherLike,
  type PoolRowLike,
} from './payroll-vouchers'

const pv = (over: Partial<PayrollVoucherLike>): PayrollVoucherLike => ({
  reference_type: 'payroll_disbursement',
  description: 'Payroll disbursement Sep 2026 — Aina binti Example',
  voucher_type: 'other',
  status: 'paid',
  amount: 1000,
  payment_date: '2026-10-05',
  created_at: '2026-10-01T03:00:00+00:00',
  ...over,
})

const NO_FILTER: LedgerFilters = {
  tab: 'all', typeFilter: '', poolFilter: '', fromFilter: '', toFilter: '', minFilter: null, maxFilter: null, qFilter: '',
}

describe('isPayrollReference', () => {
  it('knows the three kinds of voucher payroll produces, and nothing else', () => {
    expect(isPayrollReference('payroll_disbursement')).toBe(true)
    expect(isPayrollReference('payroll_statutory')).toBe(true)
    expect(isPayrollReference('payroll_payment_request')).toBe(true)
    expect(isPayrollReference('loan')).toBe(false)
    expect(isPayrollReference(null)).toBe(false)
    expect(isPayrollReference(undefined)).toBe(false)
  })
})

describe('payrollBatchLabel', () => {
  it('a salary voucher: the batch, without the person', () => {
    expect(payrollBatchLabel(pv({}))).toBe('Payroll disbursement Sep 2026')
    expect(payrollBatchLabel(pv({ description: 'Director salary Aug 2026 — Somebody' }))).toBe('Director salary Aug 2026')
  })

  it('a statutory voucher: the body and the month, without the department', () => {
    const kwsp = { reference_type: 'payroll_statutory', voucher_type: 'expense' }
    expect(payrollBatchLabel(pv({ ...kwsp, description: 'KWSP — Sep 2026 payroll (IT · 1 staff)' }))).toBe('KWSP Sep 2026')
    expect(payrollBatchLabel(pv({ ...kwsp, description: 'KWSP (EPF) — Jul 2026 payroll — HR' }))).toBe('KWSP (EPF) Jul 2026')
    expect(payrollBatchLabel(pv({ ...kwsp, description: 'PERKESO (SOCSO + EIS) — Jul 2026 payroll (Marketing + HR)' }))).toBe('PERKESO (SOCSO + EIS) Jul 2026')
  })

  it('a funding transfer: the month, without the department', () => {
    const transfer = { reference_type: 'payroll_payment_request', voucher_type: 'payroll_bank_transfer' }
    expect(payrollBatchLabel(pv({ ...transfer, description: 'Payroll bank transfer — Sep 2026 (IT)' }))).toBe('Payroll bank transfer Sep 2026')
    expect(payrollBatchLabel(pv({ ...transfer, description: 'Director salary bank transfer — Aug 2026' }))).toBe('Director salary bank transfer Aug 2026')
  })

  it('a description in no known shape is never used as the name — it may be the only place a person is', () => {
    expect(payrollBatchLabel(pv({ description: 'Salary for Aina binti Example' }))).toBe('Payroll disbursement Oct 2026')
    expect(payrollBatchLabel(pv({ description: null, payment_date: null }))).toBe('Payroll disbursement Oct 2026') // from created_at
    expect(payrollBatchLabel(pv({ reference_type: 'payroll_statutory', description: 'EPF top-up, Bala', payment_date: '2026-09-15' }))).toBe('Statutory contribution Sep 2026')
    expect(payrollBatchLabel(pv({ reference_type: 'payroll_payment_request', description: '', payment_date: null, created_at: 'not a date' }))).toBe('Payroll bank transfer')
  })
})

describe('lockPayrollBatches', () => {
  it('one line per batch: how many, how much, and where they stand', () => {
    const batches = lockPayrollBatches([
      pv({ amount: 3200.5 }),
      pv({ amount: '4100.25', description: 'Payroll disbursement Sep 2026 — Bala' }),
      pv({ amount: 2500, description: 'Payroll disbursement Sep 2026 — Chong', status: 'pending_approval', payment_date: null }),
    ])
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      label: 'Payroll disbursement Sep 2026',
      count: 3,
      total: 9800.75,
      latest: '2026-10-05',
      statusText: '2 paid · 1 pending approval',
      voucherType: 'other',
    })
    expect(batches[0].statuses.sort()).toEqual(['paid', 'pending_approval'])
  })

  it('a voided voucher is counted and named, but its money is not in the total', () => {
    const [batch] = lockPayrollBatches([
      pv({ amount: 1000 }),
      pv({ amount: 700, status: 'voided' }),
    ])
    expect(batch.count).toBe(2)
    expect(batch.total).toBe(1000)
    expect(batch.statusText).toBe('1 paid · 1 voided')
  })

  it('departments of one body and month fold together, so a one-person department has no line of its own', () => {
    const kwsp = { reference_type: 'payroll_statutory', voucher_type: 'expense', payment_date: '2026-09-15' }
    const batches = lockPayrollBatches([
      pv({ ...kwsp, description: 'KWSP — Sep 2026 payroll (IT · 1 staff)', amount: 1014 }),
      pv({ ...kwsp, description: 'KWSP — Sep 2026 payroll (HR · 3 staff)', amount: 3081 }),
      pv({ ...kwsp, description: 'SOCSO — Sep 2026 payroll (IT · 1 staff)', amount: 95.6 }),
    ])
    expect(batches.map((b) => [b.label, b.count, b.total])).toEqual([
      ['KWSP Sep 2026', 2, 4095],
      ['SOCSO Sep 2026', 1, 95.6],
    ])
  })

  it('newest batch first', () => {
    const batches = lockPayrollBatches([
      pv({ description: 'Payroll disbursement Jul 2026 — A', payment_date: '2026-08-04' }),
      pv({ description: 'Payroll disbursement Sep 2026 — A', payment_date: '2026-10-05' }),
      pv({ description: 'Payroll disbursement Aug 2026 — A', payment_date: '2026-09-05' }),
    ])
    expect(batches.map((b) => b.label)).toEqual([
      'Payroll disbursement Sep 2026', 'Payroll disbursement Aug 2026', 'Payroll disbursement Jul 2026',
    ])
  })

  it('nothing in, nothing out', () => {
    expect(lockPayrollBatches([])).toEqual([])
  })
})

// 2026-10-05 (user: "department pool 她还是要看到的 … 不给她看 detail / history 罢了").
describe('a department pool ledger, for an account without Payroll payouts', () => {
  const row = (id: string, description: string, amount: number, created_at: string, over: Partial<PoolRowLike> = {}): PoolRowLike => ({
    id, transaction_type: 'expense_out', amount, description, created_at, period_month: '2026-08-01', ...over,
  })
  const salary = (no: string): PayrollVoucherLike & { voucher_no: string } => ({
    voucher_no: no, reference_type: 'payroll_disbursement', description: 'Payroll disbursement Aug 2026 — Someone (HR)',
    voucher_type: 'other', status: 'paid', amount: 0, payment_date: '2026-09-09', created_at: '2026-09-05T03:00:00+00:00',
  })
  const vouchers = new Map<string, PayrollVoucherLike>([
    ['HV-PV-202609-0286', salary('HV-PV-202609-0286')],
    ['HV-PV-202609-0287', salary('HV-PV-202609-0287')],
    ['HV-PV-202609-0290', { ...salary('HV-PV-202609-0290'), description: 'Director salary Aug 2026 — A Director' }],
    ['HV-PV-202609-0300', { ...salary('HV-PV-202609-0300'), reference_type: null, description: 'Office rack' }],
    ['HV-PV-202607-0100', { ...salary('HV-PV-202607-0100'), reference_type: 'payroll_payment_request', voucher_type: 'payroll_bank_transfer', description: 'Payroll bank transfer — Jun 2026 (partial)' }],
  ])

  it('reads the voucher number a pool row starts with', () => {
    expect(poolRowVoucherNo('PV HV-PV-202609-0286: Payroll disbursement Aug 2026 — Aina (HR)')).toBe('HV-PV-202609-0286')
    expect(poolRowVoucherNo('PV HV-OR-202608-0221: settle HV-INV-202607-0032 (finance)')).toBe('HV-OR-202608-0221')
    expect(poolRowVoucherNo('VOID HV-PV-202607-0115: reverse expense_out')).toBeNull()
    expect(poolRowVoucherNo('Opening balance')).toBeNull()
    expect(poolRowVoucherNo(null)).toBeNull()
  })

  it('folds the rows of one batch on one day into one line, where the latest of them stood', () => {
    const out = foldPayrollPoolRows([
      row('r1', 'PV HV-PV-202609-0300: Office rack — Vivian', 165.14, '2026-09-10T02:00:00+00:00'),
      row('r2', 'PV HV-PV-202609-0287: Payroll disbursement Aug 2026 — Bala (HR)', 4100.25, '2026-09-09T05:00:00+00:00'),
      row('r3', 'PV HV-PV-202609-0290: Director salary Aug 2026 — A Director', 12000, '2026-09-09T04:30:00+00:00'),
      row('r4', 'PV HV-PV-202609-0286: Payroll disbursement Aug 2026 — Aina (HR)', 3200.5, '2026-09-09T04:00:00+00:00'),
      row('r5', 'VOID HV-PV-202607-0115: reverse expense_out', 2937.45, '2026-07-21T04:00:00+00:00', { transaction_type: 'void_in', period_month: null }),
    ], vouchers)
    expect(out.map((r) => [r.id, r.description, r.amount])).toEqual([
      ['r1', 'PV HV-PV-202609-0300: Office rack — Vivian', 165.14],
      ['locked-Payroll disbursement Aug 2026|2026-09-09|expense_out', 'Payroll disbursement Aug 2026 · 2 笔 · 只显示总数', 7300.75],
      ['locked-Director salary Aug 2026|2026-09-09|expense_out', 'Director salary Aug 2026 · 1 笔 · 只显示总数', 12000],
      ['r5', 'VOID HV-PV-202607-0115: reverse expense_out', 2937.45],
    ])
    const folded = out[1]
    expect('locked' in folded && folded.locked).toBe(true)
    expect(folded.created_at).toBe('2026-09-09T05:00:00+00:00')
    expect(folded.period_month).toBe('2026-08-01')
    for (const secret of ['Aina', 'Bala', 'A Director', 'HV-PV-202609-028']) {
      expect(JSON.stringify(out)).not.toContain(secret)
    }
  })

  it('keeps a day apart from the next, and money in apart from money out', () => {
    const out = foldPayrollPoolRows([
      row('a', 'PV HV-PV-202609-0286: Payroll disbursement Aug 2026 — Aina (HR)', 1, '2026-09-10T01:00:00+00:00'),
      row('b', 'PV HV-PV-202609-0287: Payroll disbursement Aug 2026 — Bala (HR)', 2, '2026-09-09T01:00:00+00:00'),
      row('c', 'PV HV-PV-202607-0100: payroll fund → HR custody', 3, '2026-09-09T00:30:00+00:00', { transaction_type: 'np_in' }),
    ], vouchers)
    expect(out.map((r) => [r.description, r.transaction_type, r.amount])).toEqual([
      ['Payroll disbursement Aug 2026 · 1 笔 · 只显示总数', 'expense_out', 1],
      ['Payroll disbursement Aug 2026 · 1 笔 · 只显示总数', 'expense_out', 2],
      ['Payroll bank transfer Jun 2026 · 1 笔 · 只显示总数', 'np_in', 3],
    ])
  })

  it('a salary line whose voucher is not at hand still folds — by what its own text says', () => {
    const out = foldPayrollPoolRows([
      row('x', 'PV HV-PV-202507-0001: Payroll disbursement Jun 2025 — Old Person (HR)', 900, '2025-07-05T01:00:00+00:00'),
      row('y', 'PV HV-PV-202507-0002: Staff Payroll - Jun 2025', 5000, '2025-07-05T00:00:00+00:00'),
    ], new Map())
    expect(out.map((r) => r.description)).toEqual([
      'Payroll disbursement Jun 2025 · 1 笔 · 只显示总数',
      'PV HV-PV-202507-0002: Staff Payroll - Jun 2025', // a total typed by Finance, no person in it
    ])
  })

  it('with nothing to fold, hands the rows back as they came', () => {
    const rows = [row('r1', 'PV HV-PV-202609-0300: Office rack — Vivian', 165.14, '2026-09-10T02:00:00+00:00')]
    expect(foldPayrollPoolRows(rows, vouchers)).toEqual(rows)
    expect(foldPayrollPoolRows([], vouchers)).toEqual([])
  })
})

describe('filterLockedBatches', () => {
  const batches = lockPayrollBatches([
    pv({ amount: 3000 }),
    pv({ amount: 2000, status: 'pending_approval', description: 'Payroll disbursement Sep 2026 — Bala', created_at: '2026-10-02T03:00:00+00:00' }),
    pv({ reference_type: 'payroll_statutory', voucher_type: 'expense', description: 'KWSP — Aug 2026 payroll (HR · 3 staff)', payment_date: '2026-09-15', created_at: '2026-09-10T03:00:00+00:00' }),
  ])
  const labels = (f: Partial<LedgerFilters>) => filterLockedBatches(batches, { ...NO_FILTER, ...f }).map((b) => b.label)

  it('with no filter, every batch', () => {
    expect(labels({})).toEqual(['Payroll disbursement Sep 2026', 'KWSP Aug 2026'])
  })

  it('a status tab keeps a batch that has a voucher in that status — and shows it whole', () => {
    expect(labels({ tab: 'pending_approval' })).toEqual(['Payroll disbursement Sep 2026'])
    expect(labels({ tab: 'voided' })).toEqual([])
    const [kept] = filterLockedBatches(batches, { ...NO_FILTER, tab: 'pending_approval' })
    expect([kept.count, kept.total]).toEqual([2, 5000]) // not the one pending voucher's 2,000
  })

  it('a pool or an amount filter hides them: answering it would read inside the batch', () => {
    expect(labels({ poolFilter: 'dept_pool_hr' })).toEqual([])
    expect(labels({ minFilter: 2500 })).toEqual([])
    expect(labels({ maxFilter: 2500 })).toEqual([])
  })

  it('a search matches the name of the batch, never a person inside it', () => {
    expect(labels({ qFilter: 'kwsp' })).toEqual(['KWSP Aug 2026'])
    expect(labels({ qFilter: 'sep 2026' })).toEqual(['Payroll disbursement Sep 2026'])
    expect(labels({ qFilter: 'bala' })).toEqual([])
    expect(labels({ qFilter: 'aina' })).toEqual([])
  })

  it('the voucher type and the date range are the batch’s own', () => {
    expect(labels({ typeFilter: 'expense' })).toEqual(['KWSP Aug 2026'])
    expect(labels({ typeFilter: 'loan_repayment' })).toEqual([])
    expect(labels({ fromFilter: '2026-10-01' })).toEqual(['Payroll disbursement Sep 2026'])
    expect(labels({ toFilter: '2026-09-30' })).toEqual(['KWSP Aug 2026'])
    expect(labels({ fromFilter: '2026-10-02', toFilter: '2026-10-02' })).toEqual(['Payroll disbursement Sep 2026'])
  })
})
