import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Overdue & Netting per the user's Claude Design handoff (Phase 3
// of the Finance revamp): two tabs — Fund OUT, what they owe us (the overdue
// records Detect overdue writes), and Fund IN, what we owe (installments of a
// fund source whose day has passed unpaid, from its repayment plan) — four
// cards each, the overdue by month with status chips, and the netting &
// penalty log.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
vi.mock('./actions', () => ({ markOverduePaid: vi.fn(), detectOverdue: vi.fn(), escalateOverdue: vi.fn() }))
vi.mock('./_components/EscalateButton', () => ({ default: () => <button type="button">Escalate</button> }))

import OverduePage from './page'

const record = (id: string, loan_id: string, period_month: string, overdue_days: number, overdue_stage: string | null, penalty_amount: number, status = 'pending') => ({
  id, loan_id, period_month, overdue_days, overdue_stage, is_overdue: true, penalty_rate: 0.01, penalty_amount, status, created_at: `${period_month}T02:00:00Z`,
})

function database(over: Record<string, unknown[]> = {}) {
  const tables: Record<string, unknown[]> = {
    overdue_records: [
      record('o1', 'l1', '2026-09-01', 47, 'escalation', 3672.4),
      record('o2', 'l2', '2026-09-01', 12, 'late_1', 214.6),
      record('o3', 'l3', '2026-10-01', 4, 'grace', 0),
      record('o4', 'l4', '2026-08-01', 9, null, 412.3, 'paid'),
    ],
    loans: [
      { id: 'l1', company_id: 'co-hd', principal: 400000, effective_rate: 0.02, status: 'active' },
      { id: 'l2', company_id: 'co-hk', principal: 20000, effective_rate: 0.02, status: 'active' },
      { id: 'l3', company_id: 'co-ht', principal: 8000, effective_rate: 0.02, status: 'active' },
      { id: 'l4', company_id: 'co-hb', principal: 8000, effective_rate: 0.02, status: 'active' },
    ],
    companies: [
      { id: 'co-hd', name: 'HOUZS Design', short_code: 'HD' }, { id: 'co-hk', name: 'HOUZS Kitchen', short_code: 'HK' },
      { id: 'co-ht', name: 'HOUZS Trading', short_code: 'HT' }, { id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' },
    ],
    loan_outstanding: [{ loan_id: 'l1', outstanding: 312500 }, { loan_id: 'l2', outstanding: 18250 }, { loan_id: 'l3', outstanding: 6400 }],
    repayments: [{ loan_id: 'l4', amount: 24800, payment_type: 'netting', payment_date: '2026-10-03' }],
    // A director's 12,000 over 3 months from August; nothing paid since.
    fund_sources: [
      {
        id: 'fs1', status: 'active', amount: 12000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-07-15',
        repayment_start_month: null, terms_effective_from: null, from_company_id: null, from_department_id: null, from_freetext_name: 'Tan S.H.',
      },
    ],
    fund_source_repayments: [{ fund_source_id: 'fs1', amount: 4000, payment_date: '2026-08-15', payment_type: 'principal' }, { fund_source_id: 'fs1', amount: 120, payment_date: '2026-08-15', payment_type: 'interest' }],
    departments: [],
    ...over,
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      let rows = (tables[table] ?? []) as Array<Record<string, unknown>>
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'range']) q[m] = () => q
      // A read by a list (fund sources by status or by id) answers only those rows.
      q.in = (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q)
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej)
      return q
    },
  })
}

