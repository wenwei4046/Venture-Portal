import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'
import { projected, selectedColumns } from '@/test/select-columns'

// 2026-10-09 — Overdue & Netting per the user's Claude Design handoff (Phase 3
// of the Finance revamp): two tabs — Fund OUT, what they owe us, and Fund IN,
// what we owe — four cards each, the overdue by month, and the netting &
// penalty log. 2026-10-12 (user: 我不想要自己按 detect overdue … 打开时就最新):
// Fund OUT is read live from each active loan's repayment plan, as Fund IN is
// from each fund source's — the instalments past their day with something
// unpaid, under the month of the oldest; no Detect overdue, no Mark paid.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))

import OverduePage from './page'

const loan = (id: string, company_id: string, over: Record<string, unknown>) => ({
  id, company_id, status: 'active', compound_interest: false, repayment_start_month: null, terms_effective_from: null, ...over,
})
const pay = (loan_id: string, payment_date: string, payment_type: string, amount: number) => ({ id: `r-${loan_id}-${payment_date}-${payment_type}`, loan_id, amount, payment_type, payment_date })

// HOUZS Design: 60,000 over 6 months at 1% from May, on the 10th — May and
// June paid, July to September not (31,800, 91 days). HOUZS Kitchen: 20,000
// at 2% with no fixed term from 15 August — September's 400 unpaid (24 days).
// HOUZS Trading: every instalment paid. HOUZS Bedding: interest-free.
const LOANS = [
  loan('l1', 'co-hd', { principal: 60000, effective_rate: 0.01, tenure_months: 6, repayment_terms: 'EMI 分期 · 月息1% · 6期', disbursement_date: '2026-04-10', repayment_start_month: '2026-05-01' }),
  loan('l2', 'co-hk', { principal: 20000, effective_rate: 0.02, tenure_months: 1, repayment_terms: '未定还款', disbursement_date: '2026-08-15' }),
  loan('l3', 'co-ht', { principal: 12000, effective_rate: 0.01, tenure_months: 3, repayment_terms: 'EMI 分期 · 3期', disbursement_date: '2026-06-05', repayment_start_month: '2026-07-01' }),
  loan('l4', 'co-hb', { principal: 5000, effective_rate: 0, tenure_months: 1, repayment_terms: '无息垫款 · 0% · 原表无还款方式', disbursement_date: '2026-03-26' }),
]
const REPAYMENTS = [
  pay('l1', '2026-05-10', 'principal', 10000), pay('l1', '2026-05-10', 'interest', 600),
  pay('l1', '2026-06-10', 'principal', 10000), pay('l1', '2026-06-10', 'interest', 600),
  ...['07', '08', '09'].flatMap((m) => [pay('l3', `2026-${m}-05`, 'principal', 4000), pay('l3', `2026-${m}-05`, 'interest', 120)]),
  pay('l4', '2026-10-03', 'netting', 24800),
]

function database(over: Record<string, unknown[]> = {}) {
  const tables: Record<string, unknown[]> = {
    loans: LOANS,
    companies: [
      { id: 'co-hd', name: 'HOUZS Design', short_code: 'HD' }, { id: 'co-hk', name: 'HOUZS Kitchen', short_code: 'HK' },
      { id: 'co-ht', name: 'HOUZS Trading', short_code: 'HT' }, { id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' },
    ],
    repayments: REPAYMENTS,
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
      // Only the columns selected come back, as from PostgREST.
      let columns: string[] | null = null
      const q: Record<string, unknown> = {}
      for (const m of ['eq', 'neq', 'gte', 'lte', 'order', 'range']) q[m] = () => q
      q.select = (c?: string) => ((columns = selectedColumns(c)), q)
      // A read by a list (fund sources by status or by id, repayments by type) answers only those rows.
      q.in = (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q)
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: projected(rows, columns), error: null }).then(res, rej)
      return q
    },
  })
}

