import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { inTimeZoneAsync } from '@/test/time-zone'

// 2026-10-07 — Approvals on the sheet (the user approved the sample):
// four summary cards over the queue, the queue and the recent decisions as
// tables. What the page sends the two client tables is printed and read here
// as the browser would get it.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  resolveLiveApprovalAmounts: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/approval-amounts', () => ({ resolveLiveApprovalAmounts: mocks.resolveLiveApprovalAmounts }))
vi.mock('./_components/PendingApprovals', () => ({
  default: (p: { rows: unknown[]; canSetDefault?: boolean }) => (
    <pre data-testid="queue" data-can-set-default={String(!!p.canSetDefault)}>{JSON.stringify(p.rows)}</pre>
  ),
}))
vi.mock('./_components/RecentDecisions', () => ({
  default: (p: { rows: unknown[] }) => <pre data-testid="recent">{JSON.stringify(p.rows)}</pre>,
}))

import ApprovalsPage from './page'

const at = (day: number, hour = 10, minute = 0) => new Date(2026, 9, day, hour, minute, 0).toISOString()
const base = { amount: null as number | null, reference_id: null as string | null, reference_table: 'payment_vouchers', submitted_by: 'fm', group_id: null as string | null, approved_at: null as string | null, status: 'pending', request_type: 'payment_voucher' }
const PENDING = [
  { ...base, id: 'a', description: 'HV-PV-202610-0449: Loan Repayment - 5rd Installment', amount: 11800, reference_id: 'v449', created_at: at(2, 10, 12) },
  { ...base, id: 'b', description: "HV-PV-202610-0471: Office Rental- E2803A - Oct'26", amount: 6000, reference_id: 'v471', submitted_by: 'ex', created_at: at(6, 11, 20) },
  { ...base, id: 'c', description: 'HV-PV-202610-0475: Loan disbursement to 2990', amount: 40000, reference_id: 'v475', group_id: 'grp', created_at: at(7, 9, 31) },
  { ...base, id: 'd', request_type: 'new_loan', description: 'New loan to 2990', amount: 40000, reference_id: 'loan1', reference_table: 'loans', group_id: 'grp', created_at: at(7, 9, 31) },
]
const RECENT = [
  { ...base, id: 'r1', description: 'HV-PV-202610-0463: Payroll bank transfer — Sep 2026', amount: 105519.29, reference_id: 'v463', status: 'approved', created_at: at(5, 12), approved_at: at(5, 14) },
  { ...base, id: 'r2', description: 'HV-PV-202610-0448: Hostel & Accommodation', amount: 3450, reference_id: 'v448', status: 'rejected', submitted_by: 'ex', created_at: at(2, 9), approved_at: at(4, 9) },
]

type Filter = [string, string, unknown]
function database(pending = PENDING) {
  const from = vi.fn((table: string) => {
    const filters: Filter[] = []
    let head = false
    let limit: number | null = null
    const result = () => {
      const has = (f: string, col: string, val?: unknown) => filters.some(([ff, c, v]) => ff === f && c === col && (val === undefined || v === val))
      if (table === 'approval_requests') {
        if (head) return { data: null, error: null, count: has('eq', 'status', 'approved') ? 93 : 9 }
        if (has('eq', 'status', 'pending')) return { data: pending, error: null }
        return { data: limit ? RECENT.slice(0, limit) : RECENT, error: null }
      }
      if (table === 'users') return { data: [{ id: 'fm', name: 'Finance Manager' }, { id: 'ex', name: 'ONG MEI SHUANG' }, { id: 'p', name: 'Principal' }], error: null }
      if (table === 'hr_staff_costs') return { data: [{ user_id: 'ex', title_id: 'T-acc' }], error: null }
      if (table === 'titles') return { data: [{ id: 'T-acc', level_id: 'L3' }], error: null }
      if (table === 'title_levels') return { data: [{ id: 'L3', name: 'Executive', rank: 3 }, { id: 'L6', name: 'Manager', rank: 6 }], error: null }
      if (table === 'payment_vouchers') {
        return {
          data: [
            { id: 'v449', payee_name: 'HOUZS Century', payment_method: 'bank_transfer', bank_account_id: 'bank1' },
            { id: 'v471', payee_name: 'Landlord Sdn Bhd', payment_method: 'bank_transfer', bank_account_id: 'bank1' },
            { id: 'v475', payee_name: 'Company 2990', payment_method: 'netting', bank_account_id: null },
          ],
          error: null,
        }
      }
      if (table === 'bank_accounts') return { data: [{ id: 'bank1', bank_name: 'Maybank' }], error: null }
      if (table === 'payment_attachments') {
        return {
          data: [
            { id: 'att1', voucher_id: 'v471', file_name: 'tenancy-oct.pdf', file_type: 'application/pdf' },
            { id: 'att2', voucher_id: 'v471', file_name: 'receipt.jpg', file_type: 'image/jpeg' },
          ],
          error: null,
        }
      }
      if (table === 'payment_voucher_sources') {
        return {
          data: [
            { voucher_id: 'v471', pool: 'venture_pool', amount: 6000, account_code: '6100', chart_of_accounts: { name: 'Office Rental' } },
            { voucher_id: 'v449', pool: 'dept_pool_director', amount: 11800, account_code: '3051', chart_of_accounts: { name: 'Loans receivable' } },
            { voucher_id: 'v475', pool: 'venture_pool', amount: 40000, account_code: '3053', chart_of_accounts: { name: 'Loans receivable' } },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    }
    const q = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) head = true
        return q
      },
      eq: (col: string, val: unknown) => (filters.push(['eq', col, val]), q),
      neq: (col: string, val: unknown) => (filters.push(['neq', col, val]), q),
      gte: (col: string, val: unknown) => (filters.push(['gte', col, val]), q),
      in: (col: string, val: unknown) => (filters.push(['in', col, val]), q),
      not: (col: string, op: string, val: unknown) => (filters.push(['not', col, `${op}:${val}`]), q),
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from }
}

const card = (name: string) => screen.getByRole('group', { name })
const sent = () => JSON.parse(screen.getByTestId('queue').textContent ?? '[]') as Array<Record<string, unknown>>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: new Date(2026, 9, 7, 15, 0, 0), toFake: ['Date'] })
  mocks.requirePermission.mockResolvedValue({ id: 'p', role: 'principal', permissions: ['approvals'] })
  mocks.resolveLiveApprovalAmounts.mockResolvedValue(new Map())
})
afterEach(() => vi.useRealTimers())

