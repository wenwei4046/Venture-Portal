import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-08: "today" in Fund Out was the SERVER's (UTC). From midnight until
// 08:00 in the office a new loan was priced off the base rate in force
// YESTERDAY (its rate is locked for life), and a repayment dated today was
// refused as "in the future".

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createLoan, recordRepayment } from './actions'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('Fund Out after midnight', () => {
  it("prices a new loan off the base rate in force on the office's today", async () => {
    const db = recordingSupabase((call: RecordedCall) =>
      call.table === 'chart_of_accounts'
        ? { data: [{ code: '3000', name: 'Bank', type: 'asset', is_active: true, parent_code: null }] }
        : { data: null },
    )
    mocks.createClient.mockResolvedValue(db.client)
    await inTimeZoneAsync('UTC', () =>
      createLoan(form({ company_id: 'co-1', principal: '40000', tenure_months: '12', loan_start_date: '2026-11-01', disbursement_account_code: '3000' })),
    )
    const baseRate = db.calls.find((c) => c.table === 'base_rate_history')
    expect(baseRate?.chain).toContainEqual(['lte', 'effective_from', '2026-11-01'])
  })

  it("takes a repayment dated the office's today — it is not in the future", async () => {
    const db = recordingSupabase()
    mocks.createClient.mockResolvedValue(db.client)
    const repay = inTimeZoneAsync('UTC', () =>
      recordRepayment(form({ loan_id: 'loan-1', payment_type: 'interest', amount: '100', payment_date: '2026-11-01' })),
    )
    // It gets past the date check to the loan itself (which this database does not have).
    await expect(repay).rejects.toThrow(/loan/i)
    await expect(repay).rejects.not.toThrow('Payment date cannot be in the future')
    await expect(
      inTimeZoneAsync('UTC', () => recordRepayment(form({ loan_id: 'loan-1', payment_type: 'interest', amount: '100', payment_date: '2026-11-02' }))),
    ).rejects.toThrow('Payment date cannot be in the future')
  })
})