const page = (tab?: string) => OverduePage({ searchParams: Promise.resolve({ tab }) })
const card = (name: string) => screen.getByRole('group', { name })
const month = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('Overdue & Netting on the sheet', () => {
  it('reads what they owe us live: four cards, each loan under the month of its oldest unpaid instalment, the log', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · OVERDUE & NETTING')
    expect(screen.getByRole('button', { name: /^Fund OUT · they owe us/ }).querySelector('[data-tab-count]')).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /^Fund IN · we owe/ }).querySelector('[data-tab-count]')).toHaveTextContent('1')
    expect(card('Overdue outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('Overdue outstanding')).toHaveTextContent('RM 32,200.00')
    expect(card('Overdue outstanding')).toHaveTextContent('2 loans')
    expect(card('Penalty this month')).toHaveTextContent('RM 0.00')
    expect(card('Penalty this month')).toHaveTextContent('0 penalties')
    expect(card('Longest overdue')).toHaveTextContent('91 days')
    expect(card('Longest overdue')).toHaveTextContent('HOUZS Design')
    expect(card('Netted this month')).toHaveTextContent('RM 24,800.00')
    expect(card('Netted this month')).toHaveTextContent('1 netting')

    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual(['September 2026', 'July 2026', 'Netting & penalty log'])
    const hd = within(month('July 2026')).getByRole('link', { name: 'HOUZS Design' }).closest('tr') as HTMLElement
    expect(within(hd).getByRole('link', { name: 'HOUZS Design' })).toHaveAttribute('href', '/fund-out/l1')
    expect(hd).toHaveTextContent('HD')
    expect(hd).toHaveTextContent('RM 31,800.00')
    expect(hd).toHaveTextContent('91')
    expect(within(hd).getByText('overdue').closest('.chip')).toHaveClass('alert')
    expect(hd).toHaveTextContent('Instalment 3 of 6 · 3 unpaid')
    const hk = within(month('September 2026')).getByRole('link', { name: 'HOUZS Kitchen' }).closest('tr') as HTMLElement
    expect(hk).toHaveTextContent('RM 400.00')
    expect(hk).toHaveTextContent('24')
    expect(hk).toHaveTextContent('Instalment 1')
    // Paid up, and interest-free: neither is overdue.
    expect(screen.queryByRole('link', { name: 'HOUZS Trading' })).toBeNull()
    expect(within(month('July 2026')).queryByText('HOUZS Bedding')).toBeNull()
  })

  it('names a director’s fund source by the director (2026-10-12)', async () => {
    database({
      fund_sources: [
        {
          id: 'fs5', status: 'active', amount: 10000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-07-15',
          repayment_start_month: null, terms_effective_from: null, from_company_id: null, from_department_id: null, from_freetext_name: null, from_director_id: 'd2',
        },
      ],
      fund_source_repayments: [],
      directors: [{ id: 'd2', name: 'Loo Wen Wei' }],
    })
    render(await page('in'))
    expect(screen.getByRole('link', { name: 'Loo Wen Wei' })).toHaveAttribute('href', '/fund-in/fs5')
    expect(screen.queryByRole('link', { name: 'Fund source' })).toBeNull()
  })

  it('shows what we owe: a fund source’s installments passed unpaid', async () => {
    render(await page('in'))
    expect(card('Overdue outstanding')).toHaveTextContent('RM 4,120.00') // the September installment: 4,000 + 120
    expect(card('Overdue outstanding')).toHaveTextContent('1 fund source · we owe')
    expect(card('Penalty accrued')).toHaveTextContent('No penalty on fund sources')
    expect(card('Longest overdue')).toHaveTextContent('24 days')
    const september = month('September 2026')
    const row = within(september).getByText('Tan S.H.').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('RM 4,120.00')
    expect(row).toHaveTextContent('Instalment 2 of 3')
    expect(within(row).getByRole('link', { name: 'Record payment' })).toHaveAttribute('href', '/fund-in/fs1')
  })

  // 2026-10-12 (user: 现在只能选月份不能选日期): an instalment is late from its
  // repayment start's day — the date Finance picked — not the effective date's.
  it('counts what we owe late from the repayment start’s day', async () => {
    database({
      fund_sources: [
        {
          id: 'fs1', status: 'active', amount: 12000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-07-15',
          repayment_start_month: '2026-08-01', repayment_date: '2026-08-25', terms_effective_from: null, from_company_id: null, from_department_id: null, from_freetext_name: 'Tan S.H.',
        },
      ],
    })
    render(await page('in'))
    // September's falls on the 25th: 14 days on the 9th of October, not 24.
    expect(card('Longest overdue')).toHaveTextContent('14 days')
  })
})

