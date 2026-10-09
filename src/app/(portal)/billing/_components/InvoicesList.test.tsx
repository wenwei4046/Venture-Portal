import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import InvoicesList from './InvoicesList'
import { FinViewProvider } from '@/components/layout/fin-view'

/**
 * The batch selection belongs to the month on screen. Changing the month is a
 * query-string navigation that keeps this list mounted, so a selection made
 * in one month used to survive into the next — invisible in the checkboxes
 * (different rows) but still counted, and 打印所选 printed the old ids.
 */
// The three dialogs are stand-ins that say which invoice they were opened for,
// and whether they arrived open and without a trigger of their own.
type DialogProps = { invoiceNo?: string | null; autoOpen?: boolean; hideTrigger?: boolean; status?: string; settled?: boolean }
const { push, refresh, copyInvoice, deleteDraftInvoice, dialog } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  copyInvoice: vi.fn(async (_fd: FormData) => undefined),
  deleteDraftInvoice: vi.fn(async (_fd: FormData) => undefined),
  dialog: (name: string) =>
    function Dialog(p: DialogProps) {
      return (
        <div data-testid={name} data-auto={String(!!p.autoOpen)} data-hide={String(!!p.hideTrigger)} data-status={p.status ?? ''} data-settled={String(!!p.settled)}>
          {p.invoiceNo}
        </div>
      )
    },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('../actions', () => ({
  settleInvoicesConsolidated: vi.fn(),
  voidIssuedInvoices: vi.fn(),
  copyInvoice,
  deleteDraftInvoice,
}))
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
vi.mock('./InvoiceActions', () => ({
  ApproveInvoiceButton: ({ id }: { id: string }) => <button type="button">Approve {id}</button>,
  BulkIssueInvoicesButton: () => null,
  EditInvoiceButton: dialog('dialog-edit'),
}))
vi.mock('./CreateCreditNoteButton', () => ({ default: dialog('dialog-cn') }))
vi.mock('./ReassignInvoiceGlButton', () => ({ default: dialog('dialog-gl') }))

function invoice(id: string, invoice_no: string, period_month: string) {
  return {
    id,
    invoice_no,
    company_id: 'co-hc',
    period_month,
    billing_mode: 'hr_attribution',
    total_amount: 1000,
    status: 'issued',
    // Widened so a dept_pool variant can be spread from this helper.
    billable_to_type: 'subsidiary' as 'subsidiary' | 'dept_pool',
  }
}

const companyMap = new Map([['co-hc', { name: 'HOUZS Century', code: 'HC' }]])
const departmentMap = new Map<string, string>()

const banks = [{ id: 'bank-hl', bank_name: 'Hong Leong', account_number: '1234' }]

function list(period: string, rows: ReturnType<typeof invoice>[]) {
  return (
    <InvoicesList
      invoices={rows}
      companyMap={companyMap}
      departmentMap={departmentMap}
      period={period}
      bankAccounts={banks}
    />
  )
}

beforeEach(() => vi.clearAllMocks())

describe('InvoicesList selection across periods', () => {
  it('drops the selection when the month moves, keeps it on a same-month refresh', () => {
    const sep = invoice('inv-sep', 'INV-SEP-1', '2026-09-01')
    const { rerender } = render(list('2026-09-01', [sep]))
    fireEvent.click(screen.getByLabelText('Select INV-SEP-1'))
    expect(document.querySelector('.bulk-bar')).toHaveTextContent(/^1 selected/)

    // router.refresh() after an action re-renders the same month: keep it.
    rerender(list('2026-09-01', [sep]))
    expect(document.querySelector('.bulk-bar')).toHaveTextContent(/^1 selected/)
    expect(screen.getByLabelText('Select INV-SEP-1')).toBeChecked()

    // › to October: nothing selected there.
    rerender(list('2026-10-01', [invoice('inv-oct', 'INV-OCT-1', '2026-10-01')]))
    expect(document.querySelector('.bulk-bar')).toBeNull()
    expect(screen.getByLabelText('Select INV-OCT-1')).not.toBeChecked()
  })
})

