import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'
import { FinViewProvider } from '@/components/layout/fin-view'

// 2026-10-10 — the Repayment Schedule's list tabs per the user's Claude Design
// handoff: on We collect / We pay ONE table, "Due to collect" / "Due to pay",
// counted "N ITEMS · <MONTH>" — each counterparty with its terms underneath, a
// Type chip, Principal, Interest, Total due, what came in (or went out) this
// month and what is Short ("clear" when nothing is), a Total foot and one note;
// a short row offers Record receipt / Record payment (the deal's own record
// form). The four old tables and the Full plan / Outstanding only toggle stay
// below it, folded. Cards 4–5 on those tabs read the month's minimum interest.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), listPayableFundSources: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('../fund-in/actions', () => ({ listPayableFundSources: mocks.listPayableFundSources }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
// The tables' saved column layout comes from the browser client; here there is none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))

import RepaymentSchedulePage from './page'

const loan = (id: string, company_id: string, principal: number, rate: number, tenure: number | null, terms: string | null, disbursed: string, over: Record<string, unknown> = {}) => ({
  id, company_id, principal, effective_rate: rate, tenure_months: tenure, status: 'active', repayment_terms: terms, compound_interest: false,
  disbursement_date: disbursed, min_pay_interest: false, repayment_start_month: null, terms_effective_from: null, ...over,
})

const TABLES: Record<string, unknown[]> = {
  loans: [
    loan('l1', 'co-hk', 120000, 0.01, 12, '每月还本息 · 资金来源: HC', '2026-05-09'),
    loan('l2', 'co-hc', 60000, 0.02, 6, '每月还本息', '2026-06-15'),
    loan('l3', 'co-hd', 300000, 0.02, 12, '每月还本息', '2026-04-20', { min_pay_interest: true }),
    loan('l4', 'co-hm', 100000, 0.015, null, '利滚利', '2026-07-01', { compound_interest: true }),
    loan('l5', 'co-hb', 50000, 0.01, null, null, '2026-02-10'),
  ],
  loan_outstanding: [
    { loan_id: 'l1', outstanding: 80000, total_principal_paid: 40000 },
    { loan_id: 'l2', outstanding: 30000, total_principal_paid: 30000 },
    { loan_id: 'l3', outstanding: 175000, total_principal_paid: 125000 },
    { loan_id: 'l4', outstanding: 100000, total_principal_paid: 0 },
    { loan_id: 'l5', outstanding: 50000, total_principal_paid: 0 },
  ],
  companies: [
    { id: 'co-hk', short_code: 'HK', name: 'HOUZS Kitchen' }, { id: 'co-hc', short_code: 'HC', name: 'HOUZS Century' },
    { id: 'co-hd', short_code: 'HD', name: 'HOUZS Design' }, { id: 'co-hm', short_code: 'HM', name: 'HOUZS Mattress' },
    { id: 'co-hb', short_code: 'HB', name: 'HOUZS Bedding' }, { id: 'co-conts', short_code: 'CONTS', name: 'Conts' },
  ],
  repayments: [
    { loan_id: 'l1', amount: 10000, payment_date: '2026-09-09', payment_type: 'principal' },
    // HC paid October in full; HD only 5,000 of its interest.
    { loan_id: 'l2', amount: 10000, payment_date: '2026-10-05', payment_type: 'principal' },
    { loan_id: 'l2', amount: 1200, payment_date: '2026-10-05', payment_type: 'interest' },
    { loan_id: 'l3', amount: 5000, payment_date: '2026-10-03', payment_type: 'interest' },
  ],
  fund_sources: [
    { id: 'f1', status: 'active', from_company_id: null, from_department_id: null, from_freetext_name: 'Tan S.H.', compound_interest: false, effective_date: '2026-07-15', min_pay_interest: false, repayment_start_month: null, amount: 12000, cost_rate: 0.01, lock_in_months: 3, terms_effective_from: null },
    { id: 'f2', status: 'active', from_company_id: 'co-conts', from_department_id: null, from_freetext_name: null, compound_interest: false, effective_date: '2026-03-01', min_pay_interest: false, repayment_start_month: null, amount: 300000, cost_rate: 0.02, lock_in_months: null, terms_effective_from: null },
  ],
  fund_source_repayments: [],
  payment_vouchers: [{ fund_source_id: 'f2', repayment_breakdown: { principal: 50000, interest: 6000 }, status: 'pending_approval', voucher_no: 'HV-PV-202610-0040' }],
  departments: [],
}

