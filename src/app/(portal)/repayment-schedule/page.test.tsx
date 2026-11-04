import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
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

function database(over: Record<string, unknown[]> = {}) {
  const tables = { ...TABLES, ...over }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: tables[table] ?? [], error: null }
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

// 2026-10-12 (user: 把0.00拿掉，director显示名字): the calendar draws no entry for
// a month with nothing to pay (an interest-free deal with no fixed term), and a
// director's fund source goes by the director's name, not "Fund source".
describe('the Repayment Schedule’s calendar', () => {
  const director = (id: string, from_director_id: string, amount: number, cost_rate: number, effective_date: string) => ({
    id, status: 'active', from_company_id: null, from_department_id: null, from_freetext_name: null, from_director_id,
    compound_interest: false, effective_date, min_pay_interest: false, repayment_start_month: null, amount, cost_rate, lock_in_months: null, terms_effective_from: null,
  })

  it('leaves out 0.00 and names a director', async () => {
    database({
      fund_sources: [...TABLES.fund_sources, director('f3', 'd1', 9000, 0, '2026-02-26'), director('f4', 'd2', 10000, 0.01, '2026-03-26')],
      directors: [{ id: 'd1', name: 'Chai Meng Keat' }, { id: 'd2', name: 'Loo Wen Wei' }],
    })
    await page()
    // Loo Wen Wei's 1% on 10,000: 100.00 on the 26th.
    expect(screen.getAllByText('Loo Wen Wei').length).toBeGreaterThan(0)
    // Chai Meng Keat's is interest-free: nothing to pay, no entry.
    expect(screen.queryByText('Chai Meng Keat')).toBeNull()
    expect(screen.queryByText('Fund source')).toBeNull()
    expect(screen.queryByText('0.00')).toBeNull()
  })
})

describe('the Repayment Schedule’s cards', () => {
  it('reads the month’s calendar on the Calendar tab', async () => {
    await page()
    expect(card('To collect')).toHaveTextContent('RM 53,400.00')
    expect(card('To pay')).toHaveTextContent('RM 60,120.00')
    expect(card('Done so far')).toHaveTextContent('RM 42,200.00')
    expect(screen.getByRole('group', { name: 'Overdue / short' })).toBeInTheDocument()
  })

})

