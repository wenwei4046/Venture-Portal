import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// 2026-10-07 — Service Billing on the sheet (the user approved the Invoice /
// Statements sample, v6): the month beside the title, every control in a
// captioned band, four summary cards, the payroll basis folded above the
// invoices with its figures on the fold, and the list told each invoice's
// category. The list is a client component: what the page sends it is
// printed and read here as the browser would get it.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  fetchPaidByInvoice: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/debtor-aging-data', () => ({ fetchPaidByInvoice: mocks.fetchPaidByInvoice }))
vi.mock('@/lib/dept-registry', async (original) => ({
  ...(await original<typeof import('@/lib/dept-registry')>()),
  extraBillingModeOptions: () => [],
  primedRegistryRows: () => [],
}))
vi.mock('./PeriodSelector', () => ({ default: (p: { currentPeriod: string }) => <span data-testid="period">{p.currentPeriod}</span> }))
vi.mock('./GenerateInvoicesButton', () => ({ default: () => null }))
vi.mock('./MarketingProjectList', () => ({ default: () => <div data-testid="marketing" /> }))
vi.mock('./NonBillableList', () => ({ default: () => <div data-testid="non-billable" /> }))
vi.mock('./CreditNotesList', () => ({ default: () => null }))
vi.mock('./CreateInvoiceButton', () => ({ default: () => <button type="button">+ Create Invoice</button> }))
vi.mock('./CreateMultiLineInvoiceButton', () => ({ default: () => <button type="button">+ Multi-line Invoice</button> }))
vi.mock('./GenerateConsolidatedInvoicesButton', () => ({ default: () => <button type="button">Generate payroll invoices</button> }))
vi.mock('./ReconcilePayrollBillingButton', () => ({ default: () => <button type="button">对数补差</button> }))
vi.mock('./GenerateOwnShareInvoiceButton', () => ({ default: () => <button type="button">Own-share → Venture (Office)</button> }))
vi.mock('@/components/department/DepartmentModeCard', () => ({ default: () => <div data-testid="dept-mode" /> }))
vi.mock('./InvoicesList', () => ({
  default: (p: { invoices: Array<{ id: string }>; categoryByInvoice?: Record<string, string>; canSetDefault?: boolean }) => (
    <pre data-testid="list">{JSON.stringify({ ids: p.invoices.map((i) => i.id), categoryByInvoice: p.categoryByInvoice, canSetDefault: p.canSetDefault })}</pre>
  ),
}))

import BillingView from './BillingView'

const PERIOD = '2026-09-01'
const base = {
  period_month: PERIOD, company_id: 'co-2990', billable_to_type: 'subsidiary', billable_to_department_id: null,
  billable_to_freetext_name: null, billable_to_freetext_address: null, billable_to_freetext_phone: null, billable_to_freetext_email: null,
  description: null, invoice_date: '2026-09-30', due_date: null, reference_no: null, category_code: null, created_at: '2026-09-30T00:00:00Z', settlement_voucher_id: null,
}
const INVOICES = [
  { ...base, id: 'd1', invoice_no: 'HV-INV-202609-0055', billing_mode: 'director_attribution', total_amount: 9642.13, status: 'issued' },
  { ...base, id: 'c1', invoice_no: 'HV-INV-202609-0046', billing_mode: 'payroll_consolidated', total_amount: 8641.63, status: 'paid' },
  { ...base, id: 'm1', invoice_no: 'HV-INV-202609-0039', billing_mode: 'marketing_project', total_amount: 2850, status: 'paid', company_id: 'co-hk' },
  { ...base, id: 'v1', invoice_no: 'HV-INV-202610-0002', billing_mode: 'venture_attribution', total_amount: 1054.89, status: 'voided' },
]
const LINES = [
  { invoice_id: 'c1', line_no: 1, description: 'HR', amount: 1352.45, category_code: '5050', segment: 'hr' },
  { invoice_id: 'c1', line_no: 2, description: 'Finance', amount: 2128.67, category_code: '5050', segment: 'finance' },
  { invoice_id: 'c1', line_no: 3, description: 'Director Office', amount: 2174.63, category_code: '5050', segment: 'director_office' },
  { invoice_id: 'c1', line_no: 4, description: 'IT', amount: 2985.88, category_code: '5050', segment: 'it' },
  { invoice_id: 'm1', line_no: 1, description: 'Design', amount: 2850, category_code: '5019', segment: null },
]

