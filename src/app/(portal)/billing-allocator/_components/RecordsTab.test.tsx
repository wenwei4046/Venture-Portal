import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, TxnRow } from './types'

// 2026-10-07 — the allocator's Records on the sheet; 2026-10-09 — the user's
// Claude Design handoff (照设计档): the month's records with the split as ONE
// column of text, the batch and the status as chips, a record opening its own
// page on a double-click, then a By company table with each target's share,
// what is billed, what is still to bill and its invoices. 2026-10-10 — the
// handoff's notice for what is still to bill (its Generate invoices is the
// page head's, AllocGenerateButton), "N EXPENSES · MONTH", a Total row and an
// All companies row, and on a phone the record titled by its Txn.

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), deleteAllocTxn: vi.fn(), generateAllocatorInvoices: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
vi.mock('../actions', () => ({
  deleteAllocTxn: mocks.deleteAllocTxn,
  generateAllocatorInvoices: mocks.generateAllocatorInvoices,
}))

import RecordsTab from './RecordsTab'

const d = (companyId: string | null, companyLabel: string, amount: number, detail = 'Head: 1.00/48.00 (2026-09)') => ({
  companyId,
  companyLabel,
  detail,
  amount,
  isOwnShare: companyId === null,
})

const TXNS: TxnRow[] = [
  {
    id: 't1', txnNo: 'ALC-202609-001', description: 'Office Rental', amount: 18980, method: 'headcount',
    categoryId: 'cat-rent', categoryName: 'Rental', hcPeriod: '2026-09', billedRef: 'ALC-202609', locked: true, createdAt: '2026-09-03T02:00:00Z',
    details: [d(null, 'HOUZS Venture (own)', 366.59), d('co-2990', '2990', 742.32), d('co-car', 'CAR', 3681.57), d('dept:mkt', 'Marketing (dept)', 4745)],
  },
  {
    id: 't5', txnNo: 'ALC-202609-005', description: 'AI TOOLS - JUL26', amount: 1863.18, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, billedRef: 'ALC-202609-3', locked: true, createdAt: '2026-09-10T02:00:00Z',
    details: [d(null, 'HOUZS Venture (own)', 745.27, '40% (own)'), d('co-2990', '2990', 372.64, '20%'), d('co-car', 'CAR', 745.27, '40%')],
  },
  {
    id: 't6', txnNo: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", amount: 2149.2, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, billedRef: 'ALC-202609-4', locked: false, createdAt: '2026-09-12T02:00:00Z',
    details: [d(null, 'HOUZS Venture (own)', 859.68, '40% (own)'), d('co-2990', '2990', 429.84, '20%'), d('co-car', 'CAR', 859.68, '40%')],
  },
]

const INVOICES = [
  { id: 'i7', invoiceNo: 'HV-INV-202609-0007', companyId: 'co-2990', companyLabel: '2990', status: 'issued' },
  { id: 'i8', invoiceNo: 'HV-INV-202609-0008', companyId: 'co-car', companyLabel: 'CAR', status: 'paid' },
  { id: 'i13', invoiceNo: 'HV-INV-202609-0013', companyId: 'dept:mkt', companyLabel: 'Marketing (dept)', status: 'paid' },
  { id: 'i30', invoiceNo: 'HV-INV-202609-0030', companyId: 'co-2990', companyLabel: '2990', status: 'issued' },
  { id: 'i31', invoiceNo: 'HV-INV-202609-0031', companyId: 'co-car', companyLabel: 'CAR', status: 'paid' },
]

function data(txns: TxnRow[] = TXNS): AllocatorData {
  return {
    period: '2026-09',
    companies: [{ id: 'co-2990', label: '2990' }, { id: 'co-car', label: 'CAR' }, { id: 'co-hk', label: 'HK' }],
    companySettings: [],
    departments: [{ id: 'dept:mkt', label: 'Marketing (dept)' }],
    staff: [],
    snapshotPeriods: [],
    hrPeriods: [],
    snapshotSplitsByPeriod: {},
    coaAccounts: [],
    categories: [],
    templates: [],
    txns,
    invoices: txns.length > 0 ? INVOICES : [],
  }
}

const row = (text: string) => screen.getByText(text).closest('tr') as HTMLTableRowElement
const head = (title: string) => screen.getByRole('heading', { name: title }).closest('.sect-head') as HTMLElement
const tableOf = (title: string) => head(title).nextElementSibling?.querySelector('table') as HTMLTableElement
// The sort glyph after a header's label is not the label, and the phone's
// chevron cell is not a column.
const headers = (table: HTMLTableElement) =>
  Array.from(table.querySelectorAll('thead th:not(.lt-toggle)')).map((th) => th.textContent?.replace(/[▲▼↕]/g, '').trim())

beforeEach(() => vi.clearAllMocks())