// 2026-09-29: the per-invoice Settle used to be a link to /payments/new, which
// left Billing entirely and ended on the voucher page. It now opens the same
// dialog the batch settle uses, on the row you clicked.
describe('settling one invoice', () => {
  it('opens the dialog in place with that invoice selected', () => {
    render(list('2026-09-01', [invoice('inv-1', 'INV-1', '2026-09-01')]))
    fireEvent.click(screen.getByTitle('就地开收据,不用离开 Billing'))
    expect(screen.getByText(/1 张发票/)).toBeInTheDocument()
    expect(screen.getByLabelText('Select INV-1')).toBeChecked()
  })

  it('sends a dept-pool invoice to the voucher page, with a way back', () => {
    const interBilling = { ...invoice('inv-vo', 'INV-VO', '2026-09-01'), billable_to_type: 'dept_pool' as const }
    render(list('2026-09-01', [interBilling]))
    expect(screen.queryByTitle('就地开收据,不用离开 Billing')).toBeNull()
    const link = screen.getByText('Settle →').closest('a')
    expect(link).toHaveAttribute('href', '/payments/new?invoice_id=inv-vo&return_to=/billing')
  })
})

// 2026-10-02: an issued invoice had six links in its Action cell. The row now
// keeps one, and the rest are on a right-click or the ⋯.
describe('the row menu', () => {
  const issued = invoice('inv-1', 'INV-1', '2026-09-01')
  const draft = { ...invoice('inv-d', 'INV-D', '2026-09-01'), status: 'draft' }
  const paid = { ...invoice('inv-p', 'INV-P', '2026-09-01'), status: 'paid' }
  const row = (no: string) => screen.getByLabelText(`Select ${no}`).closest('tr') as HTMLElement
  const firstRow = () => document.querySelector('tbody tr') as HTMLElement
  const menuLabels = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)

  it('leaves one action and a ⋯ on the row', () => {
    render(list('2026-09-01', [issued]))
    const cells = within(row('INV-1'))
    expect(cells.getByText('Settle →')).toBeInTheDocument()
    expect(cells.getByRole('button', { name: 'Actions for INV-1' })).toBeInTheDocument()
    for (const gone of ['PDF', 'Copy', '+ Credit note', '改 account', '作废']) {
      expect(cells.queryByText(gone)).toBeNull()
    }
  })

  it('a right-click offers what an issued invoice can do', () => {
    render(list('2026-09-01', [issued]))
    fireEvent.contextMenu(row('INV-1'))
    expect(screen.getByRole('menu', { name: 'Actions for INV-1 · issued' })).toBeInTheDocument()
    expect(menuLabels()).toEqual(['打开', 'Settle', 'Edit', 'PDF', 'Copy', '+ Credit note', '改 account', '作废'])
  })

  it('…a draft', () => {
    render(list('2026-09-01', [draft]))
    fireEvent.contextMenu(firstRow())
    expect(menuLabels()).toEqual(['打开', 'Approve & issue', 'Edit', 'PDF', 'Copy', 'Delete'])
  })

  it('…and a paid one', () => {
    render(list('2026-09-01', [paid]))
    fireEvent.contextMenu(firstRow())
    expect(menuLabels()).toEqual(['打开', 'Edit', 'PDF', 'Copy', 'Refund', '+ Credit note', '改 account'])
  })

  it('the ⋯ opens the same menu', () => {
    render(list('2026-09-01', [issued]))
    fireEvent.click(screen.getByRole('button', { name: 'Actions for INV-1' }))
    expect(menuLabels()).toContain('+ Credit note')
  })

  it('opens a dialog for the row that asked, already open and with no trigger of its own', () => {
    render(list('2026-09-01', [issued, { ...invoice('inv-2', 'INV-2', '2026-09-01') }]))
    expect(screen.queryByTestId('dialog-cn')).toBeNull() // not mounted per row any more
    fireEvent.contextMenu(row('INV-2'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Credit note/ }))
    const cn = screen.getByTestId('dialog-cn')
    expect(cn).toHaveTextContent('INV-2')
    expect(cn.dataset.auto).toBe('true')
    expect(cn.dataset.hide).toBe('true')
    expect(screen.queryByRole('menu')).toBeNull() // the menu closed

    fireEvent.contextMenu(row('INV-1'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /改 account/ }))
    expect(screen.getByTestId('dialog-gl')).toHaveTextContent('INV-1')
    expect(screen.queryByTestId('dialog-cn')).toBeNull()
  })

  // 2026-10-07 (user: "invoice edit 我要全部都可以改"): an issued invoice is edited
  // too, and the dialog is told once money has come in against the invoice.
  it('Edit on an issued invoice opens the dialog for it, saying whether money has come in', () => {
    const { unmount } = render(list('2026-09-01', [issued]))
    fireEvent.contextMenu(row('INV-1'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Edit/ }))
    const edit = screen.getByTestId('dialog-edit')
    expect(edit).toHaveTextContent('INV-1')
    expect(edit.dataset.status).toBe('issued')
    expect(edit.dataset.settled).toBe('false')
    unmount()
    // A paid one has no tick box to find it by, so it is the only row.
    render(list('2026-09-01', [paid]))
    fireEvent.contextMenu(firstRow())
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Edit/ }))
    expect(screen.getByTestId('dialog-edit').dataset.settled).toBe('true')
  })

  it('Delete asks first and only then deletes', async () => {
    const ask = vi.fn(() => false)
    vi.stubGlobal('confirm', ask)
    render(list('2026-09-01', [draft]))
    fireEvent.contextMenu(firstRow())
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    expect(ask).toHaveBeenCalledTimes(1)
    expect(deleteDraftInvoice).not.toHaveBeenCalled()

    ask.mockReturnValue(true)
    fireEvent.contextMenu(firstRow())
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    await waitFor(() => expect(deleteDraftInvoice).toHaveBeenCalledTimes(1))
    expect(deleteDraftInvoice.mock.calls[0]![0].get('id')).toBe('inv-d')
    vi.unstubAllGlobals()
  })

  it('says so on the page when an action from the menu fails', async () => {
    const ask = vi.fn(() => true)
    vi.stubGlobal('confirm', ask)
    copyInvoice.mockRejectedValueOnce(new Error('Period is locked'))
    render(list('2026-09-01', [issued]))
    fireEvent.contextMenu(row('INV-1'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Copy/ }))
    expect(await screen.findByText('INV-1: Period is locked')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})

