import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import InvoicesList from './InvoicesList'

/**
 * The batch selection belongs to the month on screen. Changing the month is a
 * query-string navigation that keeps this list mounted, so a selection made
 * in one month used to survive into the next — invisible in the checkboxes
 * (different rows) but still counted, and 打印所选 printed the old ids.
 */
// The three dialogs are stand-ins that say which invoice they were opened for,
// and whether they arrived open and without a trigger of their own.
type DialogProps = { invoiceNo?: string | null; autoOpen?: boolean; hideTrigger?: boolean }
const { push, refresh, copyInvoice, deleteDraftInvoice, dialog } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  copyInvoice: vi.fn(async (_fd: FormData) => undefined),
  deleteDraftInvoice: vi.fn(async (_fd: FormData) => undefined),
  dialog: (name: string) =>
    function Dialog(p: DialogProps) {
      return (
        <div data-testid={name} data-auto={String(!!p.autoOpen)} data-hide={String(!!p.hideTrigger)}>
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
// The detail popup: nothing in the cell, and — when the row opens it — a
// stand-in that says which invoice it is showing.
vi.mock('./InvoiceDetailButton', () => ({
  default: (p: { invoice: { invoice_no: string | null; status: string }; autoOpen?: boolean; hideTrigger?: boolean }) =>
    p.autoOpen ? (
      <div data-testid="dialog-detail" data-hide={String(!!p.hideTrigger)}>
        {p.invoice.invoice_no} · {p.invoice.status}
      </div>
    ) : null,
}))

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
    expect(screen.getByText(/^1 张/)).toBeInTheDocument()

    // router.refresh() after an action re-renders the same month: keep it.
    rerender(list('2026-09-01', [sep]))
    expect(screen.getByText(/^1 张/)).toBeInTheDocument()
    expect(screen.getByLabelText('Select INV-SEP-1')).toBeChecked()

    // › to October: nothing selected there.
    rerender(list('2026-10-01', [invoice('inv-oct', 'INV-OCT-1', '2026-10-01')]))
    expect(screen.queryByText(/^1 张/)).toBeNull()
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
    expect(menuLabels()).toEqual(['打开', 'Settle', 'PDF', 'Copy', '+ Credit note', '改 account', '作废'])
  })

  it('…a draft', () => {
    render(list('2026-09-01', [draft]))
    fireEvent.contextMenu(firstRow())
    expect(menuLabels()).toEqual(['打开', 'Approve & issue', 'Edit', 'PDF', 'Copy', 'Delete'])
  })

  it('…and a paid one', () => {
    render(list('2026-09-01', [paid]))
    fireEvent.contextMenu(firstRow())
    expect(menuLabels()).toEqual(['打开', 'PDF', 'Copy', 'Refund', '+ Credit note', '改 account'])
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

// 2026-10-02: every finance table opens a row on a double-click. An invoice has
// no page of its own, so what opens is its detail popup — the one its number
// has always opened.
describe('opening an invoice', () => {
  const issued = invoice('inv-1', 'INV-1', '2026-09-01')
  const other = invoice('inv-2', 'INV-2', '2026-09-01')
  const row = (no: string) => screen.getByLabelText(`Select ${no}`).closest('tr') as HTMLElement

  it('a double-click on the row opens its detail, for that row, with no trigger of its own', () => {
    render(list('2026-09-01', [issued, other]))
    expect(screen.queryByTestId('dialog-detail')).toBeNull()
    fireEvent.doubleClick(within(row('INV-2')).getByText('HOUZS Century'))
    const detail = screen.getByTestId('dialog-detail')
    expect(detail).toHaveTextContent('INV-2 · issued')
    expect(detail.dataset.hide).toBe('true')
  })

  it('…but not a double-click on its tick box or on its Settle button', () => {
    render(list('2026-09-01', [issued]))
    fireEvent.doubleClick(screen.getByLabelText('Select INV-1'))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Actions for INV-1' }))
    expect(screen.queryByTestId('dialog-detail')).toBeNull()
  })

  it('打开 in the row menu opens the same thing', () => {
    render(list('2026-09-01', [issued, other]))
    fireEvent.contextMenu(row('INV-1'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^打开/ }))
    expect(screen.getByTestId('dialog-detail')).toHaveTextContent('INV-1 · issued')
  })

  it('shows the invoice as it is now, not as it was when the popup opened', () => {
    const { rerender } = render(list('2026-09-01', [issued]))
    fireEvent.doubleClick(within(row('INV-1')).getByText('HOUZS Century'))
    expect(screen.getByTestId('dialog-detail')).toHaveTextContent('INV-1 · issued')
    // A settle lands and the page refreshes under the open popup.
    rerender(list('2026-09-01', [{ ...issued, status: 'paid' }]))
    expect(screen.getByTestId('dialog-detail')).toHaveTextContent('INV-1 · paid')
  })
})