// 2026-10-10 — the handoff, more closely: the cards come before the tabs;
// every month's table closes on its total; on a phone a row opens onto the
// rest of it. 2026-10-12: nothing to press — the page reads the plans.
describe('Overdue & Netting, per the handoff', () => {
  it('puts the cards before the tabs, and needs no Detect overdue, Mark paid or Escalate', async () => {
    render(await page())
    const cards = screen.getByRole('region', { name: 'Overdue · Fund OUT' })
    const tabs = screen.getByRole('button', { name: /^Fund OUT · they owe us/ })
    expect(cards.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Detect overdue' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Escalate' })).toBeNull()
  })

  it('closes every month on its total, a single loan’s too', async () => {
    render(await page())
    expect(month('July 2026').querySelector('tfoot')).toHaveTextContent('RM 31,800.00')
    expect(month('September 2026').querySelector('tfoot')).toHaveTextContent('RM 400.00')
  })

  it('closes a month of what we owe on its total too', async () => {
    render(await page('in'))
    expect(month('September 2026').querySelector('tfoot')).toHaveTextContent('RM 4,120.00')
  })

  it('offers Record receipt on a loan they owe us — its repayment form, where Netting is a type', async () => {
    render(await page())
    const hd = within(month('July 2026')).getByRole('link', { name: 'HOUZS Design' }).closest('tr') as HTMLElement
    expect(within(hd).getByRole('link', { name: 'Record receipt' })).toHaveAttribute('href', '/fund-out/l1#repayment-form')
  })

  it('on a phone, opens a row onto its status, note and Record receipt', async () => {
    render(await page())
    const hd = within(month('July 2026')).getByRole('link', { name: 'HOUZS Design' }).closest('tr') as HTMLElement
    fireEvent.click(within(hd).getByRole('button', { name: '展开明细' }))
    const panel = hd.nextElementSibling as HTMLElement
    expect(panel).toHaveClass('lt-detail')
    expect(panel).toHaveTextContent('Status')
    expect(panel).toHaveTextContent('overdue')
    expect(panel).toHaveTextContent('Instalment 3 of 6 · 3 unpaid')
    expect(within(panel).getByRole('link', { name: 'Record receipt' })).toBeInTheDocument()
  })

  it('says every loan is current when none has an instalment past its day unpaid', async () => {
    database({ loans: [LOANS[2], LOANS[3]] })
    render(await page())
    expect(screen.getByText('All loans current.')).toBeInTheDocument()
    expect(card('Overdue outstanding')).toHaveTextContent('RM 0.00')
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
// IN. Fund IN's Netted this month counts the fund sources' nettings.
describe('the netting & penalty log, the last 30 days', () => {
  it('lists a loan’s nettings and penalties of the last 30 days, newest first, each opening its loan', async () => {
    database({
      repayments: [
        pay('l1', '2026-09-20', 'penalty', 1500),
        pay('l4', '2026-10-03', 'netting', 24800),
        pay('l2', '2026-09-05', 'netting', 9000), // before the 30 days
        pay('l1', '2026-10-01', 'principal', 50000), // neither
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
    // Netted this month is October's netting only; the penalty was September's.
    expect(card('Netted this month')).toHaveTextContent('RM 24,800.00')
    expect(card('Netted this month')).toHaveTextContent('1 netting')
    expect(card('Penalty this month')).toHaveTextContent('RM 0.00')
  })

  it('counts this month’s penalties in their card', async () => {
    database({ repayments: [...REPAYMENTS, pay('l2', '2026-10-05', 'penalty', 250)] })
    render(await page())
    expect(card('Penalty this month')).toHaveAttribute('data-tone', 'danger')
    expect(card('Penalty this month')).toHaveTextContent('RM 250.00')
    expect(card('Penalty this month')).toHaveTextContent('1 penalty')
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
