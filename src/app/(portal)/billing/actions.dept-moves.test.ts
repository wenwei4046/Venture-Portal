import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'
import { filteredRows as filtered, type Row } from '@/test/filtered-rows'

// Payroll cost moved to another department (2026-11-03, method B — the user: "我说的意思是example 从director office
// split 薪水去hr, 也要开一张bill"): the month's payroll Generate also drafts one internal invoice per receiving
// department, the sending departments' lines by cost item, and its issue is the own-share invoice's — the sender
// recovers in its segment, the receiver bears it in its own.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  approveInvoice,
  approveInvoicesForPeriod,
  fetchPayrollBillingDelta,
  generateConsolidatedPayrollInvoices,
  generateDeptMoveInvoices,
  generatePayrollAdjustmentInvoices,
} from './actions'

const DEPTS: Row[] = [
  { id: 'd-do', name: 'Director Office', segment_key: 'director_office', pool_gl_code: '1060', billing_mode_key: 'director_office_attribution', is_internal: false },
  { id: 'd-fin', name: 'Finance', segment_key: 'finance', pool_gl_code: '1040', billing_mode_key: 'finance_attribution', is_internal: false },
  { id: 'd-hr', name: 'HR', segment_key: 'hr', pool_gl_code: '1050', billing_mode_key: 'hr_attribution', is_internal: false },
  { id: 'd-it', name: 'IT', segment_key: 'it', pool_gl_code: '1100', billing_mode_key: 'it_attribution', is_internal: false },
  { id: 'd-mkt', name: 'Marketing', segment_key: 'marketing', pool_gl_code: '1030', billing_mode_key: 'marketing_project', is_internal: false },
  { id: 'd-vo', name: 'Venture Office', segment_key: null, pool_gl_code: null, billing_mode_key: null, is_internal: true },
]

// Production's chart (2026-11-03), with the migration's Inter-billing - IT.
const COA: Row[] = [
  { code: '3073', name: 'AR - Internal (dept)', type: 'asset', is_active: true },
  { code: '5050', name: 'Salary Income', type: 'revenue', is_active: true },
  { code: '9030', name: 'Salary Expense', type: 'expense', is_active: true },
  { code: '9051', name: 'Inter-billing - Marketing', type: 'expense', is_active: true },
  { code: '9052', name: 'Inter-billing - Finance', type: 'expense', is_active: true },
  { code: '9053', name: 'Inter-billing - HR', type: 'expense', is_active: true },
  { code: '9054', name: 'Inter-billing - Director Office', type: 'expense', is_active: true },
  { code: '9056', name: 'Inter-billing - Venture Office', type: 'expense', is_active: true },
  { code: '9057', name: 'Inter-billing - IT', type: 'expense', is_active: true },
]

const PERIOD = '2026-11-01'

// What HR keyed for November: Vivian (Director Office) 25% / 25% to 2990 and Carres, RM 3,000 to HR; Ken (IT) RM 500 to
// Marketing; a Marketing person RM 1,000 to Finance.
const COMPANY_ROWS: Row[] = [
  { department_id: 'd-do', department_name: 'Director Office', company_id: 'co-2990', company_name: '2990', company_short_code: '2990', staff_count: 1, amount: 1500, salary_amount: 1225, allowance_amount: 75, epf_amount: 169, socso_amount: 26.02, eis_amount: 4.98 },
  { department_id: 'd-do', department_name: 'Director Office', company_id: 'co-car', company_name: 'Carres', company_short_code: 'CAR', staff_count: 1, amount: 1500, salary_amount: 1225, allowance_amount: 75, epf_amount: 169, socso_amount: 26.03, eis_amount: 4.97 },
]
const MOVES: Row[] = [
  { from_department_id: 'd-mkt', from_department_name: 'Marketing', to_department_id: 'd-fin', to_department_name: 'Finance', staff_count: 1, amount: 1000, salary_amount: 875, allowance_amount: 0, epf_amount: 113.75, socso_amount: 8.75, eis_amount: 2.5 },
  { from_department_id: 'd-do', from_department_name: 'Director Office', to_department_id: 'd-hr', to_department_name: 'HR', staff_count: 1, amount: 3000, salary_amount: 2450, allowance_amount: 150, epf_amount: 338, socso_amount: 52.05, eis_amount: 9.95 },
  { from_department_id: 'd-it', from_department_name: 'IT', to_department_id: 'd-mkt', to_department_name: 'Marketing', staff_count: 1, amount: 500, salary_amount: 434.97, allowance_amount: 0, epf_amount: 56.55, socso_amount: 7.61, eis_amount: 0.87 },
]