const page = (tab?: string) => OverduePage({ searchParams: Promise.resolve({ tab }) })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('Overdue & Netting on the sheet', () => {
  it('shows what they owe us: four cards, the overdue by month with chips, the log', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · OVERDUE & NETTING')
    expect(screen.getByRole('button', { name: /^Fund OUT · they owe us/ }).querySelector('[data-tab-count]')).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /^Fund IN · we owe/ }).querySelector('[data-tab-count]')).toHaveTextContent('1')
    expect(card('Overdue outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('Overdue outstanding')).toHaveTextContent('RM 337,150.00')
    expect(card('Overdue outstanding')).toHaveTextContent('3 companies')
    expect(card('Penalty accrued')).toHaveAttribute('data-tone', 'danger')
    expect(card('Penalty accrued')).toHaveTextContent('RM 3,887.00')
    expect(card('Longest overdue')).toHaveTextContent('47 days')
    expect(card('Longest overdue')).toHaveTextContent('HOUZS Design')
    expect(card('Netted this month')).toHaveTextContent('RM 24,800.00')
    expect(card('Netted this month')).toHaveTextContent('1 netting')

    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual(['October 2026', 'September 2026', 'Netting & penalty log'])
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const hd = within(september).getByText('HOUZS Design').closest('tr') as HTMLElement
    expect(within(hd).getByText('escalated').closest('.chip')).toHaveClass('danger')
    expect(within(hd).getByRole('button', { name: 'Escalate' })).toBeInTheDocument()
    expect(within(within(september).getByText('HOUZS Kitchen').closest('tr') as HTMLElement).getByText('overdue').closest('.chip')).toHaveClass('alert')
    const log = screen.getByRole('heading', { name: 'Netting & penalty log' }).closest('section') as HTMLElement
    expect(within(log).getByText('HOUZS Bedding')).toBeInTheDocument()
    expect(within(log).getByText('netting').closest('.chip')).toHaveClass('ledger')
  })

  it('shows what we owe: a fund source’s installments passed unpaid', async () => {
    render(await page('in'))
    expect(card('Overdue outstanding')).toHaveTextContent('RM 4,120.00') // the September installment: 4,000 + 120
    expect(card('Overdue outstanding')).toHaveTextContent('1 fund source · we owe')
    expect(card('Penalty accrued')).toHaveTextContent('No penalty on fund sources')
    expect(card('Longest overdue')).toHaveTextContent('24 days')
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const row = within(september).getByText('Tan S.H.').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('RM 4,120.00')
    expect(row).toHaveTextContent('Instalment 2 of 3')
    expect(within(row).getByRole('link', { name: 'Record payment' })).toHaveAttribute('href', '/fund-in/fs1')
  })
})

