import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-12 (user: 现在只能选月份不能选日期): a loan's repayment start is a
// date — the day its first instalment falls due, every later one on its day.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setLoanRepaymentStart } from './actions'

// A loan disbursed 2 Sep 2025; a pending one has no disbursement yet.
function database(loan: { disbursement_date: string | null } | null = { disbursement_date: '2025-09-02' }) {
  const db = recordingSupabase((call) => (call.table === 'loans' ? { data: loan } : {}))
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
})

describe('setting a loan’s repayment start', () => {
  it('saves the date picked', async () => {
    const db = database()
    await expect(setLoanRepaymentStart('loan-4', '2026-05-20')).resolves.toBeUndefined()
    expect(db.rpcs).toEqual([{ fn: 'set_loan_repayment_start', args: { p_loan_id: 'loan-4', p_month: '2026-05-20' } }])
  })

  it('takes a date, not a month', async () => {
    const db = database()
    await expect(setLoanRepaymentStart('loan-4', '2026-05')).resolves.toEqual({ error: 'Pick a date' })
    expect(db.rpcs).toEqual([])
  })

  it('does not start before the disbursement', async () => {
    const db = database()
    await expect(setLoanRepaymentStart('loan-4', '2025-09-01')).resolves.toEqual({ error: 'The repayment cannot start before the disbursement, 2 Sep 2025' })
    expect(db.rpcs).toEqual([])
  })

  it('takes any date for a loan not yet disbursed', async () => {
    const db = database({ disbursement_date: null })
    await expect(setLoanRepaymentStart('loan-9', '2026-11-05')).resolves.toBeUndefined()
    expect(db.rpcs).toHaveLength(1)
  })

  it('says so when the loan is not there', async () => {
    database(null)
    await expect(setLoanRepaymentStart('loan-gone', '2026-11-05')).resolves.toEqual({ error: 'Loan not found' })
  })
})