// 2026-10-02: every finance table opens a row on a double-click. Since the
// Finance revamp (2026-10-09, the user's Claude Design handoff) an invoice has
// a page of its own, /invoices/<id>: a double-click, 打开 in the row menu, the
// number in the row and the phone's Open button all go there.
describe('opening an invoice', () => {
  const issued = invoice('inv-1', 'INV-1', '2026-09-01')
  const other = invoice('inv-2', 'INV-2', '2026-09-01')
  const row = (no: string) => screen.getByLabelText(`Select ${no}`).closest('tr') as HTMLElement

  it('a double-click on the row opens its page', () => {
    render(list('2026-09-01', [issued, other]))
    fireEvent.doubleClick(within(row('INV-2')).getByText('HOUZS Century'))
    expect(push).toHaveBeenCalledWith('/invoices/inv-2')
  })

  it('…but not a double-click on its tick box or on its Settle button', () => {
    render(list('2026-09-01', [issued]))
    fireEvent.doubleClick(screen.getByLabelText('Select INV-1'))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Actions for INV-1' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('打开 in the row menu opens the same page, and the number is a link to it', () => {
    render(list('2026-09-01', [issued, other]))
    expect(screen.getByRole('link', { name: 'INV-1' })).toHaveAttribute('href', '/invoices/inv-1')
    fireEvent.contextMenu(row('INV-1'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^打开/ }))
    expect(push).toHaveBeenCalledWith('/invoices/inv-1')
  })
})

