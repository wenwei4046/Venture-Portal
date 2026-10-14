import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// An allocation's full page (2026-10-14, the Finance revamp v2 — the drawer's
// View full page ↗, drawn as D06 draws a record's full page): the way back and
// the crumb, *Allocation · {batch}*, the number with billed / to bill, the
// facts; the expense, the split by company with the billable total, the audit
// log; the dark panel with the split and what Finance may do — once billed its
// invoices, before that Generate invoices (asked first), Correct, ⋯ Delete.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), push: vi.fn(), refresh: vi.fn(), flash: vi.fn(),
  deleteAllocTxn: vi.fn(), generateAllocatorInvoices: vi.fn(), rpc: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('../actions', () => ({ deleteAllocTxn: mocks.deleteAllocTxn, generateAllocatorInvoices: mocks.generateAllocatorInvoices }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; className?: string; children: React.ReactNode }) => <a href={p.href} className={p.className}>{p.children}</a> }))

import AllocationRecordPage from './page'

const line = (company_id: string | null, department_id: string | null, method_detail: string, amount: number, is_own_share = false) =>
  ({ company_id, department_id, method_detail, amount, is_own_share })

// September's rental, billed under ALC-202609 — the shares add up to the amount.
const BILLED = {
  id: 't1', txn_no: 'ALC-202609-001', period_month: '2026-09-01', description: 'Office Rental', amount: 9535.48, method: 'headcount',
  category_id: 'cat-rent', hc_period: '2026-09-01', billed_ref: 'ALC-202609', created_by: 'u-aina', created_at: '2026-09-03T02:00:00Z',
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
  category_id: 'cat-web', hc_period: null, billed_ref: 'ALC-202609-4', created_by: null, created_at: '2026-09-12T02:00:00Z',
  alloc_txn_details: [line(null, null, '40% (own)', 859.68, true), line('co-2990', null, '20%', 429.84), line('co-car', null, '40%', 859.68)],
}
const AUDIT = [
  { id: 1, occurred_at: '2026-09-03T02:00:00Z', actor_id: 'u-aina', actor_name: 'Aina', actor_source: 'portal', table_name: 'alloc_txns', row_key: 't1', op: 'INSERT', old_row: null, new_row: { txn_no: 'ALC-202609-001', amount: 9535.48, description: 'Office Rental' }, changed: null, masked: null, txid: 1 },
  { id: 2, occurred_at: '2026-09-30T08:15:00Z', actor_id: 'u-aina', actor_name: 'Aina', actor_source: 'portal', table_name: 'alloc_txns', row_key: 't1', op: 'UPDATE', old_row: { billed_ref: null }, new_row: { billed_ref: 'ALC-202609' }, changed: ['billed_ref'], masked: null, txid: 2 },
]

function database(txn: typeof BILLED | typeof OPEN | null, invoices: typeof BATCH, audit: unknown[] = AUDIT) {
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
      maybeSingle: async () => ({
        data: table === 'alloc_categories' ? (txn?.category_id === 'cat-rent' ? { name: 'Rental', coa_code: '7012' } : { name: 'Website & Software', coa_code: null }) : table === 'users' ? { name: 'Aina' } : null,
        error: null,
      }),
      then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.rpc.mockReturnValue(Promise.resolve({ data: audit, error: null }))
  mocks.createClient.mockResolvedValue({ from, rpc: mocks.rpc })
}

const page = (id = 't1') => AllocationRecordPage({ params: Promise.resolve({ id }) })
const card = (title: string) => screen.getByRole('region', { name: title })
const panel = () => document.querySelector('aside') as HTMLElement
const dialog = () => [...document.querySelectorAll('[data-fin-dialog] [role="dialog"]')].pop() as HTMLElement
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['billing'] }))
  mocks.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
})

