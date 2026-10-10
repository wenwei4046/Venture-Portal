import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CreateInvoiceButton from './CreateInvoiceButton'
import CreateMultiLineInvoiceButton from './CreateMultiLineInvoiceButton'
import GenerateConsolidatedInvoicesButton from './GenerateConsolidatedInvoicesButton'
import GenerateOwnShareInvoiceButton from './GenerateOwnShareInvoiceButton'
import ReconcilePayrollBillingButton from './ReconcilePayrollBillingButton'

/**
 * Every invoice modal on Service Billing seeds its own `period` from the
 * page's month ONCE. Changing the page's month is a query-string navigation,
 * which keeps the modals mounted — so after moving the picker, "Create
 * Invoice" still opened on the previous month and filed the invoice (and its
 * issue JE) there. Each modal now re-seeds whenever the page's month moves
 * (2026-09-11, same class as the Director Salary grid bug).
 */
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('../actions', () => ({
  createManualInvoice: vi.fn(),
  createMultiLineInvoice: vi.fn(),
  fetchDirectorCtcByCompany: vi.fn().mockResolvedValue([]),
  fetchStaffAllocationByCompany: vi.fn().mockResolvedValue([]),
  fetchConsolidatedPayrollPreview: vi.fn().mockResolvedValue([]),
  generateConsolidatedPayrollInvoices: vi.fn(),
  fetchOwnShareInvoicePreview: vi.fn().mockResolvedValue({ groups: [] }),
  generateOwnShareInvoice: vi.fn(),
  fetchPayrollBillingDelta: vi.fn().mockResolvedValue([]),
  generatePayrollAdjustmentInvoices: vi.fn(),
}))
vi.mock('@/components/AccountPicker', () => ({
  default: () => <select aria-label="Account" />,
}))

const companies = [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }]

/** The one month field an open modal has. */
function modalMonth(): HTMLInputElement {
  const el = document.querySelector('input[type="month"]')
  if (!(el instanceof HTMLInputElement)) throw new Error('no open modal with a month field')
  return el
}

beforeEach(() => vi.clearAllMocks())

/**
 * Open the modal on September, move the page to August, open it again: the
 * month field must say August. Before the fix the modal was still the
 * September instance — and still open — so the second click changed nothing.
 */
function itReseeds(
  name: string,
  trigger: string,
  make: (currentPeriod: string) => React.ReactElement,
) {
  it(`${name} re-seeds its month when the page's month moves`, () => {
    const { rerender } = render(make('2026-09-01'))
    fireEvent.click(screen.getByRole('button', { name: trigger }))
    expect(modalMonth()).toHaveValue('2026-09')

    rerender(make('2026-08-01'))
    fireEvent.click(screen.getByRole('button', { name: trigger }))
    expect(modalMonth()).toHaveValue('2026-08')
  })
}

describe('Service Billing modals across periods', () => {
  itReseeds('CreateInvoiceButton', '+ Create Invoice', p => (
    <CreateInvoiceButton companies={companies} currentPeriod={p} />
  ))
  itReseeds('CreateMultiLineInvoiceButton', '+ Multi-line Invoice', p => (
    <CreateMultiLineInvoiceButton companies={companies} currentPeriod={p} />
  ))
  itReseeds('GenerateConsolidatedInvoicesButton', 'Generate payroll invoices', p => (
    <GenerateConsolidatedInvoicesButton currentPeriod={p} />
  ))
  itReseeds('GenerateOwnShareInvoiceButton', 'Own-share → Venture (Office)', p => (
    <GenerateOwnShareInvoiceButton currentPeriod={p} />
  ))
  itReseeds('ReconcilePayrollBillingButton', '对数补差', p => (
    <ReconcilePayrollBillingButton currentPeriod={p} />
  ))
})

/**
 * 2026-10-10 — the handoff's head menus ("From payroll ▾", "+ Create Invoice
 * ▾") hold these dialogs: a pick mounts the dialog already open, without a
 * trigger button of its own, and on the page's month.
 */
describe('Service Billing modals opened from a menu', () => {
  const cases: Array<[string, string, (p: string) => React.ReactElement]> = [
    ['CreateInvoiceButton', '+ Create Invoice', (p) => <CreateInvoiceButton companies={companies} currentPeriod={p} autoOpen hideTrigger />],
    ['CreateMultiLineInvoiceButton', '+ Multi-line Invoice', (p) => <CreateMultiLineInvoiceButton companies={companies} currentPeriod={p} autoOpen hideTrigger />],
    ['GenerateConsolidatedInvoicesButton', 'Generate payroll invoices', (p) => <GenerateConsolidatedInvoicesButton currentPeriod={p} autoOpen hideTrigger />],
    ['GenerateOwnShareInvoiceButton', 'Own-share → Venture (Office)', (p) => <GenerateOwnShareInvoiceButton currentPeriod={p} autoOpen hideTrigger />],
    ['ReconcilePayrollBillingButton', '对数补差', (p) => <ReconcilePayrollBillingButton currentPeriod={p} autoOpen hideTrigger />],
  ]
  for (const [name, trigger, make] of cases) {
    it(`${name} arrives open, on the page's month, with no trigger of its own`, () => {
      render(make('2026-09-01'))
      expect(modalMonth()).toHaveValue('2026-09')
      expect(screen.queryByRole('button', { name: trigger })).toBeNull()
    })
  }
})
