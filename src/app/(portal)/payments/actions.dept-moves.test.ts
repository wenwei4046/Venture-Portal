import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'
import { filteredRows, type Row } from '@/test/filtered-rows'

// Payroll cost moved to another department (2026-11-03, method B): the internal invoice is settled by netting, as the
// own-share invoice is — each sending department's pool takes its slice in (np_in), the receiving department's pool pays
// it out (inter_billing_out), and no money leaves a bank. Any department sends and any receives, so a sender beyond the
// five cores (IT) is found in the department registry, not folded into Venture.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requireApproverOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { settleInvoiceFromSheet } from './actions'

const DEPTS: Row[] = [
  { id: 'd-do', name: 'Director Office', segment_key: 'director_office', pool_gl_code: '1060', billing_mode_key: 'director_office_attribution', is_internal: false },
  { id: 'd-fin', name: 'Finance', segment_key: 'finance', pool_gl_code: '1040', billing_mode_key: 'finance_attribution', is_internal: false },
  { id: 'd-hr', name: 'HR', segment_key: 'hr', pool_gl_code: '1050', billing_mode_key: 'hr_attribution', is_internal: false },
  { id: 'd-it', name: 'IT', segment_key: 'it', pool_gl_code: '1100', billing_mode_key: 'it_attribution', is_internal: false },
  { id: 'd-mkt', name: 'Marketing', segment_key: 'marketing', pool_gl_code: '1030', billing_mode_key: 'marketing_project', is_internal: false },
  { id: 'd-vo', name: 'Venture Office', segment_key: null, pool_gl_code: null, billing_mode_key: null, is_internal: true },
]
const COA: Row[] = [
  { code: '3073', name: 'AR - Internal (dept)', type: 'asset', is_active: true },
  { code: '5050', name: 'Salary Income', type: 'revenue', is_active: true },
  { code: '9030', name: 'Salary Expense', type: 'expense', is_active: true },
  { code: '9051', name: 'Inter-billing - Marketing', type: 'expense', is_active: true },
  { code: '9052', name: 'Inter-billing - Finance', type: 'expense', is_active: true },
  { code: '9053', name: 'Inter-billing - HR', type: 'expense', is_active: true },
  { code: '9056', name: 'Inter-billing - Venture Office', type: 'expense', is_active: true },
  { code: '9057', name: 'Inter-billing - IT', type: 'expense', is_active: true },
]

/** An issued internal invoice: `sender`'s five items, billed to `payer`. */
function internalInvoice(sender: string, payer: string, items: Array<[string, number]>) {
  const total = Math.round(items.reduce((s, [, a]) => s + a, 0) * 100) / 100
  return {
    invoice: { id: 'inv-dpm', invoice_no: 'HV-INV-202611-0103', status: 'issued', billing_mode: 'payroll_consolidated', total_amount: total, category_code: null, billable_to_type: 'dept_pool', billable_to_department_id: payer } as Row,
    lines: items.map(([item, amount], i) => ({ invoice_id: 'inv-dpm', line_no: i + 1, description: `${item} - Nov'26`, amount, category_code: '5050', segment: sender })) as Row[],
    total,
  }
}

