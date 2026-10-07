import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// 2026-10-07 (user: "invoice edit 我要全部都可以改"): the edit dialog opens for an
// issued invoice too — the same form as a draft's, plus the reason that goes
// on the audit trail — and saves through updateIssuedInvoiceFull. Once money
// has been received against the invoice, the amount, the payer and the
// period are fixed in the form as they are in the database.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateDraftInvoiceFull: vi.fn(),
  updateIssuedInvoiceFull: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('../actions', () => ({
  approveInvoice: vi.fn(),
  approveInvoicesForPeriod: vi.fn(),
  updateDraftInvoiceFull: mocks.updateDraftInvoiceFull,
  updateIssuedInvoiceFull: mocks.updateIssuedInvoiceFull,
}))
vi.mock('@/components/AccountPicker', () => ({
  default: (p: { value: string; onChange: (code: string) => void; disabled?: boolean }) => (
    <select aria-label="Account" value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled}>
      <option value="">—</option>
      <option value="5019">5019</option>
    </select>
  ),
}))

import { EditInvoiceButton } from './InvoiceActions'

const initial = {
  total_amount: 2000,
  category_code: null,
  description: null,
  invoice_date: '2026-10-01',
  due_date: '2026-10-31',
  reference_no: null,
  billing_mode: 'marketing_project',
  billable_to_type: 'freetext',
  company_id: null,
  billable_to_department_id: null,
  billable_to_freetext_name: 'Rygis Private Gym',
  billable_to_freetext_address: null,
  billable_to_freetext_phone: null,
  billable_to_freetext_email: null,
  period_month: '2026-10-01',
}
const categories = [{ code: '5019', label: 'Marketing project income', type: 'revenue' as const, parent_code: null }]
const lines = [{ description: 'Marketing Service - 1st Oct to 15th Oct', amount: 2000, category_code: '5019' }]
const settle = () => act(async () => { await Promise.resolve() })

function dialog(extra: Partial<Parameters<typeof EditInvoiceButton>[0]> = {}) {
  return render(
    <EditInvoiceButton id="inv-13" invoiceNo="HV-INV-202610-0013" initial={initial} initialLines={lines} categories={categories} autoOpen hideTrigger {...extra} />,
  )
}
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save/ }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateIssuedInvoiceFull.mockResolvedValue({ entryNo: 'JE-202610-0853' })
  mocks.updateDraftInvoiceFull.mockResolvedValue(undefined)
})

describe('editing an issued invoice', () => {
  it('is the same form, headed as such, with a reason to fill', () => {
    dialog({ status: 'issued' })
    expect(screen.getByRole('heading', { name: 'Edit issued invoice' })).toBeInTheDocument()
    expect(screen.getByText(/corrected in place/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Reason/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Marketing Service - 1st Oct to 15th Oct')).toBeInTheDocument()
  })

  it('will not save without the reason', async () => {
    dialog({ status: 'issued' })
    save()
    await settle()
    expect(mocks.updateIssuedInvoiceFull).not.toHaveBeenCalled()
    expect(screen.getByText(/Give a reason/)).toBeInTheDocument()
  })

  it('saves the whole form and the reason through the issued-invoice action', async () => {
    dialog({ status: 'issued' })
    fireEvent.change(screen.getByDisplayValue('Marketing Service - 1st Oct to 15th Oct'), { target: { value: 'Marketing Service - 1st Sep to 15th Sep' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong month on the line' } })
    save()
    await settle()
    expect(mocks.updateDraftInvoiceFull).not.toHaveBeenCalled()
    expect(mocks.updateIssuedInvoiceFull).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inv-13',
        billableType: 'freetext',
        freetextName: 'Rygis Private Gym',
        period: '2026-10',
        invoiceDate: '2026-10-01',
        reason: 'Wrong month on the line',
        lines: [{ description: 'Marketing Service - 1st Sep to 15th Sep', amount: 2000, categoryCode: '5019' }],
      }),
    )
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('once money has come in, the amount, the payer and the period are fixed', () => {
    dialog({ status: 'paid', settled: true })
    expect(screen.getByText(/Money has been received/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('2000')).toBeDisabled()
    expect(screen.getByDisplayValue('2026-10')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Subsidiary' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ Add line' })).toBeDisabled()
    // The words are still the user's to change.
    expect(screen.getByDisplayValue('Marketing Service - 1st Oct to 15th Oct')).not.toBeDisabled()
  })

  it('a draft is edited as before: no reason, the draft action', async () => {
    dialog()
    expect(screen.getByRole('heading', { name: 'Edit draft invoice' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Reason/)).toBeNull()
    save()
    await settle()
    expect(mocks.updateDraftInvoiceFull).toHaveBeenCalledTimes(1)
    expect(mocks.updateIssuedInvoiceFull).not.toHaveBeenCalled()
  })
})
