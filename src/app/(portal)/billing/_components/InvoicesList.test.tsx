import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import InvoicesList from './InvoicesList'

/**
 * The batch selection belongs to the month on screen. Changing the month is a
 * query-string navigation that keeps this list mounted, so a selection made
 * in one month used to survive into the next — invisible in the checkboxes
 * (different rows) but still counted, and 打印所选 printed the old ids.
 */
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('../actions', () => ({ settleInvoicesConsolidated: vi.fn() }))
vi.mock('./InvoiceActions', () => ({
  ApproveInvoiceButton: () => null,
  BulkIssueInvoicesButton: () => null,
  DeleteInvoiceButton: () => null,
  EditInvoiceButton: () => null,
}))
vi.mock('./CreateCreditNoteButton', () => ({ default: () => null }))
vi.mock('./ReassignInvoiceGlButton', () => ({ default: () => null }))
vi.mock('./CopyInvoiceButton', () => ({ default: () => null }))
vi.mock('./InvoiceDetailButton', () => ({ default: () => null }))

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