type Filter = [string, string, unknown]
function database() {
  const from = vi.fn((table: string) => {
    const filters: Filter[] = []
    const result = () => {
      const has = (f: string, col: string) => filters.some(([ff, c]) => ff === f && c === col)
      switch (table) {
        case 'invoices':
          return { data: has('neq', 'period_month') ? [] : INVOICES, error: null }
        case 'invoice_lines':
          return { data: LINES, error: null }
        case 'companies':
          return { data: [{ id: 'co-2990', name: '2990', short_code: '2990' }, { id: 'co-hk', name: 'Hookka', short_code: 'HK' }], error: null }
        case 'chart_of_accounts':
          return { data: [{ code: '5019', name: 'Design Income', type: 'revenue', parent_code: null }, { code: '5050', name: 'Salary Income', type: 'revenue', parent_code: null }], error: null }
        case 'payroll_runs':
          return { data: { marketing_opex_total: 59697.96, hr_opex_total: 5797.05, finance_opex_total: 26636.73, director_office_total: 7415.8, it_opex_total: 5971.75, revenue_opex_total: 0, director_salary_total: 0, approved_at: '2026-10-05T02:08:45Z' }, error: null }
        case 'director_salary_submissions':
          return {
            data: {
              total_gross: 2500, total_payroll_gross: 2500, total_invoice: 0, total_saving: 0, director_count: 1, submitted_at: '2026-10-05T06:35:55Z',
              by_company: [{ company_id: 'co-2990', company_name: '2990', company_short_code: '2990', basic: 2500, kpi: 0, allowance: 6769.38, epf_er: 325, socso_er: 42.85, eis_er: 4.9, total_ctc: 9642.13 }],
            },
            error: null,
          }
        default:
          return { data: [], error: null }
      }
    }
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push(['eq', col, val]), q),
      neq: (col: string, val: unknown) => (filters.push(['neq', col, val]), q),
      in: (col: string, val: unknown) => (filters.push(['in', col, val]), q),
      gte: () => q, lte: () => q, not: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null } },
      single: async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null } },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return q
  })
  const rpc = vi.fn((name: string) => {
    const result = name === 'get_submitted_hr_summary' ? { data: { dept_summaries: {} }, error: null } : { data: [], error: null }
    const q = {
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from, rpc })
  mocks.fetchPaidByInvoice.mockResolvedValue(new Map())
  return { from, rpc }
}

const card = (name: string) => screen.getByRole('group', { name })
const sent = () => JSON.parse(screen.getByTestId('list').textContent ?? '{}') as { ids: string[]; categoryByInvoice: Record<string, string>; canSetDefault: boolean }
const page = async () => render(await BillingView({ searchParams: Promise.resolve({ period: PERIOD }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'fm', role: 'finance', permissions: ['billing'] })
})

describe('Service Billing on the sheet', () => {
  it('opens on four cards — invoiced, outstanding, received, the payroll basis — and no figure strip', async () => {
    database()
    await page()
    expect(card('Invoiced · September')).toHaveAttribute('data-tone', 'primary')
    expect(card('Invoiced · September')).toHaveTextContent('RM 21,133.76')
    expect(card('Invoiced · September')).toHaveTextContent('3 invoices · 1 voided left out')
    expect(card('Outstanding')).toHaveAttribute('data-tone', 'alert')
    expect(card('Outstanding')).toHaveTextContent('RM 9,642.13')
    expect(card('Outstanding')).toHaveTextContent('1 issued')
    expect(card('Received')).toHaveTextContent('RM 11,491.63')
    expect(card('Received')).toHaveTextContent('2 paid')
    expect(card('Payroll basis')).toHaveTextContent('Submitted')
    expect(card('Payroll basis')).toHaveTextContent('HR 5 Oct · Director salary 5 Oct · 0 marketing contracts')
    expect(document.querySelector('.statement-amount')).toBeNull()
    expect(screen.queryByText('HR OPEX')).toBeNull()
  })

  it('keeps every control, in three captioned groups, with the month beside the title', async () => {
    database()
    await page()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Service Billing')
    expect(screen.getByTestId('period')).toHaveTextContent(PERIOD)
    const band = document.querySelector('.act-band') as HTMLElement
    expect(within(band).getByText('From payroll')).toBeInTheDocument()
    expect(within(band).getByText('Create')).toBeInTheDocument()
    expect(within(band).getByText('Export')).toBeInTheDocument()
    for (const label of ['Generate payroll invoices', '对数补差', 'Own-share → Venture (Office)', '+ Create Invoice', '+ Multi-line Invoice']) {
      expect(within(band).getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(within(band).getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/statements/export?format=xlsx&period=2026-09')
    expect(within(band).getByRole('link', { name: 'PDF · list' })).toHaveAttribute('href', '/statements/export?format=pdf&period=2026-09')
    expect(within(band).getByRole('link', { name: 'PDF · per invoice' })).toHaveAttribute('href', '/billing/invoice-doc?period=2026-09')
  })

  it('folds the payroll basis above the invoices, its figures on the fold, counting the consolidated lines by department', async () => {
    database()
    await page()
    const fold = document.querySelector('details.fin-fold') as HTMLElement
    expect(fold).not.toHaveAttribute('open')
    const summary = fold.querySelector('summary') as HTMLElement
    expect(summary).toHaveTextContent('Payroll basis')
    expect(summary).toHaveTextContent('HR 1,352 / 5,797 · Finance 2,129 / 26,637 · Director Office 2,175 / 7,416 · IT 2,986 / 5,972 · Director 9,642 ✓ · Marketing 2,850 / 59,698')
    expect(within(fold).getByText('Director Salary Submission')).toBeInTheDocument()
    // Above the invoices, as before.
    expect(fold.compareDocumentPosition(screen.getByTestId('list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('tells the list each invoice’s category from its lines, and that Finance may set the default arrangement', async () => {
    database()
    await page()
    expect(sent().ids).toEqual(['d1', 'c1', 'm1', 'v1'])
    expect(sent().categoryByInvoice).toEqual({ c1: 'Salary Income', m1: 'Design Income' })
    expect(sent().canSetDefault).toBe(true)
  })
})
