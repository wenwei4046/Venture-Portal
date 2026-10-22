import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-22 (the user, shown it drawn: 可以，照这个做): a voucher is written first and its lines
// after. When the database refused the lines, Copy "rolled back" with a .delete() of the new draft —
// and payment_vouchers refuses every session's DELETE (pv_no_delete USING (false)), so the blank draft
// stayed while the answer said "rolled back"; Create payment did not even look at the lines' error.
// 126 receipts post to 3030 Accounts Receivable - Subs, a header since its sub-accounts came:
// copying HV-OR-202609-0429 hit exactly that. Now a copy checks its lines' accounts before it writes
// anything, and a draft whose lines still fail is voided (an update the session may make) — said in
// words, never left blank.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requireApproverOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { copyPaymentVoucherInWords, createPaymentFromDialog } from './actions'

// HV-OR-202609-0429 (production): Marketing's RM 2,000 settled by netting, its one line on 3030.
const RECEIPT = {
  voucher_type: 'billing_payment', direction: 'credit', amount: 2000, payee_name: '—', payee_company_id: null,
  bank_account_id: null, description: 'Settle invoice HV-INV-202609-0006 — —', payment_method: 'netting',
  target_pool: 'dept_pool_marketing', reference_type: null, fund_source_id: null, loan_id: null, repayment_breakdown: null,
}
const RECEIPT_LINES = [{ pool: 'dept_pool_marketing', amount: 2000, account_code: '3030', role: 'primary', override_account_type: null, override_gl_account_code: null, override_reason: null }]
// 3030's sub-accounts since the AR ledger was split by customer.
const SUBS_OF_3030 = ['3031', '3032', '3033', '3034', '3035', '3036', '3037', '3038', '3039', '3073'].map((code) => ({ code, parent_code: '3030' }))
const EXPENSE = { ...RECEIPT, voucher_type: 'expense', direction: 'debit', amount: 447.68, payee_name: 'Tan Yong Hong', description: 'Claude - Oct', payment_method: 'bank_transfer', target_pool: null }
const EXPENSE_LINES = [{ pool: 'venture_pool', amount: 447.68, account_code: '9087', role: 'primary', override_account_type: null, override_gl_account_code: null, override_reason: null }]

const inList = (call: RecordedCall, column: string) => (call.chain.find(([m, c]) => m === 'in' && c === column)?.[2] ?? []) as string[]

/**
 * The database as the session meets it. `linesError` — what it says to the new lines; `voided` — the
 * rows its update of the new draft to voided returns (none: the update was refused too).
 */
function database(src: Record<string, unknown>, lines: unknown[], opts: { linesError?: string; voided?: unknown[] } = {}) {
  const db = recordingSupabase((call) => {
    if (call.table === 'payment_vouchers' && call.op === 'select' && call.single) return { data: src }
    if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 520 }
    if (call.table === 'payment_voucher_sources' && call.op === 'select') return { data: lines }
    if (call.table === 'chart_of_accounts') return { data: SUBS_OF_3030.filter((a) => inList(call, 'parent_code').includes(a.parent_code)) }
    if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-new' } }
    if (call.table === 'payment_voucher_sources' && call.op === 'insert' && opts.linesError) return { error: { message: opts.linesError } }
    if (call.table === 'payment_vouchers' && call.op === 'update') return { data: opts.voided ?? [{ id: 'pv-new' }] }
    return {}
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

const copyOf = (id: string) => {
  const fd = new FormData()
  fd.set('voucher_id', id)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('Copy as a new draft', () => {
  it('a line on an account that is a header now is refused before anything is written', async () => {
    const db = database(RECEIPT, RECEIPT_LINES)

    const res = await copyPaymentVoucherInWords(copyOf('pv-0429'))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/3030 .*header account.*nothing was copied/i)
    expect(db.writes()).toEqual([])
  })

  it('lines the database still refuses: the new draft is voided, never deleted — and the answer says so', async () => {
    const db = database(EXPENSE, EXPENSE_LINES, { linesError: 'new row violates check constraint "pvs_override_all_or_none"' })

    const res = await copyPaymentVoucherInWords(copyOf('pv-expense'))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/pvs_override_all_or_none.*HV-PV-\d{6}-0521 was voided/)
    expect(db.writes('payment_vouchers').map((w) => w.op)).toEqual(['insert', 'update'])
    const voided = db.writes('payment_vouchers')[1]
    expect(voided.values).toEqual({ status: 'voided' })
    expect(voided.chain).toEqual(expect.arrayContaining([['eq', 'id', 'pv-new'], ['eq', 'status', 'draft']]))
  })

  it('if the void is refused too, it says the blank draft is there to void by hand', async () => {
    database(EXPENSE, EXPENSE_LINES, { linesError: 'permission denied', voided: [] })

    const res = await copyPaymentVoucherInWords(copyOf('pv-expense'))

    expect(res.ok === false && res.reason).toMatch(/HV-PV-\d{6}-0521 .*could not be voided/)
  })

  it('a copy whose lines are all on accounts that take postings is made as before', async () => {
    const db = database(EXPENSE, EXPENSE_LINES)

    const res = await copyPaymentVoucherInWords(copyOf('pv-expense'))

    expect(res).toMatchObject({ ok: true, id: 'pv-new' })
    expect(db.writes('payment_voucher_sources')[0].values).toEqual([expect.objectContaining({ voucher_id: 'pv-new', account_code: '9087', amount: 447.68 })])
    expect(db.writes('payment_vouchers').map((w) => w.op)).toEqual(['insert'])
  })
})

describe('Create payment', () => {
  const dialogForm = () => {
    const form = new FormData()
    const fields: Record<string, string> = {
      direction: 'debit', voucher_type: 'expense', reference_type: '', reference_id: '', payee_name: 'Tan Yong Hong',
      payee_company_id: '', bank_account_id: 'bank-hl', amount: '447.68', payment_date: '2026-10-12',
      payment_method: 'bank_transfer', description: 'Claude - Oct', target_pool: '', source_rows_count: '1',
      'source_rows[0][pool]': 'venture_pool', 'source_rows[0][amount]': '447.68', 'source_rows[0][account_code]': '9087',
      source_pool: 'venture_pool', attachment_count: '0',
    }
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    return form
  }

  it('lines the database refuses leave no draft without lines: it is voided, and the answer says so', async () => {
    const db = database(EXPENSE, [], { linesError: 'Cannot post to header account 3030 - pick a leaf sub-account instead.' })

    const res = await createPaymentFromDialog(dialogForm())

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/header account 3030.*HV-PV-\d{6}-0521 was voided/)
    const voided = db.writes('payment_vouchers').find((w) => w.op === 'update')
    expect(voided?.values).toEqual({ status: 'voided' })
    expect(voided?.chain).toEqual(expect.arrayContaining([['eq', 'id', 'pv-new'], ['eq', 'status', 'draft']]))
    expect(db.writes('approval_requests')).toEqual([])
  })
})
