import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// 2026-10-07 — the Billing Allocator on the sheet (the user approved the
// allocator sample): the month beside the title, four cards — what the month
// allocated, what still has to be billed, what is billed, what HV keeps —
// then the counted tabs.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('./_components/AllocatorTabs', () => ({
  default: (p: { data: { period: string; txns: unknown[]; invoices: unknown[]; companies: Array<{ label: string }> } }) => (
    <pre data-testid="tabs">
      {JSON.stringify({ period: p.data.period, txns: p.data.txns.length, invoices: p.data.invoices.length, companies: p.data.companies.map((c) => c.label) })}
    </pre>
  ),
}))
vi.mock('./_components/AllocatorPeriod', () => ({
  default: (p: { period: string }) => <input type="month" aria-label="Period" value={p.period} readOnly />,
}))

import BillingAllocatorPage from './page'

const detail = (company_id: string | null, department_id: string | null, amount: number, is_own_share = false) => ({
  company_id,
  department_id,
  method_detail: 'Head: 1.00/48.00 (2026-09)',
  amount,
  is_own_share,
})

const TXNS = [
  {
    id: 't1', txn_no: 'ALC-202609-001', description: 'Office Rental', amount: 18980, method: 'headcount', category_id: 'cat-rent',
    hc_period: '2026-09-01', billed_ref: 'ALC-202609',
    alloc_txn_details: [detail(null, null, 366.59, true), detail('co-2990', null, 742.32), detail('co-car', null, 3681.57), detail(null, 'mkt', 4745)],
  },
  {
    id: 't5', txn_no: 'ALC-202609-005', description: 'AI TOOLS - JUL26', amount: 1863.18, method: 'percentage', category_id: 'cat-web',
    hc_period: null, billed_ref: 'ALC-202609-3',
    alloc_txn_details: [detail(null, null, 745.27, true), detail('co-2990', null, 372.64), detail('co-car', null, 745.27)],
  },
  {
    id: 't6', txn_no: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", amount: 2149.2, method: 'percentage', category_id: 'cat-web',
    hc_period: null, billed_ref: 'ALC-202609-4', // that batch was voided: not billed
    alloc_txn_details: [detail(null, null, 859.68, true), detail('co-2990', null, 429.84), detail('co-car', null, 859.68)],
  },
]

const INVOICES = [
  { id: 'i7', invoice_no: 'HV-INV-202609-0007', company_id: 'co-2990', billable_to_department_id: null, status: 'issued', reference_no: 'ALC-202609' },
  { id: 'i8', invoice_no: 'HV-INV-202609-0008', company_id: 'co-car', billable_to_department_id: null, status: 'paid', reference_no: 'ALC-202609' },
  { id: 'i13', invoice_no: 'HV-INV-202609-0013', company_id: null, billable_to_department_id: 'mkt', status: 'paid', reference_no: 'ALC-202609' },
  { id: 'i30', invoice_no: 'HV-INV-202609-0030', company_id: 'co-2990', billable_to_department_id: null, status: 'issued', reference_no: 'ALC-202609-3' },
  { id: 'i31', invoice_no: 'HV-INV-202609-0031', company_id: 'co-car', billable_to_department_id: null, status: 'paid', reference_no: 'ALC-202609-3' },
]

function database(txns = TXNS, invoices = INVOICES) {
  const tables: Record<string, unknown[]> = {
    companies: [
      { id: 'co-2990', short_code: '2990', name: '2990 Sdn Bhd' },
      { id: 'co-car', short_code: 'CAR', name: 'Carres' },
      { id: 'co-hk', short_code: 'HK', name: 'Hookka' },
    ],
    departments: [{ id: 'mkt', name: 'Marketing' }],
    alloc_categories: [{ id: 'cat-rent', name: 'Rental', coa_code: '7012' }, { id: 'cat-web', name: 'Website & Software', coa_code: '9087' }],
    alloc_txns: txns,
    invoices,
  }
  const from = vi.fn((table: string) => {
    const result = { data: tables[table] ?? [], error: null }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'like', 'order', 'range']) q[m] = () => q
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const card = (name: string) => screen.getByRole('group', { name })
const page = (period = '2026-09') => BillingAllocatorPage({ searchParams: Promise.resolve({ period }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'fm', role: 'finance', permissions: ['billing'] })
})

describe('the Billing Allocator on the sheet', () => {
  it('opens on the month with four cards: allocated, to bill, billed, and what HV keeps', async () => {
    database()
    render(await page())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Billing Allocator')
    expect(screen.getByLabelText('Period')).toHaveValue('2026-09')
    expect(card('Allocated · September')).toHaveAttribute('data-tone', 'primary')
    expect(card('Allocated · September')).toHaveTextContent('RM 22,992.38')
    expect(card('Allocated · September')).toHaveTextContent('3 expenses · 2 batches')
    expect(card('To bill')).toHaveAttribute('data-tone', 'alert')
    expect(card('To bill')).toHaveTextContent('RM 1,289.52')
    expect(card('To bill')).toHaveTextContent('1 expense not yet billed · 2 companies')
    expect(card('Billed')).toHaveTextContent('RM 10,286.80')
    expect(card('Billed')).toHaveTextContent('5 invoices · 2 expenses')
    expect(card('HV own share')).toHaveTextContent('RM 1,971.54')
    expect(card('HV own share')).toHaveTextContent('kept by HV · not billed')
    expect(JSON.parse(screen.getByTestId('tabs').textContent ?? '{}')).toEqual({ period: '2026-09', txns: 3, invoices: 5, companies: ['2990', 'CAR', 'HK'] })
  })

  it('rests the To bill card when every allocation is billed, and says so when nothing is allocated yet', async () => {
    database(TXNS.slice(0, 2))
    const { unmount } = render(await page())
    expect(card('To bill')).not.toHaveAttribute('data-tone')
    expect(card('To bill')).toHaveTextContent('RM 0.00')
    expect(card('To bill')).toHaveTextContent('every allocation billed')
    unmount()
    database([], [])
    render(await page('2026-10'))
    expect(card('Allocated · October')).toHaveTextContent('RM 0.00')
    expect(card('Allocated · October')).toHaveTextContent('nothing allocated yet')
    expect(card('Billed')).toHaveTextContent('no invoices')
  })
})
