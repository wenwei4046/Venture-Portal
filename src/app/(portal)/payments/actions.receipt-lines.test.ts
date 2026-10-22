import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-22 (the user, shown it as a receipt of RM 5,000 settling an invoice: 要): a receipt was
// written already received, and the database marked its invoice paid the moment it was; its line
// came after. A line the database refused stopped the action there — the receipt said received, the
// invoice said paid, and the bank and the books never had the money. Now a receipt is written as a
// draft, its line next, and it is marked received only once the line is in (the invoice is marked
// then, by the same trigger as before); a line refused voids the draft and leaves the invoice as it
// was. What can be checked before anything is written is: a line on a header account (3030 since
// AR was split by customer — the account a customer with none of its own falls back to), and a
// netting settle's paying side (IT has no Inter-billing account).

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requireApproverOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { settleInvoiceFromSheet } from './actions'

const selectOf = (call: RecordedCall) => String(call.chain.find(([m]) => m === 'select')?.[1] ?? '')
const inList = (call: RecordedCall, column: string) => (call.chain.find(([m, c]) => m === 'in' && c === column)?.[2] ?? []) as string[]
const SUBS_OF_3030 = ['3031', '3032', '3033', '3034', '3035', '3036', '3037', '3038', '3039', '3073'].map((code) => ({ code, parent_code: '3030' }))

interface Book {
  /** What ar_account_for_invoice answers (null: the customer has no receivable account of its own). */
  ar?: string | null
  /** The open invoice being settled. */
  invoice?: Record<string, unknown>
  /** Who the invoice bills (a department's pool settles by netting). */
  billed?: { billable_to_type: string; billable_to_department_id: string | null }
  department?: string
  interBillingAccount?: { code: string; name: string } | null
  linesError?: string
  /** The rows the update to received returns (none: it was refused). */
  received?: unknown[]
}

/** The database as the session meets it; `steps` lists every write and rpc in the order sent. */
function production(book: Book = {}) {
  const steps: string[] = []
  const db = recordingSupabase(
    (call) => {
      if (call.op !== 'select') steps.push(`${call.op} ${call.table}${call.op === 'update' ? ` ${(call.values as { status?: string }).status}` : ''}`)
      if (call.table === 'invoices' && call.op === 'select' && selectOf(call).includes('total_amount')) {
        return { data: book.invoice ?? { id: 'inv-0054', status: 'issued', billing_mode: 'revenue_department_attribution', total_amount: 10276 } }
      }
      if (call.table === 'invoices' && call.op === 'select') return { data: book.billed ?? { billable_to_type: 'subsidiary', billable_to_department_id: null } }
      if (call.table === 'departments') return { data: { name: book.department ?? 'IT' } }
      if (call.table === 'chart_of_accounts' && selectOf(call).includes('parent_code')) {
        return { data: SUBS_OF_3030.filter((a) => inList(call, 'parent_code').includes(a.parent_code)) }
      }
      if (call.table === 'chart_of_accounts') return { data: book.interBillingAccount ?? null }
      if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 521, data: [] }
      if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'or-new' } }
      if (call.table === 'payment_voucher_sources' && call.op === 'insert' && book.linesError) return { error: { message: book.linesError } }
      if (call.table === 'payment_vouchers' && call.op === 'update') {
        return { data: (call.values as { status?: string }).status === 'paid' ? (book.received ?? [{ id: 'or-new' }]) : [{ id: 'or-new' }] }
      }
      if (call.table === 'bank_accounts') return { data: { gl_account_code: '3000' } }
      return {}
    },
    (fn) => {
      steps.push(`rpc ${fn}`)
      if (fn === 'ar_account_for_invoice') return { data: book.ar === undefined ? '3031' : book.ar }
      if (fn === 'post_journal_entry_as_caller') return { data: 'je-1' }
      return {}
    },
  )
  mocks.createClient.mockResolvedValue(db.client)
  return { db, steps }
}

/** HV-OR-202610-0519 (production): HOUZS Century's RM 10,276.00 into the Revenue Department's pool, settling HV-INV-202608-0054. */
const settle = (over: Record<string, string> = {}) => {
  const form = new FormData()
  const fields: Record<string, string> = {
    direction: 'credit', voucher_type: 'billing_payment', invoice_id: 'inv-0054', reference_type: '', reference_id: '',
    payee_name: 'HOUZS Century', payee_company_id: 'co-hc', bank_account_id: 'bank-hl', amount: '10276.00',
    payment_date: '2026-09-20', payment_method: 'bank_transfer', description: 'Settle HV-INV-202608-0054',
    target_pool: 'dept_pool_revenue_department', attachment_count: '0', ...over,
  }
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return form
}

