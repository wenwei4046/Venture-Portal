import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  createManualInvoice: vi.fn(),
  createMultiLineInvoice: vi.fn(),
  fetchDirectorCtcByCompany: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../actions', () => ({
  createManualInvoice: mocks.createManualInvoice,
  createMultiLineInvoice: mocks.createMultiLineInvoice,
  fetchDirectorCtcByCompany: mocks.fetchDirectorCtcByCompany,
  fetchStaffAllocationByCompany: vi.fn().mockResolvedValue([]),
}))
// The real picker is a typeahead; a plain select is enough to pick 5050 here.
vi.mock('@/components/AccountPicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (code: string) => void }) => (
    <select aria-label="Account" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      <option value="5050">5050 Salary Income</option>
    </select>
  ),
}))

import CreateInvoiceButton from './CreateInvoiceButton'

const companies = [
  { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' },
  { id: 'co-2990', name: '2990', short_code: '2990' },
]
// HR's Sep'26 director CTC per subsidiary (get_director_ctc_by_company).
const CTC = [
  { companyId: 'co-hc', shortCode: 'HC', name: 'HOUZS Century', totalCtc: 25768.1, basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 },
  { companyId: 'co-2990', shortCode: '2990', name: '2990', totalCtc: 9642.13, basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 },
]

/** Open Create Invoice on Sep 2026 with Director attribution as the pool, let
 *  HR's CTC fill the subsidiaries, pick 5050 and a ratio. */
async function openDirectorBatch() {
  render(
    <CreateInvoiceButton
      companies={companies}
      currentPeriod="2026-09-01"
      prefillMode="director_attribution"
      categories={[{ code: '5050', label: 'Salary Income', type: 'revenue', parent_code: null }]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '+ Create Invoice' }))
  await screen.findByText(/Auto-filled 2 subsidiary rows/)
  fireEvent.change(screen.getByLabelText('Account'), { target: { value: '5050' } })
  fireEvent.change(screen.getByLabelText('Ratio (RM)'), { target: { value: '1' } })
}

function subRowAmount(companyId: string): HTMLInputElement {
  const select = Array.from(document.querySelectorAll('select')).find((s) => s.value === companyId)
  const input = select?.closest('tr')?.querySelector('input')
  if (!(input instanceof HTMLInputElement)) throw new Error(`no row for ${companyId}`)
  return input
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchDirectorCtcByCompany.mockResolvedValue(CTC)
  mocks.createMultiLineInvoice.mockResolvedValue({ id: 'inv', invoice_no: 'HV-INV-202609-0060' })
  mocks.createManualInvoice.mockResolvedValue(undefined)
})

// 2026-10-06 (user: "director 要 bill back 的我要拆 detail 可以吗？" → "可以").
describe('a director CTC invoice from Create Invoice', () => {
  it('is itemised like the payroll invoice — Salary / Allowance / EPF / SOCSO / EIS, zero components left out', async () => {
    await openDirectorBatch()
    expect(screen.getByText(/Auto-filled 2 subsidiary rows/)).toHaveTextContent('itemised')
    fireEvent.click(screen.getByRole('button', { name: 'Create Invoices' }))

    await waitFor(() => expect(mocks.createMultiLineInvoice).toHaveBeenCalledTimes(2))
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        billableType: 'subsidiary',
        billingMode: 'director_attribution',
        companyId: 'co-hc',
        period: '2026-09',
        invoiceDate: '2026-09-30',
        headerDescription: 'Director salary CTC — September 2026',
        lines: [
          { description: "Salary - Sep'26", amount: 22800, categoryCode: '5050' },
          { description: "EPF - Sep'26", amount: 2736, categoryCode: '5050' },
          { description: "SOCSO - Sep'26", amount: 208.3, categoryCode: '5050' },
          { description: "EIS - Sep'26", amount: 23.8, categoryCode: '5050' },
        ],
      }),
    )
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co-2990',
        lines: [
          { description: "Salary - Sep'26", amount: 2500, categoryCode: '5050' },
          { description: "Allowance - Sep'26", amount: 6769.38, categoryCode: '5050' },
          { description: "EPF - Sep'26", amount: 325, categoryCode: '5050' },
          { description: "SOCSO - Sep'26", amount: 42.85, categoryCode: '5050' },
          { description: "EIS - Sep'26", amount: 4.9, categoryCode: '5050' },
        ],
      }),
    )
    expect(mocks.createManualInvoice).not.toHaveBeenCalled()
  })

  it('goes out as one line for a subsidiary whose amount Finance changed, the others still itemised', async () => {
    await openDirectorBatch()
    fireEvent.change(subRowAmount('co-hc'), { target: { value: '25000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Invoices' }))

    await waitFor(() => expect(mocks.createManualInvoice).toHaveBeenCalledTimes(1))
    const fd = mocks.createManualInvoice.mock.calls[0][0] as FormData
    expect(fd.get('company_id')).toBe('co-hc')
    expect(fd.get('amount')).toBe('25000.00')
    expect(fd.get('billing_mode')).toBe('director_attribution')
    expect(fd.get('category_code')).toBe('5050')
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'co-2990' }))
  })
})
