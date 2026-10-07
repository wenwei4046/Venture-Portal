import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, TxnRow } from './types'

// 2026-10-07 — the allocator's Records on the sheet (the user approved the
// allocator sample and picked 每家一栏): a strip for what still has to be
// billed, the month's records with the split as one column per company and
// the batch as a chip, then a By company table with each target's share,
// what is billed, what is still to bill and its invoices.

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), deleteAllocTxn: vi.fn(), generateAllocatorInvoices: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
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
    categoryId: 'cat-rent', categoryName: 'Rental', hcPeriod: '2026-09', billedRef: 'ALC-202609', locked: true,
    details: [d(null, 'HOUZS Venture (own)', 366.59), d('co-2990', '2990', 742.32), d('co-car', 'CAR', 3681.57), d('dept:mkt', 'Marketing (dept)', 4745)],
  },
  {
    id: 't5', txnNo: 'ALC-202609-005', description: 'AI TOOLS - JUL26', amount: 1863.18, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, billedRef: 'ALC-202609-3', locked: true,
    details: [d(null, 'HOUZS Venture (own)', 745.27, '40% (own)'), d('co-2990', '2990', 372.64, '20%'), d('co-car', 'CAR', 745.27, '40%')],
  },
  {
    id: 't6', txnNo: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", amount: 2149.2, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, billedRef: 'ALC-202609-4', locked: false,
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
  it('heads the month’s records and says what still has to be billed', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    expect(head('Allocations').querySelector('.count')).toHaveTextContent('3 RECORDS · SEPTEMBER 2026 · 2 BILLED')
    const strip = screen.getByRole('region', { name: 'To bill' })
    expect(strip).toHaveTextContent('1 expense not yet billed')
    expect(strip).toHaveTextContent('RM 1,289.52')
    expect(strip).toHaveTextContent('2 companies')
    expect(within(strip).getByRole('button', { name: 'Generate draft invoices →' })).toBeEnabled()
  })

  it('lays the split out as one column per company, HV own last, a dash where a record gives a company nothing', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    expect(headers(tableOf('Allocations'))).toEqual(['Txn', 'Description', 'Amount', '2990', 'CAR', 'Marketing', 'HV own', 'Batch', ''])
    const rental = row('Office Rental')
    expect(rental).toHaveTextContent('ALC-202609-001')
    expect(rental).toHaveTextContent('RM 18,980.00')
    expect(within(rental).getByText('3,681.57')).toBeInTheDocument()
    expect(within(rental).getByText('4,745.00')).toBeInTheDocument()
    expect(within(rental).getByText('366.59').closest('td')).toHaveClass('own')
    const tools = row('AI TOOLS - JUL26')
    expect(within(tools).getAllByText('—')).toHaveLength(1) // nothing for Marketing
    expect(within(tools).getByText('372.64')).toBeInTheDocument()
  })

  it('tags each record with its batch, or that it is not billed', () => {
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    // The chip is in the Batch column and again in the phone's small print.
    const chips = (r: HTMLElement, text: string) => within(r).getAllByText(text).map((e) => e.closest('.chip'))
    expect(chips(row('Office Rental'), 'ALC-202609')).toHaveLength(2)
    for (const chip of chips(row('Office Rental'), 'ALC-202609')) expect(chip).toHaveClass('ledger')
    expect(chips(row('AI TOOLS - JUL26'), 'ALC-202609-3')[0]).toHaveClass('ledger')
    for (const chip of chips(row("AI TOOLS-SEP'2026"), 'not billed')) expect(chip).toHaveClass('alert')
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
    const foot = table.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('Billable RM 11,576.32')
    expect(foot).toHaveTextContent('billed RM 10,286.80')
    expect(foot).toHaveTextContent('to bill RM 1,289.52')
    expect(foot).toHaveTextContent('5 invoices · 3 paid · 2 issued')
  })

  it('raises the drafts for what is unbilled and reports them', async () => {
    mocks.generateAllocatorInvoices.mockResolvedValue({
      created: [{ company: '2990', invoiceNo: 'HV-INV-202609-0041' }, { company: 'CAR', invoiceNo: 'HV-INV-202609-0042' }],
      skipped: [],
    })
    render(<RecordsTab data={data()} onEdit={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate draft invoices →' }))
    })
    expect(mocks.generateAllocatorInvoices).toHaveBeenCalledWith('2026-09')
    expect(await screen.findByText('✓ 2990 → HV-INV-202609-0041')).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('keeps the strip away when every allocation is billed, and says so when the month has none', () => {
    const { unmount } = render(<RecordsTab data={data(TXNS.filter((t) => t.locked))} onEdit={vi.fn()} />)
    expect(screen.queryByRole('region', { name: 'To bill' })).toBeNull()
    expect(head('Allocations').querySelector('.count')).toHaveTextContent('2 RECORDS · SEPTEMBER 2026 · ALL BILLED')
    unmount()
    render(<RecordsTab data={data([])} onEdit={vi.fn()} />)
    expect(screen.getByText(/No allocations for September 2026 yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
