import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-12 — a repayment voucher's copy repays the same deal (user: 三样都做).
// HV-PV-202608-0312 / 0313 were copies of July's instalments to HOUZS Century:
// copied without their fund source, the paid 4th instalments never reached the
// deals' own records and the Overdue page showed them unpaid. A copy now
// carries the fund source (or the loan) with its principal and interest while
// the deal is live; a plain expense's copy carries none, as before.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { copyPaymentVoucher } from './actions'

const breakdown = { penalty: 0, interest: 1800, principal: 10000 }
const repayment = {
  voucher_type: 'loan_repayment', direction: 'debit', amount: 11800, payee_name: 'HOUZS Century', payee_company_id: 'co-hc', bank_account_id: 'bank-1',
  description: 'Loan Repayment - 3rd Installment', payment_method: 'bank_transfer', target_pool: null, reference_type: null,
  fund_source_id: 'fs-60k', loan_id: null, repayment_breakdown: breakdown,
}

function database(src: Record<string, unknown>, deal: { table: string; status: string } | null = null) {
  const db = recordingSupabase((call) => {
    if (call.table === 'payment_vouchers' && call.op === 'select' && !call.single) return { count: 520 }
    if (call.table === 'payment_vouchers' && call.op === 'select') return { data: src }
    if (deal && call.table === deal.table && call.op === 'select') return { data: { status: deal.status } }
    if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-new' } }
    return {}
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

async function copy() {
  const form = new FormData()
  form.set('voucher_id', 'pv-old')
  await expect(copyPaymentVoucher(form)).rejects.toThrow('NEXT_REDIRECT')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('copying a repayment voucher', () => {
  it('repays the same fund source, with its principal and interest, while the deal is live', async () => {
    const db = database(repayment, { table: 'fund_sources', status: 'active' })
    await copy()
    const [made] = db.writes('payment_vouchers')
    expect(made.values).toMatchObject({ status: 'draft', amount: 11800, fund_source_id: 'fs-60k', loan_id: null, repayment_breakdown: breakdown })
  })

  it('carries no deal once the fund source is repaid — a plain copy, as before', async () => {
    const db = database(repayment, { table: 'fund_sources', status: 'repaid' })
    await copy()
    const [made] = db.writes('payment_vouchers')
    expect(made.values).toMatchObject({ fund_source_id: null, loan_id: null, repayment_breakdown: null })
  })

  it('a loan repayment’s copy keeps its loan while the loan is active', async () => {
    const db = database({ ...repayment, direction: 'credit', fund_source_id: null, loan_id: 'loan-1' }, { table: 'loans', status: 'active' })
    await copy()
    const [made] = db.writes('payment_vouchers')
    expect(made.values).toMatchObject({ fund_source_id: null, loan_id: 'loan-1', repayment_breakdown: breakdown })
  })

  it('an expense’s copy carries no deal', async () => {
    const db = database({ ...repayment, voucher_type: 'expense', fund_source_id: null, loan_id: null, repayment_breakdown: null })
    await copy()
    const [made] = db.writes('payment_vouchers')
    expect(made.values).toMatchObject({ fund_source_id: null, loan_id: null, repayment_breakdown: null })
  })
})
