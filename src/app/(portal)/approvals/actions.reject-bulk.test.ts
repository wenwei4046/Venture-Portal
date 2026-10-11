import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'

// 2026-10-07 — the Approvals queue is a table with one bar under it for what
// is ticked: Approve n → and Reject…. Rejecting several at once did not exist
// (a single request was rejected from its page, a combined approval from its
// card); this is the sweep behind Reject…, the mirror of approveRequestsBulk.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission, requireApproverOn: mocks.requirePermission, requireApprovalQueue: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn() }))
vi.mock('@/lib/slack', () => ({ notifyApprovalDecision: vi.fn(), notifyNewApproval: vi.fn() }))
vi.mock('@/lib/journal', () => ({ postJournalEntry: vi.fn() }))
vi.mock('@/lib/loans-coa', () => ({ resolveLoansReceivableLeaf: vi.fn() }))

import { rejectRequestsBulk } from './actions'

interface Row {
  id: string
  request_type: string
  description: string
  status: string
  group_id: string | null
  reference_id: string
  reference_table: string
}
const PENDING: Row[] = [
  { id: 'pv1', request_type: 'payment_voucher', description: 'HV-PV-202610-0471: Office Rental', status: 'pending', group_id: null, reference_id: 'v471', reference_table: 'payment_vouchers' },
  { id: 'fs1', request_type: 'new_fund_source', description: 'Fund in from Mr Liang', status: 'pending', group_id: null, reference_id: 'fund1', reference_table: 'fund_sources' },
  { id: 'cpv', request_type: 'payment_voucher', description: 'HV-PV-202610-0475: Loan disbursement to 2990', status: 'pending', group_id: 'grp', reference_id: 'v475', reference_table: 'payment_vouchers' },
  { id: 'cln', request_type: 'new_loan', description: 'New loan to 2990', status: 'pending', group_id: 'grp', reference_id: 'loan1', reference_table: 'loans' },
]

interface Call {
  table: string
  op: 'select' | 'update'
  payload?: Record<string, unknown>
  filters: Array<[string, string, unknown]>
}

// A database that answers selects from the fixture and records every update.
function database(rows: Row[] = PENDING) {
  const calls: Call[] = []
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] }
    calls.push(call)
    const result = () => {
      if (call.op !== 'select') return { data: null, error: null }
      if (table !== 'approval_requests') return { data: [], error: null }
      let out = rows
      for (const [f, col, val] of call.filters) {
        if (f === 'eq') out = out.filter((r) => r[col as keyof Row] === val)
        if (f === 'in') out = out.filter((r) => (val as unknown[]).includes(r[col as keyof Row]))
      }
      return { data: out, error: null }
    }
    const b = {
      select: () => b,
      update: (payload: Record<string, unknown>) => {
        call.op = 'update'
        call.payload = payload
        return b
      },
      eq: (col: string, val: unknown) => {
        call.filters.push(['eq', col, val])
        return b
      },
      in: (col: string, val: unknown) => {
        call.filters.push(['in', col, val])
        return b
      },
      single: async () => {
        const r = result()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return b
  }
  mocks.createClient.mockResolvedValue({ from, rpc })
  const updates = (table: string) => calls.filter((c) => c.table === table && c.op === 'update')
  return { calls, rpc, updates }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'principal', name: 'Principal', role: 'principal', permissions: ['approvals'] }))
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('rejectRequestsBulk', () => {
  it('rejects every ticked single request with the one reason, and undoes what each one holds', async () => {
    const db = database()
    const result = await rejectRequestsBulk({ ids: ['pv1', 'fs1'], notes: 'Wrong month' })
    expect(result).toEqual({ rejected: 2, failed: [] })

    const decided = db.updates('approval_requests')
    expect(decided.map((u) => u.filters)).toEqual([
      [['eq', 'id', 'pv1'], ['eq', 'status', 'pending']],
      [['eq', 'id', 'fs1'], ['eq', 'status', 'pending']],
    ])
    for (const u of decided) {
      expect(u.payload).toMatchObject({ status: 'rejected', workflow_state: 'rejected', approved_by: 'principal', notes: 'Wrong month' })
      expect(typeof u.payload?.approved_at).toBe('string')
    }
    // The voucher is voided and its dept request (if any) is handed back; the fund source is cancelled.
    expect(db.updates('payment_vouchers')).toMatchObject([{ payload: { status: 'voided' }, filters: [['eq', 'id', 'v471'], ['eq', 'status', 'pending_approval']] }])
    expect(db.rpc).toHaveBeenCalledWith('dept_request_pv_rejected', { p_voucher_id: 'v471' })
    expect(db.updates('fund_sources')).toMatchObject([{ payload: { status: 'cancelled' }, filters: [['eq', 'id', 'fund1'], ['eq', 'status', 'pending_approval']] }])

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/approvals')
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('rejects a combined approval whole — the loan is cancelled and its voucher voided — and refuses a member picked on its own', async () => {
    const db = database()
    const result = await rejectRequestsBulk({ ids: ['cpv'], groupIds: ['grp'], notes: 'Not now' })
    expect(result.rejected).toBe(2)
    expect(result.failed).toEqual([{ id: 'cpv', description: 'HV-PV-202610-0475: Loan disbursement to 2990', error: 'Part of a combined approval — tick its row to reject the group' }])

    expect(db.updates('approval_requests')).toMatchObject([
      { payload: { status: 'rejected', notes: 'Not now' }, filters: [['eq', 'group_id', 'grp'], ['eq', 'status', 'pending']] },
    ])
    expect(db.updates('loans')).toMatchObject([{ payload: { status: 'cancelled', approved_by: 'principal' }, filters: [['eq', 'id', 'loan1'], ['eq', 'status', 'pending_approval']] }])
    expect(db.updates('payment_vouchers')).toMatchObject([{ payload: { status: 'voided' }, filters: [['eq', 'id', 'v475'], ['eq', 'status', 'pending_approval']] }])
  })

  it('reports a request that is no longer pending instead of stopping the sweep', async () => {
    const db = database()
    const result = await rejectRequestsBulk({ ids: ['gone', 'fs1'], notes: 'Duplicate' })
    expect(result).toEqual({ rejected: 1, failed: [{ id: 'gone', description: '—', error: 'Not found or already processed' }] })
    expect(db.updates('approval_requests')).toHaveLength(1)
  })

  it('insists on a reason, and on something being ticked', async () => {
    database()
    await expect(rejectRequestsBulk({ ids: ['pv1'], notes: '   ' })).rejects.toThrow('Rejection reason is required')
    await expect(rejectRequestsBulk({ ids: [], groupIds: [], notes: 'x' })).rejects.toThrow('No approvals selected')
  })
})