function database(book: ReturnType<typeof internalInvoice>) {
  const tables: Record<string, Row[]> = {
    departments: DEPTS, chart_of_accounts: COA, invoices: [book.invoice], invoice_lines: book.lines,
  }
  const db = recordingSupabase(
    (call) => {
      if (call.table === 'payment_vouchers') {
        if (call.op === 'insert') return { data: { id: 'or-new' } }
        if (call.op === 'update') return { data: [{ id: 'or-new' }] }
        return { data: [], count: 521 }
      }
      if (call.op !== 'select') return { data: null }
      const rows = filteredRows(tables[call.table] ?? [], call.chain)
      return { data: call.single ? (rows[0] ?? null) : rows }
    },
    (fn) => {
      if (fn === 'ar_account_for_invoice') return { data: '3073' }
      if (fn === 'post_journal_entry_as_caller') return { data: 'je-new' }
      return {}
    },
  )
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

const settle = (amount: number) => {
  const form = new FormData()
  const fields: Record<string, string> = {
    direction: 'credit', voucher_type: 'billing_payment', invoice_id: 'inv-dpm', reference_type: '', reference_id: '',
    payee_name: 'HR', payee_company_id: '', bank_account_id: '', amount: amount.toFixed(2), payment_date: '2026-11-30',
    payment_method: 'netting', description: 'Settle HV-INV-202611-0103', target_pool: '', attachment_count: '0',
  }
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return form
}

type Db = ReturnType<typeof database>
const inserted = (db: Db, table: string) => db.writes(table).filter((w) => w.op === 'insert').flatMap((w) => [w.values].flat() as Row[])
const poolRows = (db: Db) => inserted(db, 'dept_pools').map((r) => [r.department_id, r.transaction_type, r.amount])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['treasury'] })
})

describe('an internal invoice settles by netting', () => {
  it('Director Office → HR: Director Office np_in +3,000, HR inter_billing_out 3,000, no bank, no JE, no Venture-Office overlay', async () => {
    const book = internalInvoice('director_office', 'd-hr', [['Salary', 2450], ['Allowance', 150], ['EPF', 338], ['SOCSO', 52.05], ['EIS', 9.95]])
    const db = database(book)

    const res = await settleInvoiceFromSheet(settle(book.total))

    expect(res).toMatchObject({ ok: true })
    expect(poolRows(db)).toEqual([['d-do', 'np_in', 3000], ['d-hr', 'inter_billing_out', 3000]])
    expect(inserted(db, 'venture_pool')).toEqual([])
    expect(db.rpcs.map((r) => r.fn)).not.toContain('post_journal_entry_as_caller')
    expect(db.rpcs.map((r) => r.fn)).not.toContain('bump_bank_for_paid_credit')
    expect(inserted(db, 'payment_voucher_sources').map((r) => [r.pool, r.amount, r.account_code, r.role])).toEqual([
      ['dept_pool_director_office', 3000, '3073', undefined],
      ['dept_pool_hr', 3000, '9030', 'mirror'],
    ])
    expect(db.writes('invoices').map((w) => w.values)).toEqual([{ status: 'paid_via_netting' }])
  })

  it('a Marketing → Finance move settles into Marketing’s pool', async () => {
    const book = internalInvoice('marketing', 'd-fin', [['Salary', 875], ['EPF', 113.75], ['SOCSO', 8.75], ['EIS', 2.5]])
    const db = database(book)
    await settleInvoiceFromSheet(settle(book.total))
    expect(poolRows(db)).toEqual([['d-mkt', 'np_in', 1000], ['d-fin', 'inter_billing_out', 1000]])
  })

  it('an IT → Marketing move settles into IT’s pool — the registry’s, not folded into Venture', async () => {
    const book = internalInvoice('it', 'd-mkt', [['Salary', 434.97], ['EPF', 56.55], ['SOCSO', 7.61], ['EIS', 0.87]])
    const db = database(book)
    await settleInvoiceFromSheet(settle(book.total))
    expect(poolRows(db)).toEqual([['d-it', 'np_in', 500], ['d-mkt', 'inter_billing_out', 500]])
    expect(inserted(db, 'venture_pool')).toEqual([])
    expect(inserted(db, 'payment_voucher_sources')[0]).toMatchObject({ pool: 'dept_pool_it', amount: 500 })
  })

  it('IT as the receiver pays from IT’s pool', async () => {
    const book = internalInvoice('finance', 'd-it', [['Salary', 1000]])
    const db = database(book)
    await settleInvoiceFromSheet(settle(book.total))
    expect(poolRows(db)).toEqual([['d-fin', 'np_in', 1000], ['d-it', 'inter_billing_out', 1000]])
    expect(inserted(db, 'payment_voucher_sources')[1]).toMatchObject({ pool: 'dept_pool_it', role: 'mirror' })
  })
})
