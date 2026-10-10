import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — an allocation's own page (the user's Claude Design handoff,
// 照设计档): the record's number as the title with its status chip, the batch
// in the eyebrow, four cards — the amount, what is billable, HV's own share,
// billed or to bill — its details in groups, the split by company, and what
// Finance can do: open the invoices once billed; before that, generate them,
// correct the record in Calculate, or delete it.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), push: vi.fn(), refresh: vi.fn(),
  deleteAllocTxn: vi.fn(), generateAllocatorInvoices: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('../actions', () => ({ deleteAllocTxn: mocks.deleteAllocTxn, generateAllocatorInvoices: mocks.generateAllocatorInvoices }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))

import AllocationRecordPage from './page'

const line = (company_id: string | null, department_id: string | null, method_detail: string, amount: number, is_own_share = false) =>
  ({ company_id, department_id, method_detail, amount, is_own_share })

// September's rental, billed under ALC-202609 — the shares add up to the amount.
const BILLED = {
  id: 't1', txn_no: 'ALC-202609-001', period_month: '2026-09-01', description: 'Office Rental', amount: 9535.48, method: 'headcount',
  category_id: 'cat-rent', hc_period: '2026-09-01', billed_ref: 'ALC-202609', created_at: '2026-09-03T02:00:00Z',
  alloc_txn_details: [
    line('co-car', null, 'Head: 9.50/48.00 (2026-09)', 3681.57),
    line(null, null, 'Head: 1.00/48.00 (2026-09)', 366.59, true),
    line('co-2990', null, 'Head: 2.00/48.00 (2026-09)', 742.32),
    line(null, 'mkt', 'Head: 12.00/48.00 (2026-09)', 4745),
  ],
}
const BATCH = [
  { id: 'i7', invoice_no: 'HV-INV-202609-0007', company_id: 'co-2990', billable_to_department_id: null, status: 'issued' },
  { id: 'i8', invoice_no: 'HV-INV-202609-0008', company_id: 'co-car', billable_to_department_id: null, status: 'paid' },
  { id: 'i13', invoice_no: 'HV-INV-202609-0013', company_id: null, billable_to_department_id: 'mkt', status: 'paid' },
]
// A third expense whose batch was voided — not billed.
const OPEN = {
  id: 't6', txn_no: 'ALC-202609-006', period_month: '2026-09-01', description: "AI TOOLS-SEP'2026", amount: 2149.2, method: 'percentage',
  category_id: 'cat-web', hc_period: null, billed_ref: 'ALC-202609-4', created_at: '2026-09-12T02:00:00Z',
  alloc_txn_details: [line(null, null, '40% (own)', 859.68, true), line('co-2990', null, '20%', 429.84), line('co-car', null, '40%', 859.68)],
}