const draft = (id: string, over: Row): Row => ({ id, period_month: PERIOD, billing_mode: 'payroll_consolidated', status: 'draft', reference_no: null, company_id: null, billable_to_department_id: null, ...over })
/** The drafts a first Generate, an own-share run and two top-ups left for November. */
const NOVEMBER_DRAFTS: Row[] = [
  draft('co-draft', { billable_to_type: 'subsidiary', company_id: 'co-2990', description: 'Payroll cost share — Nov\'26' }),
  draft('co-adjust', { billable_to_type: 'subsidiary', company_id: 'co-2990', description: 'Payroll cost share — Nov\'26 · adjustment' }),
  draft('own-share', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-vo', description: 'HV own-share payroll — Nov\'26' }),
  draft('dpm-draft', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-hr', reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26' }),
  draft('dpm-adjust', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-hr', reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26 · adjustment' }),
]

interface Book {
  moves?: Row[]
  invoices?: Row[]
  lines?: Row[]
}

function database(book: Book = {}) {
  let minted = 100
  let made = 0
  const tables: Record<string, Row[]> = {
    departments: DEPTS,
    chart_of_accounts: COA,
    invoices: book.invoices ?? NOVEMBER_DRAFTS,
    invoice_lines: book.lines ?? [],
    period_locks: [],
  }
  const db = recordingSupabase(
    (call) => {
      if (call.op === 'insert') {
        if (call.table === 'invoices') return { data: { id: `new-${++made}` } }
        return { data: null }
      }
      if (call.op === 'update') return { data: [{ id: 'updated' }], count: 1 }
      if (call.op === 'delete') return { data: null }
      const rows = filtered(tables[call.table] ?? [], call.chain)
      return { data: call.single ? (rows[0] ?? null) : rows }
    },
    (fn) => {
      if (fn === 'get_staff_billing_allocation') return { data: COMPANY_ROWS }
      if (fn === 'get_staff_dept_moves_allocation') return { data: book.moves ?? MOVES }
      if (fn === 'mint_invoice_no') return { data: `HV-INV-202611-0${++minted}` }
      if (fn === 'ar_account_for_invoice') return { data: '3073' }
      if (fn === 'post_journal_entry_as_caller') return { data: 'je-new' }
      return {}
    },
  )
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

type Db = ReturnType<typeof database>
const inserted = (db: Db, table: string) => db.writes(table).filter((w) => w.op === 'insert').flatMap((w) => [w.values].flat() as Row[])
const internalDrafts = (db: Db) => inserted(db, 'invoices').filter((v) => v.billable_to_type === 'dept_pool')
/** The invoices made, by their place in the inserts — the recording answers the n-th insert `new-n`. */
const madeId = (db: Db, values: Row) => `new-${inserted(db, 'invoices').indexOf(values) + 1}`
const linesOf = (db: Db, invoiceId: string) => inserted(db, 'invoice_lines').filter((l) => l.invoice_id === invoiceId)
const deletedInvoices = (db: Db) =>
  db.writes('invoices').filter((w) => w.op === 'delete').flatMap((w) => (w.chain.find(([m, c]) => m === 'in' && c === 'id')?.[2] ?? []) as string[])

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['billing'] })
})