const payable = (id: string, label: string, original_amount: number, cost_rate: number, lock_in_months: number | null, over: Record<string, unknown>) => ({
  id, label, source_type: 'subsidiary', from_company_id: null, from_director_id: null, original_amount, cost_rate, lock_in_months,
  outstanding: original_amount, monthly_payment: 0, monthly_principal: 0, monthly_interest: 0, total_periods: lock_in_months ?? 0, periods_paid: 0,
  remaining_periods: 0, settled_in_month: false, terms_from: null, ...over,
})

function database() {
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: TABLES[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gte', 'lte', 'lt', 'order', 'range', 'limit']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
  mocks.listPayableFundSources.mockResolvedValue([
    payable('f1', 'Tan S.H. · director · RM 12,000 @ 1.0%/mo · 3mo', 12000, 0.01, 3, {
      outstanding: 8000, monthly_principal: 4000, monthly_interest: 120, total_periods: 3, periods_paid: 1, remaining_periods: 2,
    }),
    payable('f2', 'CONTS · subsidiary · RM 300,000 @ 2.0%/mo', 300000, 0.02, null, { monthly_interest: 6000 }),
  ])
}

const page = async () => render(<FinViewProvider value>{await RepaymentSchedulePage({ searchParams: Promise.resolve({}) })}</FinViewProvider>)
const card = (name: string) => screen.getByRole('group', { name })
const tab = (name: RegExp) => screen.getByRole('button', { name })
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement
const rowsOf = (sec: HTMLElement, name: string) => within(sec).getAllByText(name).map((el) => el.closest('tr') as HTMLElement)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('the Repayment Schedule’s cards', () => {
  it('reads the month’s calendar on the Calendar tab', async () => {
    await page()
    expect(card('To collect')).toHaveTextContent('RM 53,400.00')
    expect(card('To pay')).toHaveTextContent('RM 60,120.00')
    expect(card('Done so far')).toHaveTextContent('RM 42,200.00')
    expect(screen.getByRole('group', { name: 'Overdue / short' })).toBeInTheDocument()
  })

  it('reads the minimum interest on a list tab: received so far, and what is short', async () => {
    await page()
    fireEvent.click(tab(/^We collect/))
    expect(card('To collect')).toHaveTextContent('From borrowers')
    expect(card('To pay')).toHaveTextContent('To fund sources')
    expect(card('Received so far')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Received so far')).toHaveTextContent('RM 5,000.00')
    expect(card('Received so far')).toHaveTextContent('Min interest · Oct')
    expect(card('Short')).toHaveAttribute('data-tone', 'danger')
    expect(card('Short')).toHaveTextContent('RM 1,000.00')
    expect(card('Short')).toHaveTextContent('Min interest not yet in')
    expect(screen.queryByRole('group', { name: 'Done so far' })).toBeNull()

    fireEvent.click(tab(/^We pay/))
    expect(card('Paid so far')).toHaveTextContent('RM 0.00')
    expect(card('Short')).not.toHaveAttribute('data-tone')
  })
})

describe('Due to collect', () => {
  it('is one table of everything due, counted for the month', async () => {
    await page()
    fireEvent.click(tab(/^We collect/))
    const due = section('Due to collect')
    expect(within(due).getByText('6 ITEMS · OCTOBER 2026')).toBeInTheDocument()
    expect(Array.from(due.querySelectorAll('thead th[data-col]')).map((th) => th.textContent?.replace(/[↕▲▼]/g, '').trim())).toEqual([
      'Counterparty', 'Type', 'Principal', 'Interest', 'Total due', 'Received · Oct', 'Short', '',
    ])
    expect(due).toHaveTextContent('Min interest = interest must be paid in full each month')
    expect(due.querySelector('tfoot')).toHaveTextContent('Total')
  })

  it('reads each row: its terms, type, what came in, and what is short', async () => {
    await page()
    fireEvent.click(tab(/^We collect/))
    const due = section('Due to collect')

    const [hk] = rowsOf(due, 'HK')
    expect(hk).toHaveTextContent('RM 120,000.00 @ 1.000%/mo · 12mo · 8 left')
    expect(within(hk).getByText('SC HC').closest('.chip')).toBeInTheDocument()
    expect(within(hk).getByText('principal + interest').closest('.chip')).toHaveClass('accent')
    expect(hk).toHaveTextContent('10,000.00')
    expect(hk).toHaveTextContent('11,200.00')
    expect(within(hk).getByText('(11,200.00)')).toHaveClass('text-danger')
    expect(within(hk).getByRole('link', { name: 'Record receipt' })).toHaveAttribute('href', '/fund-out/l1?from=calendar#repayment-form')

    // HC paid October in full: clear, nothing to record.
    const [hc] = rowsOf(due, 'HC')
    expect(within(hc).getByText('clear').closest('.chip')).toHaveClass('ledger')
    expect(within(hc).queryByRole('link', { name: 'Record receipt' })).toBeNull()

    // HD paid only 5,000 of its interest: short on its instalment and on its minimum interest.
    const [hdScheduled, hdMin] = rowsOf(due, 'HD')
    expect(hdScheduled).toHaveTextContent('5,000.00')
    expect(hdScheduled).toHaveTextContent('(26,000.00)')
    expect(within(hdMin).getByText('min interest').closest('.chip')).toHaveClass('info')
    expect(hdMin).toHaveTextContent('6,000.00')
    expect(hdMin).toHaveTextContent('(1,000.00)')
    expect(within(hdMin).getByRole('link', { name: 'Record receipt' })).toBeInTheDocument()

    // Rolled interest and open-ended deals are not in the month's cash: nothing short.
    const [hm] = rowsOf(due, 'HM')
    expect(within(hm).getByText('rolled interest').closest('.chip')).toHaveClass('alert')
    expect(within(hm).queryByRole('link')).toBeNull()
    const [hb] = rowsOf(due, 'HB')
    expect(within(hb).getByText('open-ended').closest('.chip')).toBeInTheDocument()
    expect(hb).toHaveTextContent('500.00')
    expect(within(hb).queryByRole('link')).toBeNull()
  })

  it('keeps the four old tables and the toggle, folded under it, in English', async () => {
    await page()
    fireEvent.click(tab(/^We collect/))
    const fold = document.querySelector('details.fin-fold') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(fold.querySelector('summary')).toHaveTextContent('Full plans')
    expect(Array.from(fold.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual([
      'Minimum interest — to collect', 'To collect — scheduled loans', 'To collect — compounding', 'To collect — no fixed term',
    ])
    expect(within(fold).getByRole('button', { name: 'Outstanding only' })).toBeInTheDocument()
    expect(within(fold).getAllByText('paid in Oct 2026', { selector: '.chip' })).toHaveLength(2)
    expect(document.body.textContent).not.toMatch(/[一-鿿]/)
  })
})

describe('Due to pay', () => {
  it('offers Record payment on a short row, and shows a repayment PV in flight instead', async () => {
    await page()
    fireEvent.click(tab(/^We pay/))
    const due = section('Due to pay')
    expect(within(due).getByText('2 ITEMS · OCTOBER 2026')).toBeInTheDocument()
    expect(due.querySelector('thead th[data-col="received"]')).toHaveTextContent('Paid · Oct')
    const [tan] = rowsOf(due, 'Tan S.H.')
    expect(tan).toHaveTextContent('4,120.00')
    expect(within(tan).getByRole('link', { name: 'Record payment' })).toHaveAttribute('href', '/fund-in/f1?from=calendar#repay_principal')
    const [conts] = rowsOf(due, 'CONTS')
    expect(within(conts).getByText('pending PV').closest('.chip')).toHaveClass('wait')
    expect(within(conts).queryByRole('link', { name: 'Record payment' })).toBeNull()
  })
})
