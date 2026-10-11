import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { withActions } from '@/test/with-actions'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-08: approving a claim drafts its payout voucher, numbered by month.
// The month was the UTC date's (`new Date().toISOString()`), so at 00:30 on 1
// November in the office the voucher was numbered as October's — and the
// period check asked about October, refusing the approval if October was
// already closed.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveClaim } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  // Pool claims are decided with Claims · Approve and Treasury · View (lib/surfaces.ts).
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'finance-user', role: 'finance', permissions: ['claims', 'claims_approve', 'treasury'] }))
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('a claim approved after midnight on the 1st', () => {
  it("drafts its voucher in the office's month, past October's close", async () => {
    const db = recordingSupabase((call: RecordedCall) => {
      if (call.table === 'claims' && call.single) {
        return { data: { claim_type: 'project', status: 'pending', amount: 120, claimant_name: 'Aina', description: 'Parking', created_by: 'someone-else', source_pool: 'venture_pool' } }
      }
      if (call.table === 'period_locks') {
        const month = call.chain.find(([m, col]) => m === 'eq' && col === 'period_month')?.[2]
        return { data: month === '2026-10-01' ? { id: 'october-closed' } : null }
      }
      if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 479 }
      if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-claim' } }
      return {}
    })
    mocks.createClient.mockResolvedValue(db.client)
    await inTimeZoneAsync('UTC', () => approveClaim('claim-1'))
    expect(db.writes('payment_vouchers')[0].values).toMatchObject({ voucher_no: 'HV-PV-202611-0480', payment_date: '2026-11-01' })
  })
})
