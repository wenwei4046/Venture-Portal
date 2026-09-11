import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PayrollGrid, { type PayrollRowData } from './PayrollGrid'
import { PayrollDraftProvider, usePayrollDraft } from './PayrollDraftContext'

const { updatePayrollRow, deletePayrollRows, refresh } = vi.hoisted(() => ({
  updatePayrollRow: vi.fn().mockResolvedValue(undefined),
  deletePayrollRows: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../actions', () => ({ updatePayrollRow, deletePayrollRows }))

function makeRow(overrides: Partial<PayrollRowData>): PayrollRowData {
  return {
    id: 'finance', staff_id: 'staff-finance', staff_name: 'Finance employee',
    dept_name: 'Finance', status: 'draft', source: 'infotech',
    basic_salary: 3000, statutory_allowance: 0, non_statutory_allowance: 0,
    ot_hours: 0, ot_amount: 0, commission_amount: 0, unpaid_leave_days: 0,
    deduction_amount: 0, skbbk_amount: 0, prorata_days_worked: 30,
    prorata_days_in_month: 30, epf_er: 390, epf_ee: 330,
    socso_er: 0, socso_ee: 0, eis_er: 0, eis_ee: 0, pcb: 0,
    withholding_tax: 0, gross: 3000, net: 2670,
    commission_is_derived: false, commission_statement_href: null,
    ...overrides,
  }
}

const basicRevenue = makeRow({
  id: 'revenue-basic', staff_id: 'staff-revenue-basic', staff_name: 'Revenue basic',
  dept_name: 'Revenue', source: 'commission', revenue_payroll: true,
  basic_salary: 5000, commission_amount: 10000, epf_er: 650, epf_ee: 550,
  gross: 9350, net: 8800, commission_is_derived: true,
  commission_statements: [{ label: 'Fair', href: '/revenue/fair/2026-09-01/statement/staff-revenue-basic' }],
})

function DraftState() {
  const { edits } = usePayrollDraft()
  return <output aria-label="Pending edits">{JSON.stringify(edits)}</output>
}

function grid(rows: PayrollRowData[]) {
  return (
    <PayrollDraftProvider>
      <PayrollGrid rows={rows} period="2026-09-01" />
      <DraftState />
    </PayrollDraftProvider>
  )
}

function personRow(name: string) {
  return screen.getByRole('button', { name }).closest('tr')!
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('PayrollGrid Revenue integration', () => {
  it('filters department rows and totals while preserving unsaved edits', () => {
    render(grid([makeRow({}), basicRevenue]))
    const basic = screen.getByLabelText('Basic salary — Finance employee')
    fireEvent.focus(basic)
    fireEvent.change(basic, { target: { value: '3200' } })
    fireEvent.blur(basic)

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Revenue' } })
    expect(screen.queryByRole('button', { name: 'Finance employee' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Revenue basic' })).toBeVisible()
    expect(screen.getByText('Total · 1 staff')).toBeVisible()
    expect(screen.getByLabelText('Pending edits').textContent).toContain('3200')

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Finance' } })
    expect(screen.getByLabelText('Basic salary — Finance employee')).toHaveValue('3,200.00')
    expect(screen.queryByRole('columnheader', { name: 'Gross Commission' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Comm.' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: '' } })
    expect(screen.getByText('Total · 2 staff')).toBeVisible()
  })

  it('shows gross commission beside net basic and the saved balance under Earnings', () => {
    const revenue = { ...basicRevenue, payout_split_version: 2, basic_pay_net: 4302.7, commission_balance: 4253.45, gross: 9253.45, net: 8556.15 }
    const fullCommission = makeRow({
      ...revenue, id: 'revenue-full', staff_id: 'staff-revenue-full',
      staff_name: 'Revenue full commission', basic_salary: 0, epf_er: 0, epf_ee: 0,
      gross: 10000, net: 10000, basic_pay_net: 0, commission_balance: 10000,
    })
    render(grid([makeRow({}), revenue, fullCommission]))
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Revenue' } })
    const basic = personRow('Revenue basic')
    expect(screen.getByRole('columnheader', { name: 'Gross Commission' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Balance' })).toBeVisible()
    expect(basic.querySelector('[data-label="Basic pay"]')).toHaveTextContent('4,302.70')
    expect(basic.querySelector('[data-label="Gross Commission"]')).toHaveTextContent('10,000.00')
    expect(basic.querySelector('[data-label="Balance"]')).toHaveTextContent('4,253.45')
    expect(within(basic).queryByLabelText('Commission — Revenue basic')).toBeNull()
    const full = personRow('Revenue full commission')
    expect(full.querySelector('[data-label="Basic pay"]')).toHaveTextContent('0.00')
    expect(full.querySelector('[data-label="Gross Commission"]')).toHaveTextContent('10,000.00')
    expect(full.querySelector('[data-label="Balance"]')).toHaveTextContent('10,000.00')
    const footer = screen.getByText('Total · 2 staff').closest('tr')!
    expect(footer.cells[5]).toHaveTextContent('20,000.00')
    expect(footer.cells[10]).toHaveTextContent('14,253.45')
    const department = screen.getByRole('button', { name: 'Revenue, 2 staff' }).closest('tr')!
    expect(department.cells[5]).toHaveTextContent('20,000.00')
    expect(department.cells[7]).toHaveTextContent('14,253.45')
    expect(within(basic).getByLabelText('Select Revenue basic')).toBeDisabled()
    expect(screen.getByLabelText('Select all draft rows')).toBeDisabled()
    expect(within(basic).getByRole('link', { name: '10,000.00' })).toHaveAttribute('href', basicRevenue.commission_statements![0].href)
  })

  it('keeps imported payroll amounts and selection behavior even in Revenue', () => {
    const imported = makeRow({ dept_name: 'Revenue', commission_amount: 120, gross: 3120, net: 2790 })
    render(grid([basicRevenue, imported]))
    const ordinary = personRow('Finance employee')
    expect(ordinary.querySelector('[data-label="Basic pay"]')).toHaveTextContent('—')
    expect(ordinary.querySelector('[data-label="Gross Commission"]')).toHaveTextContent('—')
    expect(ordinary.querySelector('[data-label="Balance"]')).toBeNull()
    expect(within(ordinary).getByLabelText('Commission — Finance employee')).toHaveValue('120.00')
    expect(within(ordinary).getByLabelText('Select Finance employee')).toBeEnabled()
    fireEvent.click(screen.getByLabelText('Select all draft rows'))
    expect(within(ordinary).getByLabelText('Select Finance employee')).toBeChecked()
    expect(screen.getByLabelText('Select Revenue basic')).not.toBeChecked()
    const footer = screen.getByText('Total · 2 staff').closest('tr')!
    expect(footer.cells[5]).toHaveTextContent('10,000.00')
    expect(footer.cells[10]).toHaveTextContent('3,920.00')
  })

  it('allows deleting an unlinked Revenue draft while protecting linked zero-amount rows', async () => {
    const orphan = makeRow({
      ...basicRevenue, id: 'orphan', staff_name: 'Unlinked Revenue', dept_name: 'Revenue Department',
      commission_amount: 0, commission_statements: [], commission_statement_href: null,
    })
    const linked = { ...basicRevenue, dept_name: 'Revenue Department', commission_amount: 0 }
    const linkedHref = makeRow({
      ...linked, id: 'legacy-link', staff_name: 'Revenue with statement link', commission_statements: [],
      commission_statement_href: '/revenue/fair/2026-09-01/statement/legacy',
    })
    render(grid([orphan, linked, linkedHref]))
    expect(screen.getByLabelText('Select Unlinked Revenue')).toBeEnabled()
    expect(screen.getByLabelText('Select Revenue basic')).toBeDisabled()
    expect(screen.getByLabelText('Select Revenue with statement link')).toBeDisabled()
    const band = screen.getByRole('button', { name: 'Revenue Department, 3 staff' })
    expect(band).toHaveAttribute('title', 'Revenue Department')
    expect(band.querySelector('.count')).toHaveTextContent('3')
    expect(band.querySelector('.tag')).toBeNull()

    fireEvent.click(screen.getByLabelText('Select all draft rows'))
    expect(screen.getByLabelText('Select Unlinked Revenue')).toBeChecked()
    expect(screen.getByLabelText('Select Revenue basic')).not.toBeChecked()
    const originalConfirm = window.confirm
    window.confirm = vi.fn().mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }))
    await waitFor(() => expect(deletePayrollRows).toHaveBeenCalledWith(['orphan'], '2026-09-01'))
    window.confirm = originalConfirm
  })

  it('does not reinterpret a historical commission row without the new settlement formula', () => {
    render(grid([{ ...basicRevenue, revenue_payroll: false, status: 'paid', gross: 15000, net: 14450 }]))
    expect(screen.queryByRole('columnheader', { name: 'Gross Commission' })).toBeNull()
    expect(personRow('Revenue basic').querySelector('.pg-gross')).toHaveTextContent('15,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Revenue basic' }))
    expect(screen.queryByRole('region', { name: 'Revenue payout split' })).toBeNull()
  })

  it('refreshes source fields without losing local edits or sending stale commission on save', async () => {
    const { rerender } = render(grid([basicRevenue]))
    const deduction = screen.getByLabelText('Deduction — Revenue basic')
    fireEvent.focus(deduction)
    fireEvent.change(deduction, { target: { value: '125' } })
    fireEvent.blur(deduction)

    rerender(grid([{ ...basicRevenue, basic_salary: 6000, commission_amount: 12000 }]))
    expect(screen.getByLabelText('Basic salary — Revenue basic')).toHaveValue('6,000.00')
    expect(screen.getByLabelText('Deduction — Revenue basic')).toHaveValue('125.00')
    expect(screen.getByLabelText('Pending edits').textContent).not.toContain('commission_amount')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updatePayrollRow).toHaveBeenCalledTimes(1))
    expect(updatePayrollRow.mock.calls[0][1]).toMatchObject({ basic_salary: 6000, deduction_amount: 125 })
    expect(updatePayrollRow.mock.calls[0][1]).not.toHaveProperty('commission_amount')
  })
})
