import { describe, expect, it } from 'vitest'
import {
  filterLockedBatches,
  foldPayrollPoolRows,
  isPayrollReference,
  lockPayrollBatches,
  payrollBatchLabel,
  payrollDepartmentOf,
  payrollFoldOf,
  poolRowVoucherNo,
  type LedgerFilters,
  type PayrollVoucherLike,
  type PoolRowLike,
} from './payroll-vouchers'

/** The departments table's names (production, 2026-10-13). */
const DEPTS = new Set(['Director', 'Director Office', 'Finance', 'HR', 'IT', 'Marketing', 'Revenue Department', 'Venture Office'])

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

describe('payrollDepartmentOf', () => {
  const dept = (over: Partial<PayrollVoucherLike>) => payrollDepartmentOf(pv(over), DEPTS)

  it('one person’s salary voucher: the department it names last — never the person', () => {
    expect(dept({ description: 'Payroll net Sep 2026 — Aina binti Example (Marketing)' })).toBe('Marketing')
    expect(dept({ description: 'Payroll disbursement Aug 2026 — Bala (Director Office)' })).toBe('Director Office')
    expect(dept({ description: 'Payroll commission Sep 2026 — Chong (Revenue Department)' })).toBe('Revenue Department')
    // A bracket of the person's own is not a department.
    expect(dept({ description: 'Payroll net Sep 2026 — Tan Ah Kow (Kelvin) (IT)' })).toBe('IT')
    expect(dept({ description: 'Payroll net Sep 2026 — Tan Ah Kow (Kelvin)' })).toBe('Other')
  })

  it('a department’s own voucher (Generate by Department)', () => {
    expect(dept({ description: 'Payroll disbursement Sep 2026 — Marketing · net · 12 staff' })).toBe('Marketing')
    expect(dept({ description: 'Payroll disbursement Sep 2026 — IT · commission · 1 staff' })).toBe('IT')
  })

  it('directors are one group, however their vouchers were made', () => {
    expect(dept({ description: 'Director salary Sep 2026 — A Director' })).toBe('Directors')
    expect(dept({ description: 'Director salaries Sep 2026 — Directors · net · 4 directors' })).toBe('Directors')
  })

  it('a statutory voucher: its department, in each shape it has been written', () => {
    const statutory = (description: string) => dept({ reference_type: 'payroll_statutory', description })
    expect(statutory('KWSP — Aug 2026 payroll (HR · 3 people)')).toBe('HR')
    expect(statutory('EIS — Aug 2026 payroll (Directors · 4 people)')).toBe('Directors')
    expect(statutory('KWSP (EPF) — Jun 2026 payroll — Director Office')).toBe('Director Office')
    expect(statutory('SOCSO — Jun 2026 payroll (staff)')).toBe('All staff')
    expect(statutory('LHDN (PCB) — Jun 2026 payroll (directors)')).toBe('Directors')
    expect(statutory('SKBBK — Jul 2026 payroll (staff + directors)')).toBe('All staff + directors')
  })

  it('a funding transfer: the whole month, or the directors’', () => {
    const transfer = (description: string) => dept({ reference_type: 'payroll_payment_request', description })
    expect(transfer('Payroll bank transfer — Aug 2026')).toBe('All departments')
    expect(transfer('Payroll bank transfer — Jun 2026 (partial)')).toBe('All departments')
    expect(transfer('Payroll bank transfer — Sep 2026 (IT)')).toBe('IT')
    expect(transfer('Director salary bank transfer — Aug 2026')).toBe('Directors')
  })

  it('text in no known shape is "Other" — never the text, which may be the only place a name is', () => {
    expect(dept({ description: 'Salary for Aina binti Example' })).toBe('Other')
    expect(dept({ description: null })).toBe('Other')
    expect(dept({ description: 'Payroll net Sep 2026 — Aina binti Example' })).toBe('Other')
    expect(dept({ reference_type: 'payroll_statutory', description: 'EPF top-up — Bala' })).toBe('Other')
    expect(dept({ reference_type: 'loan', description: 'Payroll net Sep 2026 — Aina (HR)' })).toBe('Other')
  })
})