// 2026-10-10 — the handoff, more closely: the cards come before the tabs;
// every month's table closes on its total; Net off on a loan they owe us (its
// Record repayment, where Netting is a type); the netting log always shows;
// on a phone a row opens onto its status, penalty or note, and its actions;
// Detect overdue is the head's primary button, Escalate a bordered one.
describe('Overdue & Netting, per the handoff', () => {
  it('puts the cards before the tabs, and Detect overdue in the head’s primary button', async () => {
    render(await page())
    const cards = screen.getByRole('region', { name: 'Overdue · Fund OUT' })
    const tabs = screen.getByRole('button', { name: /^Fund OUT · they owe us/ })
    expect(cards.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Detect overdue' })).toHaveClass('btn-pri-sheet')
  })

  it('closes every month on its total, a single loan’s too', async () => {
    render(await page())
    const october = screen.getByRole('heading', { name: 'October 2026' }).closest('section') as HTMLElement
    expect(october.querySelector('tfoot')).toHaveTextContent('RM 6,400.00')
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const foot = september.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('Total')
    expect(foot).toHaveTextContent('RM 330,750.00')
    expect(foot).toHaveTextContent('RM (3,887.00)')
  })

  it('closes a month of what we owe on its total too', async () => {
    render(await page('in'))
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    expect(september.querySelector('tfoot')).toHaveTextContent('RM 4,120.00')
  })

  it('offers Net off on a loan they owe us — its Record repayment', async () => {
    render(await page())
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const hk = within(september).getByText('HOUZS Kitchen').closest('tr') as HTMLElement
    expect(within(hk).getByRole('link', { name: 'Net off' })).toHaveAttribute('href', '/fund-out/l2#repayment-form')
    expect(within(hk).getByRole('button', { name: 'Mark paid' })).toHaveClass('sch-row-btn')
  })

  it('on a phone, opens a row onto its status, penalty and actions', async () => {
    render(await page())
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const hk = within(september).getByText('HOUZS Kitchen').closest('tr') as HTMLElement
    fireEvent.click(within(hk).getByRole('button', { name: '展开明细' }))
    const panel = hk.nextElementSibling as HTMLElement
    expect(panel).toHaveClass('lt-detail')
    expect(panel).toHaveTextContent('Status')
    expect(panel).toHaveTextContent('overdue')
    expect(panel).toHaveTextContent('Penalty')
    expect(within(panel).getByRole('button', { name: 'Mark paid' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Net off' })).toBeInTheDocument()
  })

  it('always shows the netting log, even with nothing in the last 30 days', async () => {
    database({ repayments: [] })
    render(await page())
    const log = screen.getByRole('heading', { name: 'Netting & penalty log' }).closest('section') as HTMLElement
    expect(log).toHaveTextContent('0 ENTRIES · LAST 30 DAYS')
    expect(log).toHaveTextContent('No netting or penalty in the last 30 days.')
  })
})

// 2026-10-12 — the netting & penalty log is what was netted or charged, each
// on its day, over the last 30 days (the handoff's count; user: 两个都改 … 对，
// 照这个做): a loan's netting and penalty on Fund OUT, a fund source's on Fund
// IN — a record marked paid or escalated is no longer in it (it is neither, and
// keeps no day). Fund IN's Netted this month counts the fund sources' nettings.
describe('the netting & penalty log, the last 30 days', () => {
  const rep = (loan_id: string, payment_type: string, payment_date: string, amount: number) => ({ id: `r-${loan_id}-${payment_date}`, loan_id, amount, payment_type, payment_date })

  it('lists a loan’s nettings and penalties of the last 30 days, newest first, each opening its loan', async () => {
    database({
      repayments: [
        rep('l1', 'penalty', '2026-09-20', 1500),
        rep('l4', 'netting', '2026-10-03', 24800),
        rep('l2', 'netting', '2026-09-05', 9000), // before the 30 days
        rep('l1', 'principal', '2026-10-01', 50000), // neither
      ],
    })
    render(await page())
    const log = screen.getByRole('heading', { name: 'Netting & penalty log' }).closest('section') as HTMLElement
    expect(log).toHaveTextContent('2 ENTRIES · LAST 30 DAYS')
    const rows = Array.from(log.querySelectorAll('tbody tr:not(.lt-detail)')) as HTMLElement[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('3 Oct 2026')
    expect(within(rows[0]).getByRole('link', { name: 'HOUZS Bedding' })).toHaveAttribute('href', '/fund-out/l4')
    expect(within(rows[0]).getByText('netting').closest('.chip')).toHaveClass('ledger')
    expect(rows[0]).toHaveTextContent('RM 24,800.00')
    expect(rows[1]).toHaveTextContent('20 Sep 2026')
    expect(within(rows[1]).getByRole('link', { name: 'HOUZS Design' })).toHaveAttribute('href', '/fund-out/l1')
    expect(within(rows[1]).getByText('penalty').closest('.chip')).toHaveClass('danger')
    expect(log.querySelector('tfoot')).toHaveTextContent('RM 26,300.00')
    // The record marked paid (HOUZS Bedding, August) is not a netting: not listed.
    expect(within(log).queryByText('paid')).toBeNull()
    // Netted this month is October's netting only.
    expect(card('Netted this month')).toHaveTextContent('RM 24,800.00')
    expect(card('Netted this month')).toHaveTextContent('1 netting')
  })

  it('on Fund IN, counts the fund sources’ nettings this month and lists them, a source since repaid too', async () => {
    database({
      companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
      fund_sources: [
        {
          id: 'fs1', status: 'active', amount: 12000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-07-15',
          repayment_start_month: null, terms_effective_from: null, from_company_id: null, from_department_id: null, from_freetext_name: 'Tan S.H.',
        },
        {
          id: 'fs9', status: 'repaid', amount: 45000, cost_rate: 0.01, lock_in_months: null, compound_interest: false, effective_date: '2026-03-01',
          repayment_start_month: null, terms_effective_from: null, from_company_id: 'co-hc', from_department_id: null, from_freetext_name: null,
        },
      ],
      fund_source_repayments: [
        { id: 'f1', fund_source_id: 'fs1', amount: 4000, payment_date: '2026-08-15', payment_type: 'principal' },
        { id: 'f2', fund_source_id: 'fs1', amount: 120, payment_date: '2026-08-15', payment_type: 'interest' },
        { id: 'f3', fund_source_id: 'fs9', amount: 45000, payment_date: '2026-10-02', payment_type: 'netting' },
      ],
    })
    render(await page('in'))
    expect(card('Netted this month')).toHaveTextContent('RM 45,000.00')
    expect(card('Netted this month')).toHaveTextContent('1 netting')
    expect(card('Netted this month')).not.toHaveTextContent('Netting is on loans')
    const log = screen.getByRole('heading', { name: 'Netting & penalty log' }).closest('section') as HTMLElement
    expect(log).toHaveTextContent('1 ENTRY · LAST 30 DAYS')
    const link = within(log).getByRole('link', { name: 'HOUZS Century' })
    expect(link).toHaveAttribute('href', '/fund-in/fs9')
    expect(link.closest('tr')).toHaveTextContent('2 Oct 2026')
    expect(link.closest('tr')).toHaveTextContent('RM 45,000.00')
  })

  it('on Fund IN, shows the log with nothing in it too', async () => {
    render(await page('in'))
    const log = screen.getByRole('heading', { name: 'Netting & penalty log' }).closest('section') as HTMLElement
    expect(log).toHaveTextContent('0 ENTRIES · LAST 30 DAYS')
    expect(card('Netted this month')).toHaveTextContent('0 nettings')
  })
})
