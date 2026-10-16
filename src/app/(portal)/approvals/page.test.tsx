import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen } from '@testing-library/react'
import { inTimeZoneAsync } from '@/test/time-zone'
import type { ApprovalHub } from './_lib/hub-model'

// 2026-10-17 — Approvals as Finance's hub (the user, on the Principal's own view taking Finance's view: "make sure
// the approve tab is fullfill as well"): the total that waits over three cards, the waiting and the decided as the
// hub's lists. What the page sends the hub is printed and read here as the browser would get it.

const mocks = vi.hoisted(() => ({
  requireApprovalQueue: vi.fn(),
  createClient: vi.fn(),
  resolveLiveApprovalAmounts: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireApprovalQueue: mocks.requireApprovalQueue }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/approval-amounts', () => ({ resolveLiveApprovalAmounts: mocks.resolveLiveApprovalAmounts }))
vi.mock('./_components/ApprovalsHub', () => ({
  default: (p: { hub: ApprovalHub; initialCard: string; initialOpen: string | null; canSetDefault: boolean }) => (
    <pre data-testid="hub" data-card={p.initialCard} data-open={p.initialOpen ?? ''} data-can-set-default={String(p.canSetDefault)}>
      {JSON.stringify(p.hub)}
    </pre>
  ),
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
const DECIDED = [
  { ...base, id: 'r1', description: 'HV-PV-202610-0463: Payroll bank transfer — Sep 2026', amount: 105519.29, reference_id: 'v463', status: 'approved', created_at: at(5, 12), approved_at: at(5, 14) },
  { ...base, id: 'r2', description: 'HV-PV-202610-0448: Hostel & Accommodation', amount: 3450, reference_id: 'v448', status: 'rejected', submitted_by: 'ex', created_at: at(2, 9), approved_at: at(4, 9) },
]
const VOUCHERS = [
  { id: 'v449', payee_name: 'HOUZS Century', payment_method: 'bank_transfer', bank_account_id: 'bank1' },
  { id: 'v471', payee_name: 'Landlord Sdn Bhd', payment_method: 'bank_transfer', bank_account_id: 'bank1' },
  { id: 'v475', payee_name: 'Company 2990', payment_method: 'netting', bank_account_id: null },
  { id: 'v463', payee_name: 'HOUZS Venture — Payroll', payment_method: 'bank_transfer', bank_account_id: 'bank1' },
  { id: 'v448', payee_name: 'Hostel Sdn Bhd', payment_method: 'bank_transfer', bank_account_id: 'bank1' },
]

type Filter = [string, string, unknown]
function database(pending = PENDING) {
  const from = vi.fn((table: string) => {
    const filters: Filter[] = []
    const result = () => {
      const has = (f: string, col: string, val?: unknown) => filters.some(([ff, c, v]) => ff === f && c === col && (val === undefined || v === val))
      const inList = (col: string) => (filters.find(([f, c]) => f === 'in' && c === col)?.[2] as string[] | undefined) ?? null
      if (table === 'approval_requests') {
        if (has('eq', 'status', 'pending')) return { data: pending, error: null }
        if (has('neq', 'status', 'pending') && has('gte', 'approved_at')) return { data: DECIDED, error: null }
        return { data: [], error: null }
      }
      if (table === 'users') {
        const people = [{ id: 'fm', name: 'Finance Manager' }, { id: 'ex', name: 'ONG MEI SHUANG' }, { id: 'p', name: 'Principal' }]
        const ids = inList('id')
        return { data: ids ? people.filter((u) => ids.includes(u.id)) : people, error: null }
      }
      if (table === 'hr_staff_costs') return { data: [{ user_id: 'ex', title_id: 'T-acc' }], error: null }
      if (table === 'titles') return { data: [{ id: 'T-acc', level_id: 'L3' }], error: null }
      if (table === 'title_levels') return { data: [{ id: 'L3', name: 'Executive', rank: 3 }, { id: 'L6', name: 'Manager', rank: 6 }], error: null }
      if (table === 'payment_vouchers') {
        const ids = inList('id') ?? []
        return { data: VOUCHERS.filter((v) => ids.includes(v.id)), error: null }
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
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push(['eq', col, val]), q),
      neq: (col: string, val: unknown) => (filters.push(['neq', col, val]), q),
      gte: (col: string, val: unknown) => (filters.push(['gte', col, val]), q),
      in: (col: string, val: unknown) => (filters.push(['in', col, val]), q),
      order: () => q,
      range: () => q,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from }
}

const page = (params: Record<string, string> = {}) => ApprovalsPage({ searchParams: Promise.resolve(params) })
const sent = () => JSON.parse(screen.getByTestId('hub').textContent ?? '{}') as ApprovalHub

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: new Date(2026, 9, 7, 15, 0, 0), toFake: ['Date'] })
  mocks.requireApprovalQueue.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['approvals'] }))
  mocks.resolveLiveApprovalAmounts.mockResolvedValue(new Map())
})
afterEach(() => vi.useRealTimers())

