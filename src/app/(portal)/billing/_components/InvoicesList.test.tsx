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
    billable_to_type: 'subsidiary' as const,
  }
}

const companyMap = new Map([['co-hc', { name: 'HOUZS Century', code: 'HC' }]])
const departmentMap = new Map<string, string>()

function list(period: string, rows: ReturnType<typeof invoice>[]) {
  return (
    <InvoicesList invoices={rows} companyMap={companyMap} departmentMap={departmentMap} period={period} />
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