describe('Generate drafts the internal invoices with the payroll invoices', () => {
  it('one internal draft per receiver: Director Office → HR 3,000 with five lines on segment director_office', async () => {
    const db = database()
    const res = await generateConsolidatedPayrollInvoices(PERIOD, '5050')

    const drafts = internalDrafts(db)
    expect(drafts.map((d) => d.billable_to_department_id)).toEqual(['d-fin', 'd-hr', 'd-mkt'])
    const hr = drafts.find((d) => d.billable_to_department_id === 'd-hr')!
    expect(hr).toMatchObject({
      period_month: PERIOD, invoice_date: '2026-11-30', billing_mode: 'payroll_consolidated', status: 'draft',
      billable_to_type: 'dept_pool', company_id: null, reference_no: 'DPM-202611', category_code: null,
      base_amount: 3000, total_amount: 3000,
    })
    expect(linesOf(db, madeId(db, hr)).map(({ line_no, description, amount, segment, category_code }) => ({ line_no, description, amount, segment, category_code }))).toEqual([
      { line_no: 1, description: 'Salary - Nov\'26', amount: 2450, segment: 'director_office', category_code: '5050' },
      { line_no: 2, description: 'Allowance - Nov\'26', amount: 150, segment: 'director_office', category_code: '5050' },
      { line_no: 3, description: 'EPF - Nov\'26', amount: 338, segment: 'director_office', category_code: '5050' },
      { line_no: 4, description: 'SOCSO - Nov\'26', amount: 52.05, segment: 'director_office', category_code: '5050' },
      { line_no: 5, description: 'EIS - Nov\'26', amount: 9.95, segment: 'director_office', category_code: '5050' },
    ])
    expect(res).toEqual({ generated: 5, companies: ['2990', 'CAR'], receivers: ['Finance', 'HR', 'Marketing'] })
  })

  it('each sender bills on its own segment — IT’s from the department registry, Marketing’s with no allowance line', async () => {
    const db = database()
    await generateDeptMoveInvoices(PERIOD, '5050')
    const drafts = internalDrafts(db)
    const toMarketing = linesOf(db, madeId(db, drafts.find((d) => d.billable_to_department_id === 'd-mkt')!))
    const toFinance = linesOf(db, madeId(db, drafts.find((d) => d.billable_to_department_id === 'd-fin')!))
    expect(toMarketing.map((l) => [l.description, l.amount, l.segment])).toEqual([
      ['Salary - Nov\'26', 434.97, 'it'], ['EPF - Nov\'26', 56.55, 'it'], ['SOCSO - Nov\'26', 7.61, 'it'], ['EIS - Nov\'26', 0.87, 'it'],
    ])
    expect(toFinance.map((l) => l.segment)).toEqual(['marketing', 'marketing', 'marketing', 'marketing'])
    expect(drafts.map((d) => d.total_amount)).toEqual([1000, 3000, 500])
  })

  it('a second Generate replaces only the drafts it made: the own-share and the adjustment drafts stay', async () => {
    const db = database()
    await generateConsolidatedPayrollInvoices(PERIOD, '5050')
    expect(deletedInvoices(db).sort()).toEqual(['co-draft', 'dpm-draft'])
  })

  // The reconciliation's way back for an over-billed receiver is "void the internal invoice and generate again": that
  // Generate must re-draft only what has no live invoice, or Approve all would bill the rest twice.
  it('a payer already billed this month gets no second draft: 2990’s and HR’s issued invoices stand alone', async () => {
    const live = (id: string, over: Row): Row => ({ ...draft(id, over), status: 'issued' })
    const db = database({
      invoices: [
        live('co-2990-issued', { billable_to_type: 'subsidiary', company_id: 'co-2990', description: 'Payroll cost share — Nov\'26' }),
        live('dpm-hr-paid', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-hr', reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26', status: 'paid_via_netting' }),
        live('dpm-fin-adjust', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-fin', reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26 · adjustment' }),
        { ...draft('dpm-mkt-voided', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-mkt', reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26' }), status: 'voided' },
      ],
    })
    const res = await generateConsolidatedPayrollInvoices(PERIOD, '5050')
    expect(inserted(db, 'invoices').filter((v) => v.billable_to_type === 'subsidiary').map((v) => v.company_id)).toEqual(['co-car'])
    // HR's is paid; Finance holds only a top-up (no original yet), Marketing's was voided: both drafted again.
    expect(internalDrafts(db).map((d) => d.billable_to_department_id)).toEqual(['d-fin', 'd-mkt'])
    expect(res).toMatchObject({ companies: ['CAR'], receivers: ['Finance', 'Marketing'] })
  })

  it('the companies’ Generate no longer deletes the own-share draft (nor a top-up)', async () => {
    const db = database({ moves: [] })
    await generateConsolidatedPayrollInvoices(PERIOD, '5050')
    expect(deletedInvoices(db)).not.toContain('own-share')
    expect(deletedInvoices(db)).not.toContain('co-adjust')
    expect(internalDrafts(db)).toEqual([])
  })
})

const INTERNAL = (payer: string): Row => ({
  id: 'inv-dpm', invoice_no: 'HV-INV-202611-0103', invoice_date: '2026-11-30', period_month: PERIOD, status: 'draft',
  total_amount: 3000, base_amount: 3000, billing_mode: 'payroll_consolidated', company_id: null, category_code: null,
  billable_to_type: 'dept_pool', billable_to_department_id: payer,
})
const DO_LINES: Row[] = [
  ['Salary', 2450], ['Allowance', 150], ['EPF', 338], ['SOCSO', 52.05], ['EIS', 9.95],
].map(([item, amount], i) => ({ invoice_id: 'inv-dpm', line_no: i + 1, description: `${item} - Nov'26`, amount, category_code: '5050', segment: 'director_office' }))

