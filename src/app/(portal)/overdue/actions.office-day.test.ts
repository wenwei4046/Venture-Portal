import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-08: overdue detection checks "the previous calendar month" — the
// month before the SERVER's. On the 1st, until 08:00 in the office, the
// server (UTC) was still in October, so a run at 00:30 on 1 November checked
// September again and October's unpaid interest went undetected.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { detectOverdue } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('overdue detection run after midnight on the 1st', () => {
  it('checks the month that has just ended in the office — October', async () => {
    const db = recordingSupabase((call: RecordedCall) => {
      if (call.table === 'loans') return { data: [{ id: 'loan-1', principal: 40000, effective_rate: 0.01, disbursement_date: '2026-06-01' }] }
      if (call.table === 'loan_outstanding') return { data: [{ loan_id: 'loan-1', outstanding: 40000 }] }
      return { data: [] }
    })
    mocks.createClient.mockResolvedValue(db.client)
    const result = await inTimeZoneAsync('UTC', () => detectOverdue())
    expect(result).toEqual({ detected: 1, message: 'Detected 1 overdue loan(s) for Oct 2026.' })
    const repayments = db.calls.find((c) => c.table === 'repayments')
    expect(repayments?.chain).toEqual(expect.arrayContaining([['gte', 'payment_date', '2026-10-01'], ['lte', 'payment_date', '2026-10-31']]))
    // Whole days since October ended: none yet, on the 1st.
    expect(db.writes('overdue_records')[0].values).toMatchObject({ loan_id: 'loan-1', period_month: '2026-10-01', overdue_days: 0 })
  })
})
