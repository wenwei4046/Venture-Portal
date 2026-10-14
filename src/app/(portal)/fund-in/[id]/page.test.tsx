import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// A fund source's full page (2026-10-15, the Finance revamp v2 — D06, the
// drawer's *View full page ↗*): *← Fund IN* and the crumb; *Fund in ·
// {type}*, the lender with its status (an active one maturing within 30 days
// says so), four facts, Print (its schedule); the numbered cards — Received
// from, the Repayment schedule (the payments folded under it), Repayment
// settings, Notes, Record repayment, the Trail, the Audit log — beside the dark
// panel: the amount, when and where, the booking, the steps this reader may take.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), push: vi.fn(), refresh: vi.fn(), flash: vi.fn(), withdraw: vi.fn(), requestCancel: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
vi.mock('@/lib/dept-registry', async (orig) => ({ ...(await orig<object>()), fetchDeptRegistry: async () => [] }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('../actions', () => ({
  cancelFundSource: vi.fn(),
  requestFundSourceCancel: mocks.requestCancel,
  withdrawFundSource: mocks.withdraw,
  setFundSourceRepaymentStart: vi.fn(),
  setFundSourceMinPayInterest: vi.fn(),
  setFundSourceNotes: vi.fn(),
}))
vi.mock('./_components/RecordRepaymentForm', () => ({ default: (p: { outstanding: number }) => <p data-testid="record">record against {p.outstanding}</p> }))

import FundSourcePage from './page'
import { setFundSourceRepaymentStart } from '../actions'

// HOUZS Century's deposit: 30,000 over 3 months at 1%, two installments in.
const SOURCE = {
  id: 'fs-1', source_type: 'subsidiary', status: 'active', amount: 30000, cost_rate: 0.01, lock_in_months: 3 as number | null, compound_interest: false,
  effective_date: '2026-07-15', repayment_start_month: null as string | null, terms_effective_from: null, repayment_date: '2026-08-15' as string | null, maturity_date: '2026-10-15' as string | null,
  from_company_id: 'co-hc', from_department_id: null, from_freetext_name: null, from_director_id: null, bank_account_id: 'b1', account_code: '4010',
  notes: 'lent to: 2990', min_pay_interest: false, created_by: 'u1', created_at: '2026-07-15T02:00:00Z', repaid_at: null as string | null, repaid_by: null as string | null,
}
const REPAYMENTS = [
  { id: 'r1', payment_date: '2026-08-15', payment_type: 'principal', amount: 10000, notes: null, payment_voucher_id: 'v1' },
  { id: 'r2', payment_date: '2026-08-15', payment_type: 'interest', amount: 300, notes: null, payment_voucher_id: 'v1' },
  { id: 'r3', payment_date: '2026-09-15', payment_type: 'principal', amount: 10000, notes: null, payment_voucher_id: 'v2' },
  { id: 'r4', payment_date: '2026-09-15', payment_type: 'interest', amount: 300, notes: 'September', payment_voucher_id: 'v2' },
]
const AUDIT: Record<string, unknown[]> = {
  'fund_sources:fs-1': [
    { id: 1, occurred_at: '2026-07-15T02:00:00Z', actor_id: 'u1', actor_name: 'Finance Manager', table_name: 'fund_sources', op: 'INSERT', old_row: null, new_row: { amount: 30000 }, changed: null },
    { id: 2, occurred_at: '2026-07-16T03:00:00Z', actor_id: 'u2', actor_name: 'Principal', table_name: 'fund_sources', op: 'UPDATE', old_row: { status: 'pending_approval' }, new_row: { status: 'active' }, changed: ['status'] },
  ],
}

function database(source = SOURCE, repayments = REPAYMENTS, approved: unknown = { approved_at: '2026-07-16T03:00:00Z', users: { name: 'Principal' } }) {
  const lists: Record<string, unknown[]> = {
    fund_source_repayments: repayments,
    payment_vouchers: [{ id: 'v1', voucher_no: 'HV-PV-202608-0011' }, { id: 'v2', voucher_no: 'HV-PV-202609-0022' }],
    bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '1234567890', current_balance: 50000 }],
    chart_of_accounts: [{ code: '4010' }],
    users: [{ id: 'u1', name: 'Finance Manager', email: 'fm@example.com' }],
  }
  const singles: Record<string, unknown> = {
    fund_sources: source,
    fund_source_outstanding: { outstanding: 10000, total_principal_paid: 20000, total_interest_paid: 600, total_interest_due: 900, monthly_payment: 10300 },
    companies: { name: 'HOUZS Century', short_code: 'HC' },
    bank_accounts: { bank_name: 'Hong Leong Bank', account_number: '1234567890' },
    chart_of_accounts: { code: '4010', name: 'Fund Sources Payable — HC' },
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: lists[table] ?? [], error: null }
      const filters: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'in', 'limit']) q[m] = () => q
      q.eq = (col: string, val: unknown) => {
        filters[col] = val
        return q
      }
      q.single = async () => ({ data: singles[table] ?? null, error: singles[table] ? null : { message: 'none' } })
      // The approval requests: the approved new_fund_source answers who received it; no cancellation is pending.
      q.maybeSingle = async () => ({ data: table === 'approval_requests' ? (filters.request_type === 'new_fund_source' ? approved : null) : (singles[table] ?? null), error: null })
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
    rpc: async (_name: string, args: { p_tables: string[]; p_row: string }) => ({ data: AUDIT[`${args.p_tables[0]}:${args.p_row}`] ?? [], error: null }),
  })
}