interface Je { p_segment?: string; p_lines: Array<{ account_code: string; debit: number | null; credit: number | null }> }
const journals = (db: Db) => db.rpcs.filter((r) => r.fn === 'post_journal_entry_as_caller').map((r) => r.args as Je)
const net = (jes: Je[], code: string) =>
  Math.round(jes.flatMap((j) => j.p_lines).filter((l) => l.account_code === code).reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0) * 100) / 100

describe('Issue: the sender recovers in its segment, the receiver bears it in its own', () => {
  it('Director Office → HR: Cr Salary Income on director_office, Dr Salary Expense on hr (by nature, as the own share); AR nets 0', async () => {
    const db = database({ invoices: [INTERNAL('d-hr')], lines: DO_LINES })
    await approveInvoice(form({ id: 'inv-dpm' }))

    const jes = journals(db)
    expect(jes.map((j) => j.p_segment)).toEqual(['director_office', 'hr'])
    expect(jes[0].p_lines.map((l) => [l.account_code, l.debit, l.credit])).toEqual([
      ['3073', 3000, null], ['5050', null, 2450], ['5050', null, 150], ['5050', null, 338], ['5050', null, 52.05], ['5050', null, 9.95],
    ])
    expect(jes[1].p_lines.map((l) => [l.account_code, l.debit, l.credit])).toEqual([['9030', 3000, null], ['3073', null, 3000]])
    expect(net(jes, '3073')).toBe(0)
  })

  it('a line with no category falls back to the receiver’s own Inter-billing account', async () => {
    const db = database({ invoices: [INTERNAL('d-hr')], lines: DO_LINES.map((l) => ({ ...l, category_code: null })) })
    await approveInvoice(form({ id: 'inv-dpm' }))
    expect(journals(db)[1].p_lines.map((l) => [l.account_code, l.debit, l.credit])).toEqual([['9053', 3000, null], ['3073', null, 3000]])
  })

  it('IT as the receiver: it needs the new Inter-billing - IT account, and bears it in segment it', async () => {
    const db = database({ invoices: [INTERNAL('d-it')], lines: DO_LINES })
    await approveInvoice(form({ id: 'inv-dpm' }))
    expect(db.calls.some((c) => c.table === 'chart_of_accounts' && c.chain.some(([m, , p]) => m === 'ilike' && p === 'Inter-billing % IT'))).toBe(true)
    expect(journals(db).map((j) => j.p_segment)).toEqual(['director_office', 'it'])
  })

  it('the month’s bulk issue does the same for IT', async () => {
    const db = database({ invoices: [INTERNAL('d-it')], lines: DO_LINES })
    await approveInvoicesForPeriod(form({ period_month: PERIOD }))
    expect(journals(db).map((j) => j.p_segment)).toEqual(['director_office', 'it'])
    expect(net(journals(db), '3073')).toBe(0)
  })

  it('the own-share invoice still bears in corporate (Venture Office has no segment of its own)', async () => {
    const db = database({ invoices: [INTERNAL('d-vo')], lines: DO_LINES })
    await approveInvoice(form({ id: 'inv-dpm' }))
    expect(journals(db).map((j) => j.p_segment)).toEqual(['director_office', 'corporate'])
  })
})

