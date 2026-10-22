import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-22 (the user: 要): Invoice's *Settle N →* writes ONE receipt already received, then its
// line on the customer's receivable account. A customer with no receivable account of its own falls
// back to 3030 — a header since AR was split by customer — and the database refuses the line after
// the receipt is written: a received receipt with no line, no bank, no books. The account is checked
// before anything is written now. (This settle is Billing · Create's, which may not update a
// voucher, so it cannot be written as a draft first as Payments' receipt is.)

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { settleInvoicesConsolidated } from './actions'

const selectOf = (call: RecordedCall) => String(call.chain.find(([m]) => m === 'select')?.[1] ?? '')
const inList = (call: RecordedCall, column: string) => (call.chain.find(([m, c]) => m === 'in' && c === column)?.[2] ?? []) as string[]
const SUBS_OF_3030 = ['3031', '3032', '3033', '3034', '3035', '3036', '3037', '3038', '3039', '3073'].map((code) => ({ code, parent_code: '3030' }))

/** Two of HOUZS Century's issued invoices; `ar` — what ar_account_for_invoice answers (null: none of its own). */
function production(ar: string | null) {
  const db = recordingSupabase(
    (call) => {
      if (call.table === 'bank_accounts') return { data: { id: 'bank-hl', gl_account_code: '3000' } }
      if (call.table === 'invoices' && call.op === 'select') {
        return {
          data: [
            { id: 'inv-a', invoice_no: 'HV-INV-202610-0011', company_id: 'co-hc', total_amount: 2400, status: 'issued', billable_to_type: 'subsidiary', billable_to_freetext_name: null, billing_mode: 'hr_attribution' },
            { id: 'inv-b', invoice_no: 'HV-INV-202610-0012', company_id: 'co-hc', total_amount: 1800, status: 'issued', billable_to_type: 'subsidiary', billable_to_freetext_name: null, billing_mode: 'finance_attribution' },
          ],
        }
      }
      if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 600, data: [] }
      if (call.table === 'credit_notes') return { data: [] }
      if (call.table === 'companies') return { data: { name: 'HOUZS Century' } }
      if (call.table === 'chart_of_accounts' && selectOf(call).includes('parent_code')) {
        return { data: SUBS_OF_3030.filter((a) => inList(call, 'parent_code').includes(a.parent_code)) }
      }
      if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'or-new' } }
      return {}
    },
    (fn) => (fn === 'ar_account_for_invoice' ? { data: ar } : fn === 'post_journal_entry_as_caller' ? { data: 'je-1' } : {}),
  )
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['billing', 'treasury'] })
})

describe('Settle N → on Invoice', () => {
  it('a receivable account that is a header (3030, the fallback) is refused before the receipt is written', async () => {
    const db = production(null)

    await expect(
      settleInvoicesConsolidated({ invoiceIds: ['inv-a', 'inv-b'], bankAccountId: 'bank-hl', paymentDate: '2026-10-20' }),
    ).rejects.toThrow(/3030 .*header account.*nothing was saved/i)
    expect(db.writes()).toEqual([])
    expect(db.rpcs.map((r) => r.fn)).not.toContain('bump_bank_for_paid_credit')
  })

  it("the customer's own receivable account is written as before", async () => {
    const db = production('3031')

    await settleInvoicesConsolidated({ invoiceIds: ['inv-a', 'inv-b'], bankAccountId: 'bank-hl', paymentDate: '2026-10-20' }).catch(() => undefined)

    expect(db.writes('payment_vouchers')[0]?.values).toMatchObject({ direction: 'credit', status: 'paid', amount: 4200 })
    expect(db.writes('payment_voucher_sources')[0]?.values).toMatchObject({ voucher_id: 'or-new', account_code: '3031', amount: 4200 })
  })
})
