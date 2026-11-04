import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'
import { filteredRows as filtered, type Row } from '@/test/filtered-rows'

// Payroll cost moved to another department (2026-11-03, method B — the user: "我说的意思是example 从director office
// split 薪水去hr, 也要开一张bill"): HR saves a person's department lines with their company split, a receiving cost
// center's Bill to % for the month, and Copy from last month brings both along.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { copyAllocationsFromLastMonth, saveDeptBillTo, saveStaffAllocation } from './actions'

const PERIOD = '2026-11-01'
const PREV = '2026-10-01'

const dept = (name: string, cost_model: 'cost_center' | 'centralized') => ({ name, payroll_source: 'imported', cost_model })
const payroll = (staff_id: string, employee_name: string, d: ReturnType<typeof dept>, over: Row = {}): Row => ({
  staff_id, period_month: PERIOD, status: 'draft', source: 'imported', completed_at: null, topup_opened_at: null, topup_kind: null,
  gross: 5214.4, epf_er: 677.87, socso_er: 89.25, eis_er: 18.48, // RM 6,000.00
  hr_staff_costs: { employee_name, department_id: over.department_id ?? 'd-do', departments: d }, ...over,
})

const DEPARTMENTS: Row[] = [
  { id: 'd-do', name: 'Director Office', cost_model: 'cost_center' },
  { id: 'd-hr', name: 'HR', cost_model: 'cost_center' },
  { id: 'd-fin', name: 'Finance', cost_model: 'cost_center' },
  { id: 'd-mkt', name: 'Marketing', cost_model: 'centralized' },
]

interface Book {
  payroll?: Row[]
  allocation?: Row[]
  moves?: Row[]
  poolAllocation?: Row[]
  refuse?: Record<string, string>
}

function database(book: Book = {}) {
  const tables: Record<string, Row[]> = {
    hr_monthly_payroll: book.payroll ?? [payroll('vivian', 'VIVIAN', dept('Director Office', 'cost_center'))],
    hr_staff_allocation: book.allocation ?? [],
    hr_staff_dept_moves: book.moves ?? [],
    hr_pool_allocation: book.poolAllocation ?? [],
    departments: DEPARTMENTS,
    period_locks: [],
  }
  const db = recordingSupabase(
    (call) => {
      if (call.op !== 'select') {
        const refusal = book.refuse?.[`${call.table}.${call.op}`]
        return refusal ? { error: { message: refusal } } : { data: null }
      }
      const rows = filtered(tables[call.table] ?? [], call.chain)
      return { data: call.single ? (rows[0] ?? null) : rows }
    },
    (fn) => (fn === 'payroll_month_closed' ? { data: false } : {}),
  )
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

type Db = ReturnType<typeof database>
const inserted = (db: Db, table: string) => db.writes(table).filter((w) => w.op === 'insert').flatMap((w) => [w.values].flat() as Row[])
const deletes = (db: Db, table: string) => db.writes(table).filter((w) => w.op === 'delete').map((w) => w.chain)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'hr-user' })
})

describe('saveStaffAllocation with department lines', () => {
  it('saves companies and moves together', async () => {
    const db = database()
    const res = await saveStaffAllocation('vivian', PERIOD, [{ companyId: 'co-2990', pct: 25 }, { companyId: 'co-car', pct: 25 }], [
      { departmentId: 'd-hr', kind: 'amount', value: 3000 },
    ])
    expect(res).toEqual({ ok: true })
    expect(inserted(db, 'hr_staff_allocation').map((r) => [r.company_id, r.allocation_pct])).toEqual([['co-2990', 0.25], ['co-car', 0.25]])
    expect(deletes(db, 'hr_staff_dept_moves')).toEqual([[['eq', 'staff_id', 'vivian'], ['eq', 'period_month', PERIOD]]])
    expect(inserted(db, 'hr_staff_dept_moves')).toEqual([
      { staff_id: 'vivian', period_month: PERIOD, department_id: 'd-hr', amount: 3000, pct: null, created_by: 'hr-user' },
    ])
  })

  it('a % line is kept as a fraction', async () => {
    const db = database()
    await saveStaffAllocation('vivian', PERIOD, [], [{ departmentId: 'd-hr', kind: 'pct', value: 40 }])
    expect(inserted(db, 'hr_staff_dept_moves')).toMatchObject([{ department_id: 'd-hr', amount: null, pct: 0.4 }])
  })

  it('a centralized person saves moves only', async () => {
    const db = database({ payroll: [payroll('ken', 'KEN', dept('Marketing', 'centralized'), { department_id: 'd-mkt' })] })
    expect(await saveStaffAllocation('ken', PERIOD, [], [{ departmentId: 'd-fin', kind: 'amount', value: 1000 }])).toEqual({ ok: true })
    expect(db.writes('hr_staff_allocation')).toEqual([])
    expect(inserted(db, 'hr_staff_dept_moves')).toMatchObject([{ staff_id: 'ken', department_id: 'd-fin', amount: 1000 }])

    const refused = await saveStaffAllocation('ken', PERIOD, [{ companyId: 'co-2990', pct: 10 }], [])
    expect(refused).toMatchObject({ ok: false })
  })

  it('the rules are said in words: own department, more than the cost', async () => {
    database()
    expect(await saveStaffAllocation('vivian', PERIOD, [], [{ departmentId: 'd-do', kind: 'amount', value: 100 }])).toEqual({
      ok: false, reason: 'Cost cannot move to the person’s own department',
    })
    expect(await saveStaffAllocation('vivian', PERIOD, [{ companyId: 'co-2990', pct: 60 }], [{ departmentId: 'd-hr', kind: 'pct', value: 50 }])).toMatchObject({ ok: false })
  })

  it('a refusal comes back as words', async () => {
    const refusal = 'HR is centralized — what moves into it is its own cost, billed by its own invoices'
    const db = database({ refuse: { 'hr_staff_dept_moves.insert': refusal } })
    expect(await saveStaffAllocation('vivian', PERIOD, [], [{ departmentId: 'd-hr', kind: 'amount', value: 3000 }])).toEqual({ ok: false, reason: refusal })
    expect(db.writes('hr_staff_allocation').filter((w) => w.op === 'insert')).toEqual([])
  })
})