describe('Due to collect', () => {
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

describe('We collect / We pay, a month at a time (2026-11-04)', () => {
  const paidUp = () =>
    database({
      repayments: [
        { loan_id: 'l1', amount: 10000, payment_date: '2026-09-09', payment_type: 'principal' },
        { loan_id: 'l2', amount: 40000, payment_date: '2026-10-05', payment_type: 'principal' },
        { loan_id: 'l2', amount: 4800, payment_date: '2026-10-05', payment_type: 'interest' },
        { loan_id: 'l3', amount: 125000, payment_date: '2026-09-20', payment_type: 'principal' },
        { loan_id: 'l3', amount: 35000, payment_date: '2026-10-03', payment_type: 'interest' },
      ],
    })
  const heads = (sec: HTMLElement) => Array.from(sec.querySelectorAll('thead th[data-col]')).map((th) => th.textContent?.replace(/[↕▲▼]/g, '').trim())

  it('reads the list tab’s cards off the list: to collect, received, still owed, overdue', async () => {
    await page()
    fireEvent.click(tab(/^We collect/))
    expect(card('To collect · Oct')).toBeInTheDocument()
    expect(card('Received so far')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Still owed')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /^Overdue · \d+$/ })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Done so far' })).toBeNull()
    const side = screen.getByRole('region', { name: 'Repayment Schedule' })
    expect((side.querySelector('.stat-cards-grid') as HTMLElement).style.getPropertyValue('--stat-cols')).toBe('4')
  })

  it('is one row an instalment, sorted by its day, with its status and the day it was paid', async () => {
    paidUp()
    await page()
    fireEvent.click(tab(/^We collect/))
    const due = section('Due to collect')
    expect(heads(due)).toEqual(['Due', 'Company', '#', 'To collect', 'Received', 'Still owed', 'Status', 'Received on', ''])
    expect(due.querySelector('tfoot')).toHaveTextContent('Total')

    // HC paid October in full on the 5th: Paid, its day, nothing to record.
    const [hc] = rowsOf(due, 'HC')
    expect(within(hc).getByText('Paid').closest('.chip')).toHaveClass('ledger')
    expect(hc).toHaveTextContent('5 Oct')
    expect(within(hc).queryByRole('link', { name: 'Record receipt' })).toBeNull()

    // HK: its instalment, its split and number, its source; still owed in full, Record receipt.
    const [hk] = rowsOf(due, 'HK')
    expect(hk).toHaveTextContent('P 10,000.00 · I 1,200.00')
    expect(hk).toHaveTextContent('/12')
    expect(within(hk).getByText('SC HC').closest('.chip')).toBeInTheDocument()
    expect(within(hk).getByRole('link', { name: 'Record receipt' })).toHaveAttribute('href', '/fund-out/l1?from=calendar#repayment-form')

    // HD paid 5,000 of it: part paid, still owed, Record receipt — listed once.
    const hd = rowsOf(due, 'HD')
    expect(hd).toHaveLength(1)
    expect(within(hd[0]).getByText(/^Part paid/).closest('.chip')).toHaveClass('alert')
    expect(hd[0]).toHaveTextContent('5,000.00')
    expect(within(hd[0]).getByRole('link', { name: 'Record receipt' })).toBeInTheDocument()

    // HM compounds: its interest rolls into the balance — nothing owed in cash, nothing to record.
    const [hm] = rowsOf(due, 'HM')
    expect(within(hm).getByText('Rolls in')).toBeInTheDocument()
    expect(within(hm).queryByRole('link')).toBeNull()

    // By day: every row's date in order.
    const days = Array.from(due.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent ?? '')
    const asDate = (s: string) => Date.parse(`${s} 2026`)
    expect(days.map(asDate)).toEqual([...days.map(asDate)].sort((a, b) => a - b))
  })

  it('filters by status from the chips over it', async () => {
    paidUp()
    await page()
    fireEvent.click(tab(/^We collect/))
    const due = section('Due to collect')
    fireEvent.click(within(due).getByRole('button', { name: /^Paid · 1$/ }))
    expect(within(due).getAllByRole('row').filter((r) => r.closest('tbody'))).toHaveLength(1)
    expect(rowsOf(due, 'HC')).toHaveLength(1)
    expect(within(due).queryByText('HK')).toBeNull()
    fireEvent.click(within(due).getByRole('button', { name: /^All · / }))
    expect(rowsOf(due, 'HK').length).toBeGreaterThan(0)
  })

  // A payment clears the oldest instalment first: HK paid only September's principal, so its June to September
  // instalments are still owed — this month's list shows them, overdue, before October's, and the card counts them.
  it('lists the earlier instalments still owed, overdue, in the office’s month', async () => {
    paidUp()
    await page()
    fireEvent.click(tab(/^We collect/))
    const due = section('Due to collect')
    const hk = rowsOf(due, 'HK')
    expect(hk.length).toBeGreaterThan(1)
    expect(within(hk[0]).getByText(/^(Overdue|Part paid)/)).toBeInTheDocument()
    expect(hk[hk.length - 1]).toHaveTextContent('9 Oct')
    expect(screen.getByRole('group', { name: /^Overdue · [1-9][0-9]*$/ })).toHaveAttribute('data-tone', 'danger')
  })

  it('prints the rows on show from a right-click on the header', async () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() }
    const win = { document: doc, focus: vi.fn(), print: vi.fn(), setTimeout: (f: () => void) => f() }
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
    paidUp()
    await page()
    fireEvent.click(tab(/^We collect/))
    const due = section('Due to collect')
    fireEvent.click(within(due).getByRole('button', { name: /^Paid · 1$/ }))
    fireEvent.contextMenu(due.querySelector('thead tr') as HTMLElement)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Print listing/ }))
    expect(open).toHaveBeenCalled()
    const html = doc.write.mock.calls[0][0] as string
    expect(html).toContain('Repayment Schedule · We collect')
    expect(html).toContain('October 2026 · Paid only')
    expect(html).toContain('HC')
    expect(html).not.toContain('>HK')
    expect(win.print).toHaveBeenCalled()
    open.mockRestore()
  })

  it('We pay: Record payment on what is owed, a repayment PV in flight instead', async () => {
    await page()
    fireEvent.click(tab(/^We pay/))
    const due = section('Due to pay')
    expect(heads(due)).toContain('Paid on')
    const [tan] = rowsOf(due, 'Tan S.H.')
    expect(within(tan).getByRole('link', { name: 'Record payment' })).toHaveAttribute('href', '/fund-in/f1?from=calendar#repay_principal')
    const [conts] = rowsOf(due, 'CONTS')
    expect(within(conts).getByText('pending PV').closest('.chip')).toHaveClass('wait')
    expect(within(conts).queryByRole('link', { name: 'Record payment' })).toBeNull()
  })
})