describe('the Approvals page on the sheet', () => {
  it('opens on four cards: what is waiting as the primary, the oldest wait, the executive’s share, the month’s decisions', async () => {
    database()
    render(await ApprovalsPage())
    expect(card('Pending · to approve')).toHaveAttribute('data-tone', 'primary')
    expect(card('Pending · to approve')).toHaveTextContent('RM 57,800.00') // the loan and its voucher counted once
    expect(card('Pending · to approve')).toHaveTextContent('3 items · 1 combined')
    expect(card('Oldest waiting')).toHaveTextContent('5 days')
    expect(card('Oldest waiting')).toHaveAttribute('data-tone', 'alert')
    expect(card('Oldest waiting')).toHaveTextContent('HV-PV-202610-0449 · since 2 Oct')
    expect(card('Submitted by the executive')).toHaveTextContent('RM 6,000.00')
    expect(card('Submitted by the executive')).toHaveTextContent('1 of the 3 · ONG MEI SHUANG')
    expect(card('Decided · 30 days')).toHaveTextContent('102')
    expect(card('Decided · 30 days')).toHaveTextContent('93 approved · 9 rejected')
  })

  it('sends the queue its rows with the pool and category behind each voucher, and lets the Principal set the table’s default', async () => {
    database()
    render(await ApprovalsPage())
    expect(sent().map((r) => r.key)).toEqual(['a', 'b', 'g:grp'])
    expect(sent()[1]).toMatchObject({ pool: 'Venture Pool', category: 'Office Rental', submitterName: 'ONG MEI SHUANG' })
    expect(sent()[0]).toMatchObject({ pool: 'Director Pool', category: 'Loans receivable' })
    // What the phone's panel shows of the voucher itself (user picked B, 2026-10-07):
    // who is paid, how, and the files attached.
    expect(sent()[1]).toMatchObject({
      payee: 'Landlord Sdn Bhd',
      payBy: 'Bank transfer · Maybank',
      attachments: [
        { id: 'att1', fileName: 'tenancy-oct.pdf', fileType: 'application/pdf' },
        { id: 'att2', fileName: 'receipt.jpg', fileType: 'image/jpeg' },
      ],
    })
    expect(sent()[0]).toMatchObject({ payee: 'HOUZS Century', payBy: 'Bank transfer · Maybank', attachments: [] })
    expect(sent()[2]).toMatchObject({ payee: 'Company 2990', payBy: 'Netting', attachments: [] })
    expect(screen.getByTestId('queue')).toHaveAttribute('data-can-set-default', 'true')
    const recent = JSON.parse(screen.getByTestId('recent').textContent ?? '[]') as Array<Record<string, unknown>>
    expect(recent.map((r) => [r.id, r.decision, r.submitterName])).toEqual([
      ['r1', 'approved', 'Finance Manager'],
      ['r2', 'rejected', 'ONG MEI SHUANG'],
    ])
  })

  it('only asks about the staff titles of the people who submitted, and only about the vouchers that wait', async () => {
    const { from } = database()
    render(await ApprovalsPage())
    expect(from).toHaveBeenCalledWith('hr_staff_costs')
    expect(from).toHaveBeenCalledWith('payment_voucher_sources')
    expect(from).not.toHaveBeenCalledWith('hr_monthly_payroll')
  })

  it('keeps its head and reads the live amount through to the voucher', async () => {
    database()
    mocks.resolveLiveApprovalAmounts.mockResolvedValue(new Map([['a', 11000]]))
    render(await ApprovalsPage())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Approvals')
    expect(card('Pending · to approve')).toHaveTextContent('RM 57,000.00')
    expect(sent()[0]).toMatchObject({ amount: 11000 })
  })
})

// 2026-10-08: the page is drawn on the server, which keeps UTC. A voucher sent
// at 00:30 in the office (16:30 UTC the day before) read "since 2 Oct" and had
// waited a day longer than it had.
describe('the oldest wait, on the office clock', () => {
  it('names the office day it was sent and counts office days, drawn as the server would', async () => {
    database([{ ...PENDING[0], created_at: '2026-10-02T16:30:00Z' }]) // 00:30 on 3 Oct in the office
    vi.setSystemTime(new Date('2026-10-07T01:00:00Z')) // 09:00 on 7 Oct in the office
    const page = await inTimeZoneAsync('UTC', () => ApprovalsPage())
    render(page)
    expect(card('Oldest waiting')).toHaveTextContent('4 days')
    expect(card('Oldest waiting')).toHaveTextContent('HV-PV-202610-0449 · since 3 Oct')
  })
})