describe('the Approvals hub', () => {
  it('opens on the total that waits, the oldest wait, and a card per list: pending, the executive’s, the 30 days decided', async () => {
    database()
    render(await page())
    const hub = sent()
    expect(hub.hero).toEqual({ value: 'RM 57,800.00', label: 'Pending · to approve', chip: { text: 'Oldest waiting · 5 days', tone: 'alert' } }) // the loan and its voucher counted once
    expect(hub.cards.map((c) => [c.key, c.label, c.sub, c.value])).toEqual([
      ['pending', 'Pending', '3 items · 1 combined', 'RM 57,800.00'],
      ['exec', 'Submitted by the executive', '1 of the 3', 'RM 6,000.00'],
      ['decided', 'Decided · 30 days', '1 approved · 1 rejected', '2'],
    ])
  })

  it('sends each waiting row who is paid, its kind, the pool and category, how it is paid and its files', async () => {
    database()
    render(await page())
    const { pending } = sent()
    expect(pending.map((r) => r.key)).toEqual(['a', 'b', 'g:grp'])
    expect(pending[0]).toMatchObject({ name: 'HOUZS Century', title: 'Loan Repayment - 5rd Installment', type: 'Payment voucher', pool: 'Director Pool', category: 'Loans receivable', payBy: 'Bank transfer · Maybank', files: 0, why: null })
    expect(pending[1]).toMatchObject({ name: 'Landlord Sdn Bhd', no: 'HV-PV-202610-0471', pool: 'Venture Pool', category: 'Office Rental', files: 2, executive: true, sentBy: 'ONG MEI SHUANG' })
    expect(pending[1].at).toBe(at(6, 11, 20))
    // A combined approval: who its vouchers pay, and its kind in the queue's words.
    expect(pending[2]).toMatchObject({ kind: 'group', name: 'Company 2990', type: 'New loan + PV', payBy: 'Netting' })
    expect(pending[2].members.map((m) => m.id)).toEqual(['c', 'd'])
    expect(screen.getByTestId('hub')).toHaveAttribute('data-can-set-default', 'true')
  })

  it('sends the 30 days decided, each with who it paid and when it was decided', async () => {
    database()
    render(await page())
    const { decided } = sent()
    expect(decided.map((r) => [r.key, r.decision, r.name, r.type, r.at])).toEqual([
      ['r1', 'approved', 'HOUZS Venture — Payroll', 'Payment voucher', at(5, 14)],
      ['r2', 'rejected', 'Hostel Sdn Bhd', 'Payment voucher', at(4, 9)],
    ])
  })

  it('opens the card the address names, and a combined approval’s drawer from ?group_id=', async () => {
    database()
    render(await page({ card: 'decided', group_id: 'grp' }))
    expect(screen.getByTestId('hub')).toHaveAttribute('data-card', 'decided')
    expect(screen.getByTestId('hub')).toHaveAttribute('data-open', 'g:grp')
  })

  it('opens on Pending for a card it does not know', async () => {
    database()
    render(await page({ card: 'everything' }))
    expect(screen.getByTestId('hub')).toHaveAttribute('data-card', 'pending')
    expect(screen.getByTestId('hub')).toHaveAttribute('data-open', '')
  })

  it('only asks about the staff titles of the people who submitted, and only about the vouchers that wait or were decided', async () => {
    const { from } = database()
    render(await page())
    expect(from).toHaveBeenCalledWith('hr_staff_costs')
    expect(from).toHaveBeenCalledWith('payment_voucher_sources')
    expect(from).not.toHaveBeenCalledWith('hr_monthly_payroll')
  })

  it('reads the live amount through to the voucher', async () => {
    database()
    mocks.resolveLiveApprovalAmounts.mockResolvedValue(new Map([['a', 11000]]))
    render(await page())
    expect(sent().hero.value).toBe('RM 57,000.00')
    expect(sent().pending[0]).toMatchObject({ amount: 11000 })
  })

  it('lets only Finance and the Principal set the table’s default for everybody', async () => {
    database()
    mocks.requireApprovalQueue.mockResolvedValue(withActions({ id: 'h', role: 'hr', permissions: ['approvals'] }))
    render(await page())
    expect(screen.getByTestId('hub')).toHaveAttribute('data-can-set-default', 'false')
  })
})

// 2026-10-08: the page is drawn on the server, which keeps UTC. A voucher sent
// at 00:30 in the office (16:30 UTC the day before) had waited a day longer
// than it had.
describe('the oldest wait, on the office clock', () => {
  it('counts office days, drawn as the server would', async () => {
    database([{ ...PENDING[0], created_at: '2026-10-02T16:30:00Z' }]) // 00:30 on 3 Oct in the office
    vi.setSystemTime(new Date('2026-10-07T01:00:00Z')) // 09:00 on 7 Oct in the office
    render(await inTimeZoneAsync('UTC', () => page()))
    expect(sent().hero.chip).toEqual({ text: 'Oldest waiting · 4 days', tone: 'alert' })
  })
})