describe('the allocator’s Records on the sheet', () => {
  it('heads the month’s expenses; no notice repeats what the head’s To bill card says', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    expect(head('Allocations').querySelector('.count')).toHaveTextContent('3 EXPENSES · SEPTEMBER 2026')
    // 2026-10-12 (the user: the descriptions clutter the view) — the To bill
    // card above the tabs carries the figure.
    expect(document.querySelector('.bil-notice')).toBeNull()
    expect(screen.queryByText(/Generate invoices bills every company/)).toBeNull()
    // The button is the page head's now.
    expect(screen.queryByRole('button', { name: /Generate/ })).toBeNull()
  })

  it('ends the records on a Total row under the Amount', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    const table = tableOf('Allocations')
    const ths = Array.from(table.querySelectorAll('thead th')) as HTMLElement[]
    const foot = Array.from(table.querySelectorAll('tfoot td')) as HTMLElement[]
    expect(foot[ths.findIndex((th) => th.dataset.col === 'txn_no')]).toHaveTextContent('Total')
    expect(foot[ths.findIndex((th) => th.dataset.col === 'amount')]).toHaveTextContent('RM 22,992.38')
  })

  it('on a phone titles a record by its Txn, the description as small print', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    const table = tableOf('Allocations')
    expect(table.querySelector('thead th[data-col="txn_no"]')).not.toHaveClass('m-hide')
    expect(table.querySelector('thead th[data-col="description"]')).toHaveClass('m-hide')
    const txn = within(table).getAllByText('ALC-202609-001')[0].closest('td') as HTMLElement
    expect(txn.querySelector('.q-sub')).toHaveTextContent('Office Rental')
  })

  it('shows the split as one column of text, the batch and the status as chips', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    expect(headers(tableOf('Allocations'))).toEqual(['Txn', 'Description', 'Amount', 'Split', 'Category', 'Batch', 'Status', ''])
    const rental = row('Office Rental')
    expect(rental).toHaveTextContent('ALC-202609-001')
    expect(rental).toHaveTextContent('RM 18,980.00')
    expect(rental).toHaveTextContent('2990 3.9% · CAR 19.4% · Marketing 25.0%')
    expect(rental).toHaveTextContent('Rental')
    expect(within(rental).getAllByText('ALC-202609')[0].closest('.chip')).toHaveClass('ledger')
    expect(within(rental).getAllByText('billed')[0].closest('.chip')).toHaveClass('ledger')
    const open = row("AI TOOLS-SEP'2026")
    expect(within(open).getAllByText('not billed')[0].closest('.chip')).toHaveClass('alert')
    expect(within(open).getAllByText('to bill')[0].closest('.chip')).toHaveClass('alert')
    expect(document.querySelector('.st-box table')).not.toBeNull()
  })

  it('opens a record’s own page on a double-click, and offers it in the menu', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    fireEvent.doubleClick(row('Office Rental'))
    expect(mocks.push).toHaveBeenCalledWith('/billing-allocator/t1')
    fireEvent.contextMenu(row("AI TOOLS-SEP'2026"))
    // Open says nothing of the double-click (2026-10-12, no usage hints).
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['打开', '在新分页打开', 'Edit in Calculate', 'Delete'])
  })

  it('lets the unbilled be corrected or deleted; a billed record is locked', () => {
    const onEdit = vi.fn()
    render(<RecordsTab data={data()} onEdit={onEdit} />)
    expect(within(row('Office Rental')).getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(within(row('Office Rental')).getByRole('button', { name: 'Delete' })).toBeDisabled()
    const open = row("AI TOOLS-SEP'2026")
    expect(within(open).getByRole('button', { name: 'Delete' })).toBeEnabled()
    fireEvent.click(within(open).getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 't6' }))
  })

  it('sums each target: its share, what is billed, what is to bill, and its invoices', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    expect(head('By company').querySelector('.count')).toHaveTextContent('2 COMPANIES · 1 DEPARTMENT · HV OWN')
    const table = tableOf('By company')
    expect(headers(table)).toEqual(['Bill to', 'Share', 'Billed', 'To bill', 'Invoices'])
    const car = within(table).getByText('CAR').closest('tr') as HTMLElement
    expect(car).toHaveTextContent('RM 5,286.52')
    expect(car).toHaveTextContent('RM 4,426.84')
    expect(car).toHaveTextContent('RM 859.68')
    expect(within(car).getByRole('link', { name: '0008 paid' })).toHaveAttribute('href', '/billing/invoice-doc?id=i8')
    expect(within(car).getByRole('link', { name: '0008 paid' })).toHaveClass('ledger')
    const co = within(table).getByText('2990').closest('tr') as HTMLElement
    expect(within(co).getByRole('link', { name: '0007 issued' })).toHaveClass('alert')
    const mkt = within(table).getByText('Marketing').closest('tr') as HTMLElement
    expect(mkt).toHaveTextContent('dept pool')
    expect(within(mkt).getAllByText('—')).toHaveLength(1) // nothing left to bill
    const own = within(table).getByText('HV own').closest('tr') as HTMLElement
    expect(own).toHaveTextContent('RM 1,971.54')
    expect(own).toHaveTextContent('not billed')
    // The handoff's All companies row, each total under its column.
    const ths = Array.from(table.querySelectorAll('thead th')) as HTMLElement[]
    const foot = Array.from(table.querySelectorAll('tfoot td')) as HTMLElement[]
    const at = (col: string) => foot[ths.findIndex((th) => th.dataset.col === col)]
    expect(at('target')).toHaveTextContent('All companies')
    expect(at('share')).toHaveTextContent('RM 11,576.32')
    expect(at('billed')).toHaveTextContent('RM 10,286.80')
    expect(at('toBill')).toHaveTextContent('RM 1,289.52')
    expect(at('invoices')).toHaveTextContent('5 invoices · 3 paid · 2 issued')
  })

  it('keeps the notice away when every allocation is billed, and says so when the month has none', () => {
    const { unmount } = render(<RecordsTab data={data(TXNS.filter((t) => t.locked))} onEdit={vi.fn()} />)
    expect(document.querySelector('.bil-notice')).toBeNull()
    expect(head('Allocations').querySelector('.count')).toHaveTextContent('2 EXPENSES · SEPTEMBER 2026')
    unmount()
    render(<RecordsTab data={data([])} onEdit={vi.fn()} />)
    expect(screen.getByText(/No allocations for September 2026 yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
