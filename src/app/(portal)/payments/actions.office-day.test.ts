import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-08: a voucher's number carries its month (HV-PV-202611-0480). The
// month came from the SERVER's clock, which keeps UTC, so a voucher keyed at
// 00:30 on 1 November in the office was numbered as October's.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { copyPaymentVoucher, createPaymentVoucher, voidPaidReceipt } from './actions'

function database() {
  const db = recordingSupabase((call) => {
    if (call.table === 'payment_vouchers' && call.op === 'select' && !call.single) return { count: 479 }
    if (call.table === 'payment_vouchers' && call.op === 'select') {
      return { data: { voucher_type: 'expense', direction: 'debit', amount: 80, payee_name: 'GDex', payee_company_id: null, bank_account_id: 'bank-1', description: 'Night courier', payment_method: 'bank_transfer', target_pool: null, reference_type: null } }
    }
    if (call.op === 'insert') return { data: { id: 'pv-new' } }
    return {}
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe("a voucher made after midnight is numbered and dated in the office's month", () => {
  it('a new voucher: HV-PV-202611-…, paid on 1 Nov when no date is given', async () => {
    const db = database()
    const form = new FormData()
    for (const [k, v] of Object.entries({ voucher_type: 'expense', amount: '80', payee_name: 'GDex', bank_account_id: 'bank-1', description: 'Night courier' })) form.set(k, v)
    await expect(inTimeZoneAsync('UTC', () => createPaymentVoucher(form))).rejects.toThrow('NEXT_REDIRECT')
    const [voucher] = db.writes('payment_vouchers')
    expect(voucher.values).toMatchObject({ voucher_no: 'HV-PV-202611-0480', payment_date: '2026-11-01' })
  })

  it('a copy: numbered in November and dated 1 Nov', async () => {
    const db = database()
    const form = new FormData()
    form.set('voucher_id', 'pv-old')
    await expect(inTimeZoneAsync('UTC', () => copyPaymentVoucher(form))).rejects.toThrow('NEXT_REDIRECT')
    const [copy] = db.writes('payment_vouchers')
    expect(copy.values).toMatchObject({ voucher_no: 'HV-PV-202611-0480', payment_date: '2026-11-01' })
  })

  it("a receipt voided after its month closed: the reversal is dated the office's today", async () => {
    const receipt = { id: 'or-1', voucher_no: 'HV-OR-202610-0470', direction: 'credit', voucher_type: 'receive_payment', status: 'paid', amount: 500, bank_account_id: 'bank-1', target_pool: 'venture_pool', invoice_id: null, payee_name: 'HOUZS Century', payment_method: 'bank_transfer', payment_date: '2026-10-28' }
    const db = recordingSupabase(
      (call) => {
        if (call.table === 'payment_vouchers' && call.single) return { data: receipt }
        if (call.table === 'period_locks') return { data: { id: 'october-closed' } }
        if (call.table === 'journal_entries') return { data: [{ id: 'je-1', entry_no: 'JE-1', segment: 'corporate', description: 'Receipt' }] }
        if (call.table === 'journal_lines') return { data: [{ account_code: '3000', debit: 500, credit: 0, description: 'Bank' }, { account_code: '3030', debit: 0, credit: 500, description: 'AR' }] }
        return {}
      },
      (fn) => (fn === 'post_journal_entry_as_caller' ? { data: 'je-reversal' } : {}),
    )
    mocks.createClient.mockResolvedValue(db.client)
    const form = new FormData()
    form.set('id', 'or-1')
    await expect(inTimeZoneAsync('UTC', () => voidPaidReceipt(form))).rejects.toThrow('NEXT_REDIRECT')
    expect(db.rpcs.find((r) => r.fn === 'post_journal_entry_as_caller')?.args).toMatchObject({ p_transaction_date: '2026-11-01' })
  })
})
