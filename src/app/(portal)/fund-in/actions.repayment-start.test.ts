import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-12 (user: 现在只能选月份不能选日期 → expected repayment 和 repayment
// start date 应该要一样): a fund source's repayment start is a date — the day
// its first instalment falls due, kept as its Expected repayment.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setFundSourceRepaymentStart, updateFundSource } from './actions'

// Carres' fund source, effective 14 Sep 2026.
function database(effective_date: string | null = '2026-09-14') {
  const db = recordingSupabase((call) => (call.table === 'fund_sources' ? { data: effective_date ? { effective_date } : null } : {}))
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
})

describe('setting a fund source’s repayment start', () => {
  it('saves the date picked', async () => {
    const db = database()
    await expect(setFundSourceRepaymentStart('fs-car', '2026-10-14')).resolves.toBeUndefined()
    expect(db.rpcs).toEqual([{ fn: 'set_fund_source_repayment_start', args: { p_fund_source_id: 'fs-car', p_month: '2026-10-14' } }])
  })

  it('takes a date, not a month', async () => {
    const db = database()
    await expect(setFundSourceRepaymentStart('fs-car', '2026-10')).resolves.toEqual({ error: 'Pick a date' })
    expect(db.rpcs).toEqual([])
  })

  it('does not start before the money came in', async () => {
    const db = database()
    await expect(setFundSourceRepaymentStart('fs-car', '2026-09-13')).resolves.toEqual({ error: 'The repayment cannot start before the effective date, 14 Sep 2026' })
    expect(db.rpcs).toEqual([])
    await expect(setFundSourceRepaymentStart('fs-car', '2026-09-14')).resolves.toBeUndefined()
  })

  it('says so when the fund source is not there', async () => {
    database(null)
    await expect(setFundSourceRepaymentStart('fs-gone', '2026-10-14')).resolves.toEqual({ error: 'Fund source not found' })
  })
})

describe('editing a pending fund source’s Expected repayment', () => {
  it('moves its start month with it', async () => {
    const db = recordingSupabase((call) =>
      call.table === 'fund_sources'
        ? call.op === 'update'
          ? { data: [{ id: 'fs-new' }] }
          : { data: { id: 'fs-new', status: 'pending_approval', source_type: 'subsidiary', amount: 30000 } }
        : {},
    )
    mocks.createClient.mockResolvedValue(db.client)
    const fd = new FormData()
    for (const [k, v] of Object.entries({ id: 'fs-new', amount: '30000', cost_rate_percent: '2', lock_in_months: '3', effective_date: '2026-09-14', repayment_date: '2026-11-20' })) fd.set(k, v)
    await updateFundSource(fd)
    expect(db.writes('fund_sources')[0].values).toMatchObject({ repayment_date: '2026-11-20', repayment_start_month: '2026-11-01' })
  })
})