describe('payrollFoldOf', () => {
  it('a salary voucher: its batch and department, for a ledger to fold its lines into', () => {
    expect(payrollFoldOf(pv({ description: 'Payroll net Sep 2026 — Aina (Marketing)' }), DEPTS)).toEqual({ label: 'Payroll net Sep 2026', department: 'Marketing' })
    expect(payrollFoldOf(pv({ description: 'Director salary Sep 2026 — A Director' }), DEPTS)).toEqual({ label: 'Director salary Sep 2026', department: 'Directors' })
  })

  it('a statutory or funding voucher is already a department’s — it stands as it is', () => {
    expect(payrollFoldOf(pv({ reference_type: 'payroll_statutory', description: 'KWSP — Aug 2026 payroll (HR · 3 people)' }), DEPTS)).toBeNull()
    expect(payrollFoldOf(pv({ reference_type: 'payroll_payment_request', description: 'Payroll bank transfer — Aug 2026' }), DEPTS)).toBeNull()
    expect(payrollFoldOf(pv({ reference_type: null, description: 'Office rack' }), DEPTS)).toBeNull()
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

  it('departments of one body and month fold into one batch, with a line for each department inside it', () => {
    const kwsp = { reference_type: 'payroll_statutory', voucher_type: 'expense', payment_date: '2026-09-15' }
    const batches = lockPayrollBatches([
      pv({ ...kwsp, description: 'KWSP — Sep 2026 payroll (IT · 1 staff)', amount: 1014 }),
      pv({ ...kwsp, description: 'KWSP — Sep 2026 payroll (HR · 3 staff)', amount: 3081 }),
      pv({ ...kwsp, description: 'SOCSO — Sep 2026 payroll (IT · 1 staff)', amount: 95.6 }),
    ], DEPTS)
    expect(batches.map((b) => [b.label, b.count, b.total])).toEqual([
      ['KWSP Sep 2026', 2, 4095],
      ['SOCSO Sep 2026', 1, 95.6],
    ])
    expect(batches[0].departments.map((d) => [d.department, d.count, d.total])).toEqual([
      ['HR', 1, 3081],
      ['IT', 1, 1014],
    ])
  })

  // 2026-10-13 — the user: "就算能看到 pv，应该也是看到 by 整个部门才对".
  it('inside a salary batch, one line per department — the largest first, and nobody’s name', () => {
    const [batch] = lockPayrollBatches([
      pv({ description: 'Payroll net Sep 2026 — Aina binti Example (Marketing)', amount: 3000 }),
      pv({ description: 'Payroll net Sep 2026 — Bala (Marketing)', amount: '2500.50', status: 'pending_approval', payment_date: null }),
      pv({ description: 'Payroll net Sep 2026 — Chong (IT)', amount: 4000 }),
      pv({ description: 'Payroll net Sep 2026 — Devi (IT)', amount: 900, status: 'voided' }),
    ], DEPTS)
    expect(batch).toMatchObject({ label: 'Payroll net Sep 2026', count: 4, total: 9500.5, referenceType: 'payroll_disbursement' })
    expect(batch.departments.map((d) => [d.department, d.count, d.total, d.statusText])).toEqual([
      ['Marketing', 2, 5500.5, '1 paid · 1 pending approval'],
      ['IT', 2, 4000, '1 paid · 1 voided'],
    ])
    expect(batch.departments[0].statusCounts).toEqual({ paid: 1, pending_approval: 1 })
    expect(JSON.stringify(batch)).not.toMatch(/Aina|Bala|Chong|Devi/)
  })

  it('directors are one line of their own', () => {
    const [batch] = lockPayrollBatches([
      pv({ description: 'Director salary Sep 2026 — A Director', amount: 10000 }),
      pv({ description: 'Director salary Sep 2026 — B Director', amount: 12000 }),
    ], DEPTS)
    expect(batch.departments.map((d) => [d.department, d.count, d.total])).toEqual([['Directors', 2, 22000]])
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