// 2026-10-10 — the head's Export (the handoff; user: 做完他): the month's two
// due tables as a spreadsheet, for the month on show. 2026-11-02 (the user:
// "帮我把日期选择器和export 做在这一排" · "没有办法export pdf？" → on its sample,
// "一个export 就行"): the month and one Export ▾ on the tabs' row — Excel or
// PDF — and the five cards small, in one row.
describe('the Repayment Schedule’s tabs’ row', () => {
  afterEach(() => vi.unstubAllGlobals())
  const row = () => document.querySelector('.sch-tabrow') as HTMLElement

  it('holds the month and Export at the right of the tabs; the head only its title', async () => {
    await page()
    expect(within(row()).getByRole('button', { name: 'Calendar' })).toBeInTheDocument()
    expect(within(row()).getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(within(row()).getByText('October 2026')).toBeInTheDocument()
    expect(within(row()).getByRole('button', { name: 'Export' })).toHaveClass('sch-tool-btn')
    const head = document.querySelector('.page-head') as HTMLElement
    expect(within(head).queryByRole('button', { name: 'Previous month' })).toBeNull()
    expect(within(head).queryByText('Export')).toBeNull()
  })

  it('opens Export for the month on show: Excel, or PDF in a tab of its own', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await page()
    fireEvent.click(within(row()).getByRole('button', { name: 'Export' }))
    const menu = await screen.findByRole('dialog', { name: 'Export' })
    expect(within(menu).getByText('October 2026')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Excel/ })).toHaveTextContent('repayment-schedule-2026-10.xlsx')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Excel/ }))
    expect(assign).toHaveBeenCalledWith('/repayment-schedule/export?month=2026-10&format=xlsx')
    fireEvent.click(within(row()).getByRole('button', { name: 'Export' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Export' })).getByRole('menuitem', { name: /PDF/ }))
    expect(open).toHaveBeenCalledWith('/repayment-schedule/export?month=2026-10&format=pdf', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('no Export for an account that may read the treasury but not export it', async () => {
    mocks.requirePermission.mockResolvedValue({ ...withActions({ role: 'finance', permissions: ['treasury'] }), actions: { 'treasury.view': 'all' } })
    await page()
    expect(within(row()).queryByRole('button', { name: 'Export' })).toBeNull()
    expect(within(row()).getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
  })

  it('stands the five cards small, in one row', async () => {
    await page()
    const cards = screen.getByRole('region', { name: 'Repayment Schedule' })
    expect(cards).toHaveAttribute('data-size', 'small')
    expect((cards.querySelector('.stat-cards-grid') as HTMLElement).style.getPropertyValue('--stat-cols')).toBe('5')
  })
})
