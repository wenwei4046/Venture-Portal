import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-08: every staff edit re-snapshots "the current month", and the
// allocator's invoices are dated "today" — both read off the SERVER's clock,
// which keeps UTC. At 00:30 on 1 November in the office, October's snapshot
// was overwritten and the invoices were dated 31 October.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), createMultiLineInvoice: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../billing/actions', () => ({ createMultiLineInvoice: mocks.createMultiLineInvoice }))

import { deleteAllocStaff, generateAllocatorInvoices } from './actions'

function database() {
  const db = recordingSupabase((call) => {
    if (call.table === 'alloc_staff' && call.op === 'select') return { data: [{ id: 's1', name: 'Aina', status: 'active', department: 'HR' }] }
    if (call.table === 'alloc_txns' && call.op === 'select') {
      return {
        data: [{
          id: 't1', txn_no: 'ALC-202611-001', description: 'Water bill', amount: 500, method: 'equal', category_id: 'cat-1', billed_ref: null,
          alloc_txn_details: [{ company_id: 'co-1', department_id: null, method_detail: '100%', amount: 500, is_own_share: false }],
        }],
      }
    }
    if (call.table === 'companies') return { data: [{ id: 'co-1', short_code: 'HC', name: 'HOUZS Century' }] }
    if (call.table === 'alloc_categories') return { data: [{ id: 'cat-1', coa_code: '6100' }] }
    return { data: [] }
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['billing'] })
  mocks.createMultiLineInvoice.mockResolvedValue({ invoice_no: 'HV-INV-202611-0003' })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('the allocator after midnight on the 1st', () => {
  it("re-snapshots the office's month, leaving October's alone", async () => {
    const db = database()
    expect(await inTimeZoneAsync('UTC', () => deleteAllocStaff('s1'))).toEqual({})
    const history = db.writes('alloc_staff_history')
    expect(history.find((w) => w.op === 'delete')?.chain).toContainEqual(['eq', 'period_month', '2026-11-01'])
    expect(history.find((w) => w.op === 'insert')?.values).toEqual([expect.objectContaining({ period_month: '2026-11-01', staff_id: 's1' })])
  })

  it("dates the invoices it raises on the office's day", async () => {
    database()
    const result = await inTimeZoneAsync('UTC', () => generateAllocatorInvoices('2026-11'))
    expect(result.error).toBeUndefined()
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledWith(expect.objectContaining({ period: '2026-11', invoiceDate: '2026-11-01' }))
  })
})
