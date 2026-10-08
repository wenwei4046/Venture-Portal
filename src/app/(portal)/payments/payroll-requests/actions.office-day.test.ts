import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-08: a payroll funding PV given no payment date is dated "today" —
// and numbered by that day's month. Today was the SERVER's (UTC), so a PV
// made at 00:30 on 1 November in the office was dated 31 October and numbered
// as October's; at approval its GL posted into October.

const mocks = vi.hoisted(() => ({ requirePayrollPayouts: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePayrollPayouts: mocks.requirePayrollPayouts }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { generatePvFromRequest } from './actions'

const BANKS: Record<string, unknown> = {
  'bank-hl': { id: 'bank-hl', bank_name: 'Hong Leong', status: 'active', current_balance: 500000, gl_account_code: '3000' },
  'bank-alliance': { id: 'bank-alliance', bank_name: 'Alliance', status: 'active', gl_account_code: '3010' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePayrollPayouts.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('a payroll funding PV made after midnight with no date picked', () => {
  it("is dated and numbered on the office's day", async () => {
    const db = recordingSupabase((call: RecordedCall) => {
      if (call.table === 'payroll_payment_requests' && call.single) {
        return { data: { id: 'req-1', status: 'submitted', amount: 5000, payroll_run_id: 'run-1', target_pool: 'dept_pool_hr', period_month: null, payroll_runs: { period_month: '2026-10-01' } } }
      }
      if (call.table === 'bank_accounts') return { data: BANKS[call.chain.find(([m]) => m === 'eq')?.[2] as string] ?? null }
      if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-new', voucher_no: 'HV-PV-202611-0480' } }
      if (call.table === 'payment_vouchers') {
        const head = call.chain.some(([m, , opts]) => m === 'select' && (opts as { head?: boolean } | undefined)?.head)
        return head ? { count: 479 } : { data: [] }
      }
      return {}
    })
    mocks.createClient.mockResolvedValue(db.client)
    await expect(
      inTimeZoneAsync('UTC', () => generatePvFromRequest('req-1', 'bank-hl', 'bank-alliance', [{ pool: 'dept_pool_hr', amount: 5000 }], '')),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(db.writes('payment_vouchers')[0].values).toMatchObject({ voucher_no: 'HV-PV-202611-0480', payment_date: '2026-11-01' })
  })
})