// 2026-10-02 (user, on the invoice list: "invoice 没有日期").
describe('the invoice date', () => {
  const early = { ...invoice('inv-1', 'INV-1', '2026-09-01'), invoice_date: '2026-09-30' }
  const late = { ...invoice('inv-2', 'INV-2', '2026-10-01'), invoice_date: '2026-10-02' }
  const firstInvoice = () => document.querySelector('tbody tr')!.querySelector('input[type="checkbox"]')!.getAttribute('aria-label')

  it('has a column of its own, after the number, read from the left', () => {
    render(list('2026-09-01', [early, late]))
    const heads = Array.from(document.querySelectorAll('thead th[data-col]')).map((h) => (h as HTMLElement).dataset.col)
    expect(heads.slice(0, 4)).toEqual(['_select', 'invoice_no', 'invoice_date', 'company'])
    const cell = screen.getByText('30 Sep 2026').closest('td')!
    expect(cell.classList.contains('text-right')).toBe(false)
    expect(screen.getByText('2 Oct 2026')).toBeInTheDocument() // with its year
  })

  it('sorts by the date, not by how the date is written', () => {
    render(list('2026-09-01', [late, early]))
    fireEvent.click(screen.getByText('Date'))
    expect(firstInvoice()).toBe('Select INV-2') // 2 Oct before 30 Sep, newest first
    fireEvent.click(screen.getByText('Date'))
    expect(firstInvoice()).toBe('Select INV-1')
  })

  it('shows a dash for an invoice that has none', () => {
    render(list('2026-09-01', [invoice('inv-3', 'INV-3', '2026-09-01')]))
    const row = screen.getByLabelText('Select INV-3').closest('tr')!
    expect(row.querySelectorAll('td')[2].textContent).toBe('—')
  })
})

