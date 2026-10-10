import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-08: HR may submit the cost summary for the current month or an
// earlier one — "current" read off the SERVER's clock (UTC). At 00:30 on the
// 1st in the office the new month was still "the future" and was refused.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { submitHRCostSummary } from './actions'

const submit = (period_month: string) => {
  const fd = new FormData()
  fd.set('period_month', period_month)
  return inTimeZoneAsync('UTC', () => submitHRCostSummary(fd))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'hr-user', role: 'hr', permissions: ['hr_costing'] })
  const db = recordingSupabase(undefined, (fn) =>
    fn === 'build_hr_cost_submission_payload' ? { data: { dept_summaries: { HR: { staff: 5 } }, staff_snapshot: [], pool_allocation_snapshot: {}, staff_allocation_snapshot: {} } } : {},
  )
  mocks.createClient.mockResolvedValue(db.client)
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe("the HR cost summary, submitted after midnight on the 1st", () => {
  it("accepts the office's new month", async () => {
    await expect(submit('2026-11-01')).resolves.toEqual({ period: '2026-11-01', departments: ['HR'] })
  })

  it('still refuses the month after it', async () => {
    await expect(submit('2026-12-01')).rejects.toThrow('Cannot submit for a future period')
  })
})
