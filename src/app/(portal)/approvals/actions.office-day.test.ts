import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-08: a loan recorded without a start date is paid out — and its GL
// posted — on "today". Today was the date of the UTC ISO string, so a loan
// approved at 00:30 on 1 November in the office was paid on 31 October and
// its disbursement posted into October.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission, requireApprover: mocks.requirePermission, requireApprovalQueue: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/slack', () => ({ notifyApprovalDecision: vi.fn(async () => undefined), notifyNewApproval: vi.fn(async () => undefined) }))
vi.mock('@/lib/loans-coa', () => ({ resolveLoansReceivableLeaf: vi.fn(async () => '3051') }))

import { approveRequestGroup } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'principal', name: 'Principal', role: 'principal', permissions: ['approvals'] }))
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('a loan approved after midnight, recorded without a start date', () => {
  it("is paid out and posted on the office's day", async () => {
    const db = recordingSupabase(
      (call: RecordedCall) => {
        if (call.table === 'approval_requests' && call.op === 'select') {
          return {
            data: [
              { id: 'ln', request_type: 'new_loan', reference_id: 'loan-1', description: 'New loan to 2990', group_id: 'grp', status: 'pending' },
              { id: 'pv', request_type: 'payment_voucher', reference_id: 'pv-1', description: 'HV-PV-202611-0475: Loan disbursement', group_id: 'grp', status: 'pending' },
            ],
          }
        }
        if (call.table === 'loans' && call.single) return { data: { disbursement_date: null } }
        if (call.table === 'payment_vouchers' && call.single) return { data: { id: 'pv-1', amount: 40000, bank_account_id: 'bank-1', voucher_no: 'HV-PV-202611-0475', description: 'Loan disbursement' } }
        if (call.table === 'bank_accounts' && call.single) return { data: { id: 'bank-1', current_balance: 100000, bank_name: 'Hong Leong', gl_account_code: '3000' } }
        return {}
      },
      (fn) => (fn === 'post_journal_entry_as_caller' ? { data: 'je-1' } : {}),
    )
    mocks.createClient.mockResolvedValue(db.client)
    const form = new FormData()
    form.set('group_id', 'grp')
    await expect(inTimeZoneAsync('UTC', () => approveRequestGroup(form))).rejects.toThrow('NEXT_REDIRECT')
    expect(db.writes('payment_vouchers')[0].values).toMatchObject({ status: 'paid', payment_date: '2026-11-01' })
    expect(db.rpcs.find((r) => r.fn === 'post_journal_entry_as_caller')?.args).toMatchObject({ p_transaction_date: '2026-11-01' })
  })
})