describe('saveDeptBillTo', () => {
  it('saveDeptBillTo replaces a month', async () => {
    const db = database()
    const res = await saveDeptBillTo('d-hr', PERIOD, [{ companyId: 'co-2990', pct: 30 }, { companyId: 'co-car', pct: 30 }])
    expect(res).toEqual({ ok: true })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/hr-costing/allocation', 'hr_costing', 'edit')
    expect(deletes(db, 'hr_pool_allocation')).toEqual([[['eq', 'department_id', 'd-hr'], ['eq', 'period_month', PERIOD]]])
    expect(inserted(db, 'hr_pool_allocation')).toEqual([
      { department_id: 'd-hr', company_id: 'co-2990', period_month: PERIOD, split_pct: 0.3, created_by: 'hr-user' },
      { department_id: 'd-hr', company_id: 'co-car', period_month: PERIOD, split_pct: 0.3, created_by: 'hr-user' },
    ])
  })

  // 2026-11-04 — HOUZS Venture's share of what moved in is a row with no company.
  it('saveDeptBillTo keeps HOUZS Venture’s share as a row with no company', async () => {
    const db = database()
    expect(await saveDeptBillTo('d-hr', PERIOD, [{ companyId: 'co-2990', pct: 30 }, { companyId: 'hv', pct: 10 }])).toEqual({ ok: true })
    expect(inserted(db, 'hr_pool_allocation')).toEqual([
      { department_id: 'd-hr', company_id: 'co-2990', period_month: PERIOD, split_pct: 0.3, created_by: 'hr-user' },
      { department_id: 'd-hr', company_id: null, period_month: PERIOD, split_pct: 0.1, created_by: 'hr-user' },
    ])
  })

  it('saveDeptBillTo refuses a centralized department', async () => {
    const db = database()
    expect(await saveDeptBillTo('d-mkt', PERIOD, [{ companyId: 'co-2990', pct: 30 }])).toEqual({
      ok: false, reason: 'Marketing is centralized — what moves into it is its own cost, billed by its own invoices',
    })
    expect(db.writes('hr_pool_allocation')).toEqual([])
  })

  it('a total over 100% is said in words', async () => {
    database()
    expect(await saveDeptBillTo('d-hr', PERIOD, [{ companyId: 'co-2990', pct: 60 }, { companyId: 'co-car', pct: 50 }])).toMatchObject({ ok: false })
  })
})

describe('copyAllocationsFromLastMonth', () => {
  it('copy brings last month’s moves and Bill to % only where none exist', async () => {
    const db = database({
      payroll: [
        payroll('vivian', 'VIVIAN', dept('Director Office', 'cost_center')),
        payroll('ken', 'KEN', dept('Marketing', 'centralized'), { department_id: 'd-mkt' }),
        payroll('amy', 'AMY', dept('Finance', 'cost_center'), { department_id: 'd-fin' }),
        payroll('locked', 'LOCKED', dept('Finance', 'cost_center'), { department_id: 'd-fin', status: 'completed' }),
      ],
      moves: [
        { staff_id: 'vivian', period_month: PREV, department_id: 'd-hr', amount: 3000, pct: null },
        { staff_id: 'ken', period_month: PREV, department_id: 'd-fin', amount: null, pct: 0.1 },
        { staff_id: 'amy', period_month: PREV, department_id: 'd-hr', amount: 500, pct: null },
        { staff_id: 'amy', period_month: PERIOD, department_id: 'd-do', amount: 200, pct: null }, // set this month already
        { staff_id: 'locked', period_month: PREV, department_id: 'd-hr', amount: 100, pct: null },
      ],
      poolAllocation: [
        { department_id: 'd-hr', company_id: 'co-2990', period_month: PREV, split_pct: 0.3 },
        { department_id: 'd-hr', company_id: 'co-car', period_month: PREV, split_pct: 0.3 },
        { department_id: 'd-fin', company_id: 'co-2990', period_month: PREV, split_pct: 0.5 },
        { department_id: 'd-fin', company_id: 'co-car', period_month: PERIOD, split_pct: 0.2 }, // set this month already
      ],
    })
    const res = await copyAllocationsFromLastMonth(PERIOD)
    expect(inserted(db, 'hr_staff_dept_moves').map((r) => [r.staff_id, r.department_id, r.amount, r.pct, r.period_month])).toEqual([
      ['vivian', 'd-hr', 3000, null, PERIOD],
      ['ken', 'd-fin', null, 0.1, PERIOD], // a centralized person's department lines copy; their company split does not
    ])
    expect(inserted(db, 'hr_pool_allocation').map((r) => [r.department_id, r.company_id, r.split_pct, r.period_month])).toEqual([
      ['d-hr', 'co-2990', 0.3, PERIOD],
      ['d-hr', 'co-car', 0.3, PERIOD],
    ])
    expect(res).toMatchObject({ copiedMoves: 2, copiedBillTo: 1 })
  })
})