describe('an allocation’s full page', () => {
  it('heads with the way back, the crumb, the batch, the number billed, and the facts', async () => {
    database(BILLED, BATCH)
    render(await page())
    expect(screen.getByRole('link', { name: '← Billing Allocator' })).toHaveAttribute('href', '/billing-allocator?period=2026-09')
    expect(screen.getByText('Daily · Billing Allocator · ALC-202609-001')).toBeInTheDocument()
    expect(screen.getByText('Allocation · ALC-202609')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ALC-202609-001')
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveTextContent('billed')
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveAttribute('data-tone', 'ledger')
    const facts = document.querySelector('[class*="facts"]') as HTMLElement
    for (const [label, value] of [['Amount', 'RM 9,535.48'], ['Expense', 'Office Rental'], ['Date', '03 Sep 2026'], ['Created by', 'Aina · 03 Sep 2026 · 10:00']]) {
      expect(within(facts).getByText(label).nextElementSibling).toHaveTextContent(value)
    }
  })

  it('draws the expense, the split by company with the billable total, and the audit log', async () => {
    database(BILLED, BATCH)
    render(await page())
    expect(card('Expense')).toHaveTextContent('Office RentalCategory7012 · RentalDate03 Sep 2026BatchALC-202609')
    const rows = [...card('Split by company').querySelectorAll('[class*="tRow"]')].map((r) => r.textContent)
    expect(rows).toEqual([
      'Marketing12 staff · 49.8% · billed · HV-INV-202609-0013RM 4,745.00',
      'CAR9.5 staff · 38.6% · billed · HV-INV-202609-0008RM 3,681.57',
      '29902 staff · 7.8% · billed · HV-INV-202609-0007RM 742.32',
      'HV own (not billed)1 staff · 3.8% · keptRM 366.59',
    ])
    expect(card('Split by company')).toHaveTextContent('Billable totalRM 9,168.89')
    expect(mocks.rpc).toHaveBeenCalledWith('audit_changes', { p_tables: ['alloc_txns'], p_row: 't1', p_limit: 60 })
    expect(card('Audit log')).toHaveTextContent('2 EVENTS')
    expect([...card('Audit log').querySelectorAll('[class*="aRow"]')].map((r) => r.textContent)).toEqual([
      '30 Sep 2026 · 16:15AinaBilled under ALC-202609',
      '03 Sep 2026 · 10:00AinaRecorded ALC-202609-001 · RM 9,535.48 · Office Rental',
    ])
  })

  it('once billed, the panel opens its invoices and offers nothing else', async () => {
    database(BILLED, BATCH)
    render(await page())
    expect(panel()).toHaveTextContent('Allocation')
    expect(panel()).toHaveTextContent('MethodHeadcount')
    expect(panel()).toHaveTextContent('Headcount fromSep 2026 snapshot')
    expect(panel()).toHaveTextContent('Companies3')
    expect(panel()).toHaveTextContent('Invoices3 invoicesALC-202609')
    expect(within(panel()).queryByRole('button', { name: /Generate|More/ })).toBeNull()
    fireEvent.click(within(panel()).getByRole('button', { name: 'View invoices · 3' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /HV-INV-202609-0013/ }))
    expect(mocks.push).toHaveBeenCalledWith('/invoices/i13')
  })

  it('before billing: Generate invoices asks first; Correct goes back to Calculate; ⋯ deletes it, asked first', async () => {
    database(OPEN, [])
    mocks.generateAllocatorInvoices.mockResolvedValue({ created: [{ company: '2990', invoiceNo: 'HV-INV-202609-0041' }], skipped: [] })
    mocks.deleteAllocTxn.mockResolvedValue({})
    render(await page('t6'))
    expect(screen.getByText('Allocation · not billed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveAttribute('data-tone', 'alert')
    expect(within(panel()).getByRole('link', { name: 'Correct' })).toHaveAttribute('href', '/billing-allocator?period=2026-09&edit=t6')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Generate invoices' }))
    expect(dialog()).toHaveTextContent('Bills every allocation of September 2026 not yet billed — this one with them — as one draft invoice a company.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate invoices' }))
    await flush()
    expect(mocks.generateAllocatorInvoices).toHaveBeenCalledWith('2026-09')
    expect(mocks.flash).toHaveBeenCalledWith('Invoice generated · HV-INV-202609-0041')
    expect(mocks.refresh).toHaveBeenCalled()

    fireEvent.click(within(panel()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: 'Delete allocation' }))
    // The question that was asked before is still playing out its close, so find this one by its title.
    const del = screen.getByRole('dialog', { name: 'Delete ALC-202609-006?' })
    expect(del).toHaveTextContent('Removes the allocation before any invoice is made.')
    fireEvent.click(within(del).getByRole('button', { name: 'Delete' }))
    await flush()
    expect(mocks.deleteAllocTxn).toHaveBeenCalledWith('t6')
    expect(mocks.push).toHaveBeenCalledWith('/billing-allocator?period=2026-09')
  })

  it('says why when a step is refused', async () => {
    database(OPEN, [])
    mocks.deleteAllocTxn.mockResolvedValue({ error: 'ALC-202609-006 is billed under ALC-202609-5 (HV-INV-202609-0050 · draft). Delete that batch’s drafts — or void its issued invoices — on Invoice first.' })
    render(await page('t6'))
    fireEvent.click(within(panel()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: 'Delete allocation' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await flush()
    expect(dialog()).toHaveTextContent('Delete that batch’s drafts — or void its issued invoices — on Invoice first.')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('shows a reader who may only look the record and no steps, and 404s a record that is not there', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['billing'], actions: {} })
    database(OPEN, [], [])
    render(await page('t6'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ALC-202609-006')
    expect(within(panel()).queryAllByRole('button')).toHaveLength(0)
    expect(within(panel()).queryByRole('link')).toBeNull()
    expect(card('Audit log')).toHaveTextContent('No change on record.')
    database(null, [])
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFound).toHaveBeenCalled()
  })
})
