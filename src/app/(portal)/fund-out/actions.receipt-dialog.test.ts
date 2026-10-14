import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// Loan repayment received from Receipt's dialog (2026-10-14, the Finance revamp
// v2 — D09): the parts the form page records, each its own repayment — but
// answered in words, the dialog staying on Receipt.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requirePage: async () => undefined,
  requirePermission: mocks.requireActionOn,
  requireActionOn: mocks.requireActionOn,
  requireAnyActionOn: mocks.requireActionOn,
  requirePayrollPayoutsActionOn: mocks.requireActionOn,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { recordLoanRepaymentFromDialog, recordLoanRepaymentReceived } from './actions'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const PARTS = { loan_id: 'loan-1', payment_date: '2026-10-14', bank_account_id: 'bank-hl', repayment_principal: '0', repayment_interest: '400', repayment_penalty: '50', notes: 'HC instalment Oct' }

function database(loan: unknown = { status: 'active', principal: 300000 }) {
  const db = recordingSupabase(
    (call) => {
      if (call.table === 'loans' && call.single) return { data: loan }
      if (call.table === 'bank_accounts') return { data: { id: 'bank-hl', gl_account_code: '3000', current_balance: 0 } }
      return {}
    },
    (fn) => (fn === 'post_journal_entry_as_caller' ? { data: 'je-1' } : {}),
  )
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
  vi.useFakeTimers({ now: new Date('2026-10-14T07:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('recordLoanRepaymentFromDialog', () => {
  it('records each part as its own repayment — the description as its notes — and answers with the total, going nowhere', async () => {
    const db = database()
    const res = await recordLoanRepaymentFromDialog(form(PARTS))
    expect(res).toEqual({ ok: true, total: 450 })
    expect(mocks.redirect).not.toHaveBeenCalled()
    const rows = db.writes('repayments').map((w) => w.values)
    expect(rows).toEqual([
      expect.objectContaining({ loan_id: 'loan-1', payment_type: 'interest', amount: 400, notes: 'HC instalment Oct', created_by: 'carrie' }),
      expect.objectContaining({ loan_id: 'loan-1', payment_type: 'penalty', amount: 50 }),
    ])
    expect(db.rpcs.filter((r) => r.fn === 'bump_bank_balance')).toHaveLength(2)
  })

  it('asks Receipt’s page first', async () => {
    database()
    await recordLoanRepaymentFromDialog(form(PARTS))
    expect(mocks.requireActionOn.mock.calls[0]).toEqual(['/receipts', 'treasury', 'create'])
  })

  it('a refusal comes back in words', async () => {
    database({ status: 'fully_repaid', principal: 300000 })
    expect(await recordLoanRepaymentFromDialog(form(PARTS))).toEqual({ ok: false, reason: 'Cannot record repayment on fully_repaid loan' })
    expect(await recordLoanRepaymentFromDialog(form({ ...PARTS, repayment_interest: '0', repayment_penalty: '0' }))).toEqual({
      ok: false,
      reason: 'Enter at least one of principal / interest / penalty',
    })
  })

  it('the form page keeps its way — on to the loan', async () => {
    database()
    await expect(recordLoanRepaymentReceived(form(PARTS))).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/fund-out/loan-1')
  })
})