function database(txn: typeof BILLED | typeof OPEN | null, invoices: typeof BATCH) {
  const from = vi.fn((table: string) => {
    const list =
      table === 'companies' ? [{ id: 'co-2990', short_code: '2990', name: 'Two Nine Nine Zero' }, { id: 'co-car', short_code: 'CAR', name: 'Carres' }]
      : table === 'departments' ? [{ id: 'mkt', name: 'Marketing' }]
      : table === 'invoices' ? invoices
      : []
    const result = { data: list, error: null }
    const q = {
      select: () => q, eq: () => q, neq: () => q, order: () => q,
      single: async () => (table === 'alloc_txns' ? { data: txn, error: txn ? null : { message: 'no rows' } } : { data: null, error: null }),
      maybeSingle: async () => ({ data: table === 'alloc_categories' ? { name: txn?.category_id === 'cat-rent' ? 'Rental' : 'Website & Software' } : null, error: null }),
      then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const page = (id = 't1') => AllocationRecordPage({ params: Promise.resolve({ id }) })
const card = (name: string) => screen.getByRole('group', { name })
const tableOf = (title: string) =>
  (screen.getByRole('heading', { name: title }).closest('.sect-head') as HTMLElement).nextElementSibling?.querySelector('table') as HTMLTableElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['billing'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
})

describe('an allocation’s own page', () => {
  it('heads with the number, its batch and status, the way back; four cards; the details; the split by company', async () => {
    database(BILLED, BATCH)
    render(await page())
    expect(screen.getByRole('link', { name: '← Back to Billing Allocator' })).toHaveAttribute('href', '/billing-allocator?period=2026-09')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ALC-202609-001')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('BILLING · ALLOCATOR · ALC-202609')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('billed')
    expect(document.querySelector('.page-head .chip')).toHaveClass('ledger')
    expect(screen.getByText('Office Rental · 3 Sep 2026')).toBeInTheDocument()

    expect(card('Amount')).toHaveAttribute('data-tone', 'primary')
    expect(card('Amount')).toHaveTextContent('RM 9,535.48')
    expect(card('Billable')).toHaveTextContent('RM 9,168.89')
    expect(card('Billable')).toHaveTextContent('3 companies')
    expect(card('HV own share')).toHaveTextContent('RM 366.59')
    expect(card('Billed')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Billed')).toHaveTextContent('RM 9,168.89')
    expect(card('Billed')).toHaveTextContent('3 invoices · ALC-202609')

    const details = screen.getByRole('region', { name: 'Details' })
    for (const text of ['Office Rental', 'Rental', 'Headcount', 'Sep 2026', '3 Sep 2026', 'ALC-202609', '3', 'HV-INV-202609-0007 · HV-INV-202609-0008 · HV-INV-202609-0013']) {
      expect(within(details).getAllByText(text).length, text).toBeGreaterThan(0)
    }

    const table = tableOf('Split by company')
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Bill to', 'Basis', 'Share %', 'Amount', 'Status'])
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
    expect(rows).toEqual(['Marketingdept pool', 'CARsubsidiary', '2990subsidiary', 'HV own (not billed)kept by HV'])
    const car = within(table).getByText('CAR').closest('tr') as HTMLElement
    expect(car).toHaveTextContent('Head: 9.50/48.00 (2026-09)')
    expect(car).toHaveTextContent('38.6%')
    expect(car).toHaveTextContent('RM 3,681.57')
    expect(within(car).getByText('billed').closest('.chip')).toHaveClass('ledger')
    const own = within(table).getByText('HV own (not billed)').closest('tr') as HTMLElement
    expect(within(own).getByText('kept').closest('.chip')).toHaveClass('info')
    expect(table.querySelector('tfoot')).toHaveTextContent('Billable total · HV own left out')
    expect(table.querySelector('tfoot')).toHaveTextContent('RM 9,168.89')
  })

  it('once billed, opens the batch’s invoices and offers nothing else', async () => {
    database(BILLED, BATCH)
    render(await page())
    expect(screen.getByRole('link', { name: 'View HV-INV-202609-0008 · CAR' })).toHaveAttribute('href', '/billing/invoice-doc?id=i8')
    expect(screen.getByRole('link', { name: 'View HV-INV-202609-0013 · Marketing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete|Generate/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Correct this record' })).toBeNull()
    expect(screen.getByText(/^Billed — /)).toBeInTheDocument()
  })

  it('before billing, generates the invoices, sends the record back to Calculate, or deletes it', async () => {
    database(OPEN, [])
    mocks.deleteAllocTxn.mockResolvedValue({})
    mocks.generateAllocatorInvoices.mockResolvedValue({ created: [{ company: '2990', invoiceNo: 'HV-INV-202609-0041' }], skipped: [] })
    // happy-dom has no confirm(); Delete asks before it acts.
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    render(await page('t6'))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('BILLING · ALLOCATOR · NOT BILLED')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('to bill')
    expect(document.querySelector('.page-head .chip')).toHaveClass('alert')
    expect(card('To bill')).toHaveAttribute('data-tone', 'alert')
    expect(card('To bill')).toHaveTextContent('RM 1,289.52')
    expect(card('To bill')).toHaveTextContent('Not invoiced yet')
    expect(screen.getByRole('link', { name: 'Correct this record' })).toHaveAttribute('href', '/billing-allocator?period=2026-09&edit=t6')
    expect(screen.getByText(/^Not billed yet\./)).toBeInTheDocument()
    // 2026-10-10 — the handoff: Generate invoices is the page head's primary,
    // not one of the Actions panel's buttons.
    const head = document.querySelector('.page-head') as HTMLElement
    expect(within(head).getByRole('button', { name: 'Generate invoices' })).toBeInTheDocument()
    expect(within(document.querySelector('.fin-actions') as HTMLElement).queryByRole('button', { name: 'Generate invoices' })).toBeNull()

    await act(async () => { fireEvent.click(within(head).getByRole('button', { name: 'Generate invoices' })) })
    expect(mocks.generateAllocatorInvoices).toHaveBeenCalledWith('2026-09')
    expect(await screen.findByText('✓ 2990 → HV-INV-202609-0041')).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('ALC-202609-006'))
    expect(mocks.deleteAllocTxn).toHaveBeenCalledWith('t6')
    expect(mocks.push).toHaveBeenCalledWith('/billing-allocator?period=2026-09')
    vi.unstubAllGlobals()
  })

  it('shows a reader without Billing · Edit the record but no actions, and 404s a record that is not there', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['billing'], actions: {} })
    database(OPEN, [])
    render(await page('t6'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ALC-202609-006')
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull()
    database(null, [])
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFound).toHaveBeenCalled()
  })
})
