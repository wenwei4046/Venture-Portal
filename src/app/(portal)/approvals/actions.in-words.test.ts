import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'

// 2026-10-15 — the queue's refusals are answered in words, never thrown:
// production reduces a thrown Server Action's message to a digest, so a closed
// month read "An error occurred" on the queue's bar and on the Finance phone
// app's Approvals, and so did a combined approval the database refused.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  assertPeriodOpen: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission, requireApproverOn: mocks.requirePermission, requireApprovalQueue: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mocks.assertPeriodOpen }))
vi.mock('@/lib/slack', () => ({ notifyApprovalDecision: vi.fn(async () => undefined), notifyNewApproval: vi.fn() }))
vi.mock('@/lib/journal', () => ({ postJournalEntry: vi.fn() }))
vi.mock('@/lib/loans-coa', () => ({ resolveLoansReceivableLeaf: vi.fn() }))

import { approveRequestGroupPartial, approveRequestsBulk } from './actions'

/** A database whose selects answer `rows` and whose rpc answers `rpcError`. */
function database(rows: Array<Record<string, unknown>>, rpcError: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: null, error: rpcError }))
  const from = vi.fn(() => {
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return b
  })
  mocks.createClient.mockResolvedValue({ from, rpc })
  return { from, rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'principal', name: 'Principal', role: 'principal', permissions: ['approvals'] }))
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('approveRequestsBulk', () => {
  it('a closed month is said in the answer, and nothing is read or approved', async () => {
    const db = database([])
    mocks.assertPeriodOpen.mockRejectedValue(new Error('Period Oct 2026 is closed. Contact Principal to reopen.'))
    const result = await approveRequestsBulk({ ids: ['pv1'], groupIds: ['grp'] })
    expect(result).toEqual({ approved: 0, failed: [{ id: '', description: 'Approval', error: 'Period Oct 2026 is closed. Contact Principal to reopen.' }] })
    expect(db.from).not.toHaveBeenCalled()
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('approveRequestGroupPartial', () => {
  const args = { groupId: 'grp', approveApprovalIds: ['p1'], rejectApprovalIds: ['p2'], approveNotes: '', rejectReason: 'Left in September' }

  it('answers ok once the batch is decided', async () => {
    const db = database([{ request_type: 'payment_voucher', submitted_by: 'carrie' }])
    await expect(approveRequestGroupPartial(args)).resolves.toEqual({ ok: true })
    expect(db.rpc).toHaveBeenCalledWith('approve_voucher_batch_partial', expect.objectContaining({ p_group_id: 'grp', p_approve_ids: ['p1'], p_reject_ids: ['p2'], p_reject_reason: 'Left in September' }))
  })

  it('a refusal by the database is said in words', async () => {
    database([{ request_type: 'payment_voucher', submitted_by: 'carrie' }], { message: 'Insufficient balance in Hong Leong' })
    await expect(approveRequestGroupPartial(args)).resolves.toEqual({ ok: false, reason: 'Partial batch approval failed: Insufficient balance in Hong Leong' })
  })

  it('somebody deciding what they raised is told why, before anything is written', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'carrie', name: 'Carrie', role: 'finance', permissions: ['treasury', 'approvals'] }))
    const db = database([{ request_type: 'payment_voucher', submitted_by: 'carrie' }])
    await expect(approveRequestGroupPartial(args)).resolves.toEqual({ ok: false, reason: 'You raised it — somebody else decides it' })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