const page = (print?: string) => FundSourcePage({ params: Promise.resolve({ id: 'fs-1' }), searchParams: Promise.resolve({ print }) })
const cardTitles = () => Array.from(document.querySelectorAll('section[aria-label]')).map((c) => c.getAttribute('aria-label'))
const cardOf = (title: string) => screen.getByRole('region', { name: title })
const panel = () => document.querySelector('aside') as HTMLElement
const pill = () => screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', name: 'Finance Manager', permissions: ['treasury', 'override'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  database()
})

describe('a fund source’s full page', () => {
  it('heads as D06 does: the way back, the crumb, the lender with its status, four facts, Print', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: '← Fund IN' })).toHaveAttribute('href', '/fund-in')
    expect(screen.getByText('Fund · Fund IN · HOUZS Century')).toBeInTheDocument()
    expect(screen.getByText('Fund in · Subsidiary')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HOUZS Century')
    // Maturing within 30 days is waiting, the blue wait tone — as Fund IN's list says it.
    expect(pill()).toHaveTextContent('matures in 6d')
    expect(pill()).toHaveAttribute('data-tone', 'wait')
    for (const fact of ['RM 30,000.00', 'HOUZS Century (HC)', '15 Jul 2026', 'Finance Manager · 15 Jul 2026 · 10:00']) expect(screen.getAllByText(fact).length, fact).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
  })

  it('lays its cards out in order; the schedule replaces the history, the payments folded under it', async () => {
    render(await page())
    expect(cardTitles()).toEqual(['Received from', 'Repayment schedule', 'Repayment settings', 'Notes', 'Record repayment', 'Trail', 'Audit log'])
    for (const text of ['Subsidiary', '1.000% /mo', 'simple', '3 months', 'repaid in full by 15 Oct 2026']) expect(within(cardOf('Received from')).getByText(text), text).toBeInTheDocument()
    const schedule = cardOf('Repayment schedule')
    expect(schedule).toHaveTextContent('PAID 2 OF 3 · OUTSTANDING RM 10,300.00')
    const rows = schedule.querySelectorAll('table.sched-table tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Paid 15 Aug 2026 · HV-PV-202608-0011')
    expect(rows[2]).toHaveTextContent('15 Oct 2026')
    const fold = within(schedule).getByText('Repayments recorded · 4').closest('details') as HTMLElement
    expect(fold).toHaveTextContent('September')
    expect(screen.getByTestId('record')).toHaveTextContent('record against 10000')
  })

  it('draws the trail from its approval and the audit log from what was recorded', async () => {
    render(await page())
    const trail = cardOf('Trail')
    expect(trail).toHaveTextContent('2 / 2 steps')
    expect(within(trail).getByText('Received')).toBeInTheDocument()
    expect(trail).toHaveTextContent('Principal')
    const audit = cardOf('Audit log')
    expect(within(audit).getByText('Approved — received')).toBeInTheDocument()
    expect(within(audit).getByText('Created · RM 30,000.00')).toBeInTheDocument()
  })

  it('sums it up in the dark panel — the bank and account it is routed by — with Amend terms and Request cancellation', async () => {
    mocks.requestCancel.mockResolvedValue(undefined)
    render(await page())
    const p = panel()
    expect(p).toHaveTextContent('+RM 30,000.00')
    expect(p).toHaveTextContent('From HOUZS Century (HC)')
    for (const text of ['15 Aug 2026', '15 Oct 2026', 'Hong Leong Bank', '1234567890', 'Fund Sources Payable — HC', '4010', '1.000% /mo', 'RM 300.00 a month', 'RM 10,300.00', 'RM 10,000.00', 'RM 20,000.00 repaid']) {
      expect(within(p).getAllByText(text).length, text).toBeGreaterThan(0)
    }
    expect(within(p).getByRole('link', { name: 'Amend terms' })).toHaveAttribute('href', '/fund-in/fs-1/edit')
    fireEvent.click(within(p).getByRole('button', { name: 'Request cancellation' }))
    const ask = screen.getByRole('dialog', { name: 'Request the cancellation of the fund source from HOUZS Century?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Request cancellation' }))
    })
    expect(mocks.requestCancel).toHaveBeenCalledWith('fs-1', '')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('opens the print sheet straight away for the list’s Print schedule', async () => {
    render(await page('1'))
    const sheet = screen.getByRole('dialog', { name: 'Repayment Schedule · HOUZS Century' })
    expect(sheet).toHaveTextContent('FUND IN · SUBSIDIARY')
    expect(sheet).toHaveTextContent('Printed 09 Oct 2026 · Finance Manager')
  })

  it('says when it was repaid in the trail, and offers a pending one Edit and Withdraw', async () => {
    database({ ...SOURCE, status: 'repaid', repaid_at: '2026-10-01T02:00:00Z', repaid_by: 'u1' })
    const { unmount } = render(await page())
    expect(pill()).toHaveAttribute('data-tone', 'info')
    const trail = cardOf('Trail')
    expect(within(trail).getByText('Repaid')).toBeInTheDocument()
    expect(trail).toHaveTextContent('01 Oct 2026 · 10:00')
    unmount()
    database({ ...SOURCE, status: 'pending_approval' }, [], null)
    mocks.withdraw.mockResolvedValue(undefined)
    render(await page())
    expect(within(panel()).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/fund-in/fs-1/edit')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Withdraw' }))
    const ask = screen.getByRole('dialog', { name: 'Withdraw the fund source from HOUZS Century?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Withdraw' }))
    })
    expect(mocks.withdraw).toHaveBeenCalledWith('fs-1')
    expect(mocks.push).toHaveBeenCalledWith('/fund-in')
  })
})