// The reconciliation (对数补差) covers the internal invoices too: what a receiver should be billed is the moves now, by
// sender segment and item; what it was billed is its issued internal invoices. Under-billed → one adjustment draft per
// receiver; over-billed → listed, never undone here.
describe('The reconciliation covers internal invoices', () => {
  const issued = (id: string, over: Row): Row => ({ ...draft(id, over), status: 'issued' })
  const itemLines = (invoiceId: string, segment: string, items: Array<[string, number]>): Row[] =>
    items.map(([item, amount], i) => ({ invoice_id: invoiceId, line_no: i + 1, description: `${item} - Nov'26`, amount, category_code: '5050', segment }))
  const MOVE_DO_HR = (salary: number, allowance: number, epf: number, socso: number, eis: number): Row => ({
    from_department_id: 'd-do', from_department_name: 'Director Office', to_department_id: 'd-hr', to_department_name: 'HR',
    staff_count: 1, amount: salary + allowance + epf + socso + eis, salary_amount: salary, allowance_amount: allowance, epf_amount: epf, socso_amount: socso, eis_amount: eis,
  })
  const HR_ISSUED = issued('dpm-hr', { billable_to_type: 'dept_pool', billable_to_department_id: 'd-hr', reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26' })

  it('Vivian’s line raised by a 40% pay rise: HR under-billed 200 → one adjustment draft to HR', async () => {
    // Her line was 500 on the issued invoice; the rise makes it 700.
    const db = database({
      moves: [MOVE_DO_HR(560, 35, 84, 17.5, 3.5)],
      invoices: [HR_ISSUED],
      lines: itemLines('dpm-hr', 'director_office', [['Salary', 400], ['Allowance', 25], ['EPF', 60], ['SOCSO', 12.5], ['EIS', 2.5]]),
    })
    const { departments } = await fetchPayrollBillingDelta(PERIOD)
    expect(departments).toHaveLength(1)
    expect(departments[0]).toMatchObject({ companyId: 'd-hr', name: 'HR', billed: 500, should: 700, delta: 200, positiveTotal: 200, hasIssuedInvoice: true, negatives: [] })

    const res = await generatePayrollAdjustmentInvoices(PERIOD)
    const drafts = internalDrafts(db)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      billable_to_type: 'dept_pool', billable_to_department_id: 'd-hr', company_id: null, status: 'draft',
      reference_no: 'DPM-202611', description: 'Payroll cost moved in — Nov\'26 · adjustment', total_amount: 200,
    })
    expect(linesOf(db, madeId(db, drafts[0])).map((l) => [l.description, l.amount, l.segment, l.category_code])).toEqual([
      ['Director Office Salary adjustment - Nov\'26', 160, 'director_office', '5050'],
      ['Director Office Allowance adjustment - Nov\'26', 10, 'director_office', '5050'],
      ['Director Office EPF adjustment - Nov\'26', 24, 'director_office', '5050'],
      ['Director Office SOCSO adjustment - Nov\'26', 5, 'director_office', '5050'],
      ['Director Office EIS adjustment - Nov\'26', 1, 'director_office', '5050'],
    ])
    expect(res.generated).toEqual(['HV-INV-202611-0101 (HR +200.00)'])
    // The companies were never invoiced this month: no company draft.
    expect(inserted(db, 'invoices').filter((v) => v.billable_to_type === 'subsidiary')).toEqual([])
  })

  it('3,000 lowered to 2,000 after issue: HR over-billed 1,000, listed, no draft', async () => {
    const db = database({
      moves: [MOVE_DO_HR(1633.33, 100, 225.33, 34.7, 6.64)],
      invoices: [HR_ISSUED],
      lines: itemLines('dpm-hr', 'director_office', [['Salary', 2450], ['Allowance', 150], ['EPF', 338], ['SOCSO', 52.05], ['EIS', 9.95]]),
    })
    const { departments } = await fetchPayrollBillingDelta(PERIOD)
    expect(departments[0]).toMatchObject({ name: 'HR', billed: 3000, should: 2000, delta: -1000, positiveTotal: 0 })
    expect(departments[0].negatives.map((n) => [n.segment, n.delta])).toEqual([['director_office', -1000]])

    await expect(generatePayrollAdjustmentInvoices(PERIOD)).rejects.toThrow(/nothing under-billed/)
    expect(inserted(db, 'invoices')).toEqual([])
  })

  it('companies’ deltas unchanged by internal invoices', async () => {
    const coInvoices = [
      issued('co-2990-inv', { billable_to_type: 'subsidiary', company_id: 'co-2990', description: 'Payroll cost share — Nov\'26' }),
      issued('co-car-inv', { billable_to_type: 'subsidiary', company_id: 'co-car', description: 'Payroll cost share — Nov\'26' }),
    ]
    const coLines = [
      ...itemLines('co-2990-inv', 'director_office', [['Salary', 1225], ['Allowance', 75], ['EPF', 169], ['SOCSO', 26.02], ['EIS', 4.98]]),
      ...itemLines('co-car-inv', 'director_office', [['Salary', 1225], ['Allowance', 75], ['EPF', 169], ['SOCSO', 26.03], ['EIS', 4.97]]),
    ]
    database({ moves: [], invoices: coInvoices, lines: coLines })
    const alone = await fetchPayrollBillingDelta(PERIOD)

    database({
      invoices: [...coInvoices, HR_ISSUED],
      lines: [...coLines, ...itemLines('dpm-hr', 'director_office', [['Salary', 2000]])],
    })
    const withInternal = await fetchPayrollBillingDelta(PERIOD)
    expect(withInternal.companies).toEqual(alone.companies)
    expect(withInternal.companies.every((c) => c.delta === 0)).toBe(true)
    expect(withInternal.departments.map((d) => d.name).sort()).toEqual(['Finance', 'HR', 'Marketing'])
  })
})
