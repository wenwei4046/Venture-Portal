import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-08: a BA's interest invoice was filed under the SERVER's month and
// dated the server's day. Vercel keeps UTC, so one raised at 00:30 on 1
// November in the office was October's, dated 31 October.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), createMultiLineInvoice: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }))
vi.mock('../billing/actions', () => ({ createMultiLineInvoice: mocks.createMultiLineInvoice }))
vi.mock('../payments/actions', () => ({ createPaymentVoucher: vi.fn() }))

import { generateBaInvoice } from './actions'

const BA = {
  id: 'ba-1-0000-0000', ba_no: 'BA-77', face_amount: 100000, bank_annual_rate: 0.05, tenor_days: 90,
  charge_rate_monthly: 0.025, hc_rate_monthly: 0.015, borrower_company_id: 'co-1', borrower_name: null,
  start_date: '2026-10-15', maturity_date: '2027-01-13',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
  mocks.createMultiLineInvoice.mockResolvedValue({ invoice_no: 'HV-INV-202611-0002' })
  const db = recordingSupabase((call) => {
    if (call.table === 'ba_facilities') return { data: BA }
    if (call.table === 'companies') return { data: { name: 'HOUZS Century' } }
    return { data: null }
  })
  mocks.createClient.mockResolvedValue(db.client)
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('a BA interest invoice raised after midnight', () => {
  it("is filed under the office's month and dated the office's day", async () => {
    expect(await inTimeZoneAsync('UTC', () => generateBaInvoice(BA.id))).toEqual({ invoiceNo: 'HV-INV-202611-0002' })
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledWith(expect.objectContaining({ period: '2026-11', invoiceDate: '2026-11-01' }))
  })
})