const writesOf = (db: ReturnType<typeof production>['db'], table: string, op: string) => db.writes(table).filter((w) => w.op === op)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['treasury'] })
})

describe('a receipt becomes received only once its line is in', () => {
  it('is written as a draft, its line next, then marked received — the bank and the books as before', async () => {
    const { db, steps } = production()

    const res = await settleInvoiceFromSheet(settle())

    expect(res).toMatchObject({ ok: true, id: 'or-new' })
    const [made] = writesOf(db, 'payment_vouchers', 'insert')
    expect(made.values).toMatchObject({ direction: 'credit', status: 'draft', amount: 10276, invoice_id: 'inv-0054' })
    expect(made.values).not.toHaveProperty('approved_by')
    expect(writesOf(db, 'payment_voucher_sources', 'insert')[0].values).toEqual([
      expect.objectContaining({ voucher_id: 'or-new', pool: 'dept_pool_revenue_department', amount: 10276, account_code: '3031' }),
    ])
    const [received] = writesOf(db, 'payment_vouchers', 'update')
    expect(received.values).toEqual(expect.objectContaining({ status: 'paid', approved_by: 'carrie', executed_by: 'carrie' }))
    expect(received.chain).toEqual(expect.arrayContaining([['eq', 'id', 'or-new'], ['eq', 'status', 'draft']]))
    const at = (s: string) => steps.indexOf(s)
    expect(at('insert payment_voucher_sources')).toBeGreaterThan(at('insert payment_vouchers'))
    expect(at('update payment_vouchers paid')).toBeGreaterThan(at('insert payment_voucher_sources'))
    expect(at('rpc bump_bank_for_paid_credit')).toBeGreaterThan(at('update payment_vouchers paid'))
    expect(at('rpc post_journal_entry_as_caller')).toBeGreaterThan(at('update payment_vouchers paid'))
  })

  it('a line the database refuses: the draft is voided, never received — no bank, no books, the invoice untouched', async () => {
    const { db, steps } = production({ linesError: 'new row violates check constraint "pvs_amount_positive"' })

    const res = await settleInvoiceFromSheet(settle())

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/pvs_amount_positive.*HV-OR-\d{6}-0522 was voided.*invoice/)
    expect(writesOf(db, 'payment_vouchers', 'update').map((w) => w.values)).toEqual([{ status: 'voided' }])
    expect(steps).not.toContain('rpc bump_bank_for_paid_credit')
    expect(steps).not.toContain('rpc post_journal_entry_as_caller')
    expect(db.writes('invoices')).toEqual([])
  })

  it('if it cannot be marked received, nothing is posted and the answer says so', async () => {
    const { db, steps } = production({ received: [] })

    const res = await settleInvoiceFromSheet(settle())

    expect(res.ok === false && res.reason).toMatch(/HV-OR-\d{6}-0522 could not be marked received/)
    expect(steps).not.toContain('rpc bump_bank_for_paid_credit')
    expect(steps).not.toContain('rpc post_journal_entry_as_caller')
    expect(db.writes('invoices')).toEqual([])
  })
})

describe('what can be checked before anything is written', () => {
  it('a customer with no receivable account of its own falls back to 3030, a header account — refused, nothing written', async () => {
    const { db } = production({ ar: null })

    const res = await settleInvoiceFromSheet(settle())

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/3030 .*header account.*nothing was saved/i)
    expect(db.writes()).toEqual([])
  })

  it('a netting settle billed to IT, which has no Inter-billing account — refused, nothing written', async () => {
    const { db } = production({
      ar: '3073',
      invoice: { id: 'inv-it', status: 'issued', billing_mode: 'marketing_project', total_amount: 1500 },
      billed: { billable_to_type: 'dept_pool', billable_to_department_id: 'dept-it' },
      department: 'IT',
      interBillingAccount: null,
    })

    const res = await settleInvoiceFromSheet(settle({ invoice_id: 'inv-it', amount: '1500.00', payment_method: 'netting', bank_account_id: '', target_pool: 'dept_pool_marketing', description: 'Settle HV-INV-202609-0044' }))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/Inter-billing — IT/)
    expect(db.writes()).toEqual([])
  })
})