// 2026-10-12 (user: 现在只能选月份不能选日期 → expected repayment 和 repayment
// start date 应该要一样): Repayment starts is a date — the Expected repayment
// is that date, and the schedule's instalments fall on its day.
describe('a fund source’s repayment start, a date', () => {
  // Carres' 30,000 at 2% with no fixed term from 14 Sep, its start picked as 7 Oct.
  const CARRES = {
    ...SOURCE, amount: 30000, cost_rate: 0.02, lock_in_months: null, effective_date: '2026-09-14',
    repayment_start_month: '2026-10-01', repayment_date: '2026-10-07', maturity_date: '2026-10-07',
  }
  const field = () => screen.getByLabelText('Repayment starts')
  const scheduleRows = () => cardOf('Repayment schedule').querySelectorAll('table.sched-table tbody tr')
  const firstRepayment = () => within(panel()).getByText('First repayment').nextElementSibling as HTMLElement

  it('shows the date picked as the first repayment, in the field and on the schedule', async () => {
    database(CARRES, [])
    render(await page())
    expect(firstRepayment()).toHaveTextContent('07 Oct 2026')
    expect(field()).toHaveAttribute('type', 'date')
    expect(field()).toHaveValue('2026-10-07')
    expect(scheduleRows()[0]).toHaveTextContent('7 Oct 2026')
  })

  it('unset, is the month after the effective date on its day', async () => {
    database({ ...SOURCE, repayment_date: null, repayment_start_month: null }, [])
    render(await page())
    expect(firstRepayment()).toHaveTextContent('15 Aug 2026')
    expect(field()).toHaveValue('')
    // 2026-10-12 (the user: descriptions clutter the view) — no sentence under the field.
    expect(screen.queryByText(/Unset, it is/)).toBeNull()
  })

  it('reads a month set before dates could be picked as that month on the effective date’s day', async () => {
    database({ ...SOURCE, repayment_date: null, repayment_start_month: '2026-09-01' }, [])
    render(await page())
    expect(field()).toHaveValue('2026-09-15')
    expect(firstRepayment()).toHaveTextContent('15 Sep 2026')
    expect(scheduleRows()[0]).toHaveTextContent('15 Sep 2026')
  })

  it('saves the date picked', async () => {
    vi.mocked(setFundSourceRepaymentStart).mockResolvedValue(undefined)
    database(CARRES, [])
    render(await page())
    fireEvent.change(field(), { target: { value: '2026-10-14' } })
    fireEvent.click(within(field().closest('.fin-field') as HTMLElement).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setFundSourceRepaymentStart).toHaveBeenCalledWith('fs-1', '2026-10-14'))
  })
})

describe('where a fund source page returns to (2026-10-09, the handoff)', () => {
  it('goes back to the Overview it was opened from', async () => {
    render(await FundSourcePage({ params: Promise.resolve({ id: 'fs-1' }), searchParams: Promise.resolve({ from: 'overview' }) }))
    expect(screen.getByRole('link', { name: '← Overview' })).toHaveAttribute('href', '/dashboard')
  })
  it('goes back to the calendar, on its month', async () => {
    render(await FundSourcePage({ params: Promise.resolve({ id: 'fs-1' }), searchParams: Promise.resolve({ from: 'calendar', month: '2026-11' }) }))
    expect(screen.getByRole('link', { name: '← Calendar' })).toHaveAttribute('href', '/repayment-schedule?month=2026-11')
  })
})