// 2026-10-07 — the list on the sheet (the approved Invoice / Statements
// sample, v6): a section head that counts, tabs by status, the status as a
// chip, a Category column from the lines, the period's total in the footer,
// and one bar under the table for what is ticked.
describe('the invoices table on the sheet', () => {
  const issued = { ...invoice('inv-1', 'INV-1', '2026-09-01'), total_amount: 1000 }
  const paid = { ...invoice('inv-p', 'INV-P', '2026-09-01'), status: 'paid', total_amount: 250 }
  const voided = { ...invoice('inv-v', 'INV-V', '2026-09-01'), status: 'voided', total_amount: 9999 }
  const sheet = () =>
    render(
      <InvoicesList
        invoices={[issued, paid, voided]}
        companyMap={companyMap}
        departmentMap={departmentMap}
        period="2026-09-01"
        bankAccounts={banks}
        categoryByInvoice={{ 'inv-1': 'Design Income', 'inv-p': 'Rental Income' }}
      />,
    )
  const tab = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
  // The number is the row's link to its page, and the phone's small print
  // repeats it: the row is the link's.
  const rowOf = (no: string) => screen.getByRole('link', { name: no }).closest('tr') as HTMLElement

  it('heads the section with the month and the count, and tabs the statuses with their counts', () => {
    sheet()
    expect(document.querySelector('.sect-head h2')).toHaveTextContent('Invoices')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('3 INVOICES · SEPTEMBER 2026')
    expect(['All', 'Issued', 'Paid', 'Draft', 'Voided'].map((t) => tab(t).querySelector('[data-tab-count]')?.textContent)).toEqual(['3', '1', '1', '0', '1'])
    fireEvent.click(tab('Paid'))
    expect(screen.queryByRole('link', { name: 'INV-1' })).toBeNull()
    expect(screen.getByRole('link', { name: 'INV-P' })).toBeInTheDocument()
    fireEvent.click(tab('All'))
    expect(screen.getByRole('link', { name: 'INV-1' })).toBeInTheDocument()
  })

  it('shows the bill-to code over the name, the category from the lines, the status as a chip, and totals without the voided', () => {
    sheet()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(rowOf('INV-1')).toHaveTextContent('Design Income')
    expect(within(rowOf('INV-1')).getByText('HC')).toBeInTheDocument()
    expect(within(rowOf('INV-1')).getByText('HOUZS Century')).toBeInTheDocument()
    expect(within(rowOf('INV-1')).getAllByText('issued')[0]).toHaveClass('chip', 'alert')
    expect(within(rowOf('INV-P')).getAllByText('paid')[0]).toHaveClass('chip', 'ledger')
    expect(rowOf('INV-V')).toHaveClass('inv-void')
    expect(document.querySelector('tfoot')).toHaveTextContent('3 invoices')
    expect(document.querySelector('tfoot')).toHaveTextContent('RM 1,250.00')
  })

  it('ticking a row puts the decision in a bar under the table, and the count in the head', () => {
    sheet()
    expect(document.querySelector('.bulk-bar')).toBeNull()
    fireEvent.click(screen.getByLabelText('Select INV-1'))
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('1 SELECTED')
    expect(rowOf('INV-1')).toHaveClass('st-selected')
    const bar = document.querySelector('.bulk-bar') as HTMLElement
    expect(bar).toHaveTextContent('1 selected')
    expect(bar).toHaveTextContent('RM 1,000.00')
    expect(within(bar).getByRole('button', { name: 'Print selected' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: /作废所选/ })).toBeInTheDocument()
    fireEvent.click(within(bar).getByRole('button', { name: 'Settle 1 →' }))
    expect(screen.getByText(/1 张发票/)).toBeInTheDocument() // the same dialog as before
  })

  it('on a phone the row is the bill-to with the number and status as small print, and the panel settles', () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
    sheet()
    const row = rowOf('INV-1')
    const billTo = within(row).getByText('HC').closest('td') as HTMLElement
    expect(billTo).toHaveTextContent('INV-1')
    expect(billTo.querySelector('.q-sub')).toHaveClass('md:hidden')
    fireEvent.click(within(row).getByRole('button', { name: '展开明细' }))
    const panel = document.querySelector('tr.lt-detail') as HTMLElement
    expect(panel).toHaveTextContent('Category')
    expect(panel).toHaveTextContent('Design Income')
    expect(within(panel).getByTitle('就地开收据,不用离开 Billing')).toHaveClass('inv-settle')
    fireEvent.click(within(panel).getByText('Open the invoice →'))
    expect(push).toHaveBeenCalledWith('/invoices/inv-1')
  })
})

// 2026-10-09 — the Finance revamp: the status chip's tones (a voided invoice in
// red), a range on the amount and the date, the list in a scroll box, and the
// number in the body face.
describe('the Finance revamp', () => {
  it('chips every status — issued waits, paid is green, voided red', () => {
    render(list('2026-09-01', [invoice('a', 'INV-1', '2026-09-01'), { ...invoice('b', 'INV-2', '2026-09-01'), status: 'voided' }, { ...invoice('c', 'INV-3', '2026-09-01'), status: 'paid' }]))
    expect(screen.getAllByText('issued')[0].closest('.chip')).toHaveClass('alert')
    expect(screen.getAllByText('voided')[0].closest('.chip')).toHaveClass('danger')
    expect(screen.getAllByText('paid')[0].closest('.chip')).toHaveClass('ledger')
  })

  it('offers a range on the amount and on the date, and sits in a scroll box', () => {
    render(list('2026-09-01', [invoice('a', 'INV-1', '2026-09-01')]))
    expect(document.querySelector('.st-box table')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Amount' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    fireEvent.click(screen.getByRole('button', { name: 'Filter Date' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Date' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
  })

  it('reads the row menu in English on the Finance view', () => {
    render(<FinViewProvider value={true}>{list('2026-09-01', [invoice('a', 'INV-1', '2026-09-01')])}</FinViewProvider>)
    fireEvent.contextMenu(screen.getByLabelText('Select INV-1').closest('tr') as HTMLElement)
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual([
      'Open', 'Settle', 'Edit', 'PDF', 'Copy', '+ Credit note', 'Change account', 'Void',
    ])
  })
})
