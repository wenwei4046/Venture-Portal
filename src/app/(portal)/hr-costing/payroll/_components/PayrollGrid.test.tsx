import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PayrollGrid, { type PayrollRowData } from './PayrollGrid'
import { PayrollDraftProvider, usePayrollDraft } from './PayrollDraftContext'
import SaveAllButton from './SaveAllButton'

const { updatePayrollRow, updatePayrollRows, deletePayrollRows, adjustRevenueCommission, refresh } = vi.hoisted(() => ({
  updatePayrollRow: vi.fn().mockResolvedValue(undefined),
  updatePayrollRows: vi.fn().mockResolvedValue({ saved: 1 }),
  deletePayrollRows: vi.fn().mockResolvedValue(undefined),
  adjustRevenueCommission: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../actions', () => ({ updatePayrollRow, updatePayrollRows, deletePayrollRows }))
vi.mock('../commission-actions', () => ({ adjustRevenueCommission }))

function makeRow(overrides: Partial<PayrollRowData>): PayrollRowData {
  return {
    id: 'finance', staff_id: 'staff-finance', staff_name: 'Finance employee',
    dept_name: 'Finance', status: 'draft', source: 'infotech',
    scope: 'staff', origin: 'staff', completed_at: null, topup_opened_at: null, batch_nos: [], submitted_ctc: 0,
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
  dept_name: 'Revenue', source: 'commission', origin: 'revenue', revenue_payroll: true,
  basic_salary: 5000, commission_amount: 10000, epf_er: 650, epf_ee: 550,
  gross: 9350, net: 8800, commission_is_derived: true,
  commission_statements: [{ label: 'Fair', href: '/revenue/fair/2026-09-01/statement/staff-revenue-basic' }],
})

function DraftState() {
  const { edits, dirtyCount } = usePayrollDraft()
  return <><output aria-label="Pending edits">{JSON.stringify(edits)}</output><output aria-label="Dirty rows">{dirtyCount}</output></>
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

function enterAmount(label: string, value: string) {
  const field = screen.getByLabelText(label)
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

const adjustableRevenue = makeRow({ ...basicRevenue, basic_salary: 0, commission_amount: 13000,
  commission_synced_amount: 13000, commission_adjustment_amount: 0,
  payout_split_version: 2, basic_pay_net: 0, commission_balance: 13000, gross: 13000, net: 13000 })

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('PayrollGrid Revenue integration', () => {
  it('reviews confirmed Revenue source when the payroll sync baseline is missing', () => {
    render(grid([makeRow({ ...basicRevenue, payout_split_version: 2, basic_pay_net: 4302.7,
      commission_synced_amount: null, commission_confirmed_amount: 13000, commission_adjustment_amount: 0 })]))
    enterAmount('Gross Commission — Revenue basic', '14000')
    fireEvent.click(within(personRow('Revenue basic')).getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('row', { name: 'Synced from Revenue 13,000.00' })).toBeVisible()
    expect(screen.getByRole('row', { name: 'Current Gross Commission 10,000.00' })).toBeVisible()
  })

  it('saves a gross adjustment through its own action and waits for refreshed payout values', async () => {
    const row = adjustableRevenue
    const { rerender } = render(grid([row]))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByText('Adj.')).toBeNull()
    enterAmount('Gross Commission — Revenue basic', '14000')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Dirty rows')).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('14,000.00')
    expect(screen.getByRole('row', { name: 'Payroll adjustment to Revenue source +1,000.00' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'Month-end correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(adjustRevenueCommission).toHaveBeenCalledWith(row.id, {
      gross: 14000, expectedSynced: 13000, expectedAdjustment: 0, reason: 'Month-end correction',
    }, {}))
    expect(updatePayrollRow).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(personRow('Revenue basic').querySelector('[data-label="Balance"]')).toHaveTextContent('13,000.00')

    rerender(grid([{ ...row, commission_amount: 14000, commission_adjustment_amount: 1000,
      commission_balance: 14000, gross: 14000, net: 14000 }]))
    expect(personRow('Revenue basic').querySelector('[data-label="Balance"]')).toHaveTextContent('14,000.00')
    const marker = screen.getByRole('button', { name: 'Commission adjustment +RM 1,000.00 — Revenue basic. Open details' })
    expect(marker).toHaveAttribute('title', expect.stringContaining('+RM 1,000.00'))
    expect(marker).toHaveTextContent('')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    const basic = screen.getByLabelText('Basic salary — Revenue basic')
    fireEvent.focus(basic)
    fireEvent.change(basic, { target: { value: '2000' } })
    fireEvent.blur(basic)
    expect(screen.getByLabelText('Gross Commission — Revenue basic')).toBeEnabled()
  })

  it('keeps the inline draft after cancel and saves mixed edits only after confirmation', async () => {
    render(grid([adjustableRevenue]))
    enterAmount('Basic salary — Revenue basic', '2500')
    enterAmount('Gross Commission — Revenue basic', '12000')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('row', { name: 'Payroll adjustment to Revenue source -1,000.00' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Gross Commission — Revenue basic')).toHaveValue('12,000.00')
    expect(screen.getByLabelText('Basic salary — Revenue basic')).toHaveValue('2,500.00')
    expect(updatePayrollRow).not.toHaveBeenCalled()
    expect(adjustRevenueCommission).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'Dropped sale' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(adjustRevenueCommission).toHaveBeenCalledWith(adjustableRevenue.id,
      { gross: 12000, expectedSynced: 13000, expectedAdjustment: 0, reason: 'Dropped sale' }, { basic_salary: 2500 }))
    expect(updatePayrollRow).not.toHaveBeenCalled()
  })

  it('preserves unsaved commission across refresh and reviews the latest source before saving', () => {
    const { rerender } = render(grid([adjustableRevenue]))
    enterAmount('Gross Commission — Revenue basic', '14000')
    rerender(grid([{ ...adjustableRevenue, commission_synced_amount: 13500, commission_amount: 13500 }]))
    expect(screen.getByLabelText('Gross Commission — Revenue basic')).toHaveValue('14,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('row', { name: 'Synced from Revenue 13,500.00' })).toBeVisible()
    expect(screen.getByRole('row', { name: 'Payroll adjustment to Revenue source +500.00' })).toBeVisible()
  })

  it('header Save opens the review and never sends commission or mixed fields to the generic batch', async () => {
    render(<PayrollDraftProvider><SaveAllButton /><PayrollGrid rows={[adjustableRevenue]} period="2026-09-01" /></PayrollDraftProvider>)
    enterAmount('Basic salary — Revenue basic', '2500')
    enterAmount('Gross Commission — Revenue basic', '14000')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 row' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(updatePayrollRows).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save 1 row' })).toBeEnabled())
    expect(adjustRevenueCommission).not.toHaveBeenCalled()
    expect(updatePayrollRows).not.toHaveBeenCalled()
  })

  it('invalid inline text cannot silently save the last valid commission', () => {
    render(grid([adjustableRevenue]))
    enterAmount('Gross Commission — Revenue basic', '14000')
    enterAmount('Gross Commission — Revenue basic', 'invalid')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(adjustRevenueCommission).not.toHaveBeenCalled()
    expect(updatePayrollRow).not.toHaveBeenCalled()
  })

  it('filters department rows and totals while preserving unsaved edits', () => {
    render(grid([makeRow({}), basicRevenue]))
    const basic = screen.getByLabelText('Basic salary — Finance employee')
    fireEvent.focus(basic)
    fireEvent.change(basic, { target: { value: '3200' } })
    fireEvent.blur(basic)

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Revenue' } })
    expect(screen.queryByRole('button', { name: 'Finance employee' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Revenue basic' })).toBeVisible()
    expect(screen.getByText('Total · 1 person')).toBeVisible()
    expect(screen.getByLabelText('Pending edits').textContent).toContain('3200')

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Finance' } })
    expect(screen.getByLabelText('Basic salary — Finance employee')).toHaveValue('3,200.00')
    expect(screen.queryByRole('columnheader', { name: 'Gross Commission' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Comm.' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: '' } })
    expect(screen.getByText('Total · 2 people')).toBeVisible()
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
    const footer = screen.getByText('Total · 2 people').closest('tr')!
    expect(footer.cells[5]).toHaveTextContent('20,000.00')
    expect(footer.cells[10]).toHaveTextContent('14,253.45')
    const department = screen.getByRole('button', { name: 'Revenue, 2 people' }).closest('tr')!
    // The band carries a Status cell (unified Payroll) before Gross.
    expect(department.cells[6]).toHaveTextContent('20,000.00')
    expect(department.cells[8]).toHaveTextContent('14,253.45')
    expect(within(basic).getByLabelText('Select Revenue basic')).toBeDisabled()
    expect(screen.getByLabelText('Select everyone who can be completed, unlocked or deleted')).toBeDisabled()
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
    fireEvent.click(screen.getByLabelText('Select everyone who can be completed, unlocked or deleted'))
    expect(within(ordinary).getByLabelText('Select Finance employee')).toBeChecked()
    expect(screen.getByLabelText('Select Revenue basic')).not.toBeChecked()
    const footer = screen.getByText('Total · 2 people').closest('tr')!
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
    const band = screen.getByRole('button', { name: 'Revenue Department, 3 people' })
    expect(band).toHaveAttribute('title', 'Revenue Department')
    expect(band.querySelector('.count')).toHaveTextContent('3')
    expect(band.querySelector('.tag')).toBeNull()

    fireEvent.click(screen.getByLabelText('Select everyone who can be completed, unlocked or deleted'))
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

// User 2026-09-30: deduction 本身并没有出现 EPF、Socso、EIS 还有 PCB … 在这个
// payroll tab 那边，所有的东西基本上都应该是可以被 editable 的 — and the row's
// ▾ goes: the ⋯ menu's Open paycheck already pops the same window.
describe('PayrollGrid statutory fields and the paycheck', () => {
  it('has no ▾ of its own — the name and the ⋯ menu open the paycheck', async () => {
    render(grid([makeRow({})]))
    const row = personRow('Finance employee')
    expect(row.querySelector('.icon-btn.chev')).toBeNull()
    expect(within(row).queryByRole('button', { name: /paycheck/i })).toBeNull()

    fireEvent.click(within(row).getByRole('button', { name: 'Actions for Finance employee' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open paycheck' }))
    expect(screen.getByRole('dialog', { name: 'Finance employee — paycheck' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // Focus goes back to the row, on its name.
    expect(screen.getByRole('button', { name: 'Finance employee' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Finance employee' }))
    expect(screen.getByRole('dialog', { name: 'Finance employee — paycheck' })).toBeVisible()
  })

  it('puts EPF, SOCSO, EIS and PCB under Deductions, employee side, as fields', () => {
    render(grid([makeRow({})]))
    expect(screen.getByRole('columnheader', { name: 'Deductions' })).toHaveAttribute('colspan', '7')
    for (const name of ['EPF EE', 'SOCSO EE', 'EIS EE', 'PCB', 'EPF ER', 'SOCSO ER', 'EIS ER']) {
      expect(screen.getByRole('columnheader', { name })).toBeVisible()
    }
    expect(screen.getByLabelText('EPF employee — Finance employee')).toHaveValue('330.00')
    expect(screen.getByLabelText('PCB — Finance employee')).toHaveValue('0.00')
    expect(screen.getByLabelText('EPF employer — Finance employee')).toHaveValue('390.00')
  })

  it('saves a typed statutory figure with the row, and never one nobody typed', async () => {
    render(grid([makeRow({})]))
    enterAmount('EPF employee — Finance employee', '300')
    enterAmount('PCB — Finance employee', '25')
    enterAmount('SOCSO employer — Finance employee', '12')
    expect(screen.getByLabelText('Pending edits').textContent).toContain('"epf_ee":300')
    fireEvent.click(within(personRow('Finance employee')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updatePayrollRow).toHaveBeenCalledTimes(1))
    const sent = updatePayrollRow.mock.calls[0][1]
    expect(sent).toMatchObject({ basic_salary: 3000, epf_ee: 300, pcb: 25, socso_er: 12 })
    expect(sent).not.toHaveProperty('socso_ee')
    expect(sent).not.toHaveProperty('epf_er')
  })

  it('sends typed statutory through the header Save too', async () => {
    render(<PayrollDraftProvider><SaveAllButton /><PayrollGrid rows={[makeRow({})]} period="2026-09-01" /></PayrollDraftProvider>)
    enterAmount('EIS employee — Finance employee', '7.5')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 row' }))
    await waitFor(() => expect(updatePayrollRows).toHaveBeenCalledTimes(1))
    const [[{ id, fields }]] = updatePayrollRows.mock.calls[0]
    expect(id).toBe('finance')
    expect(fields).toMatchObject({ eis_ee: 7.5 })
    expect(fields).not.toHaveProperty('epf_ee')
  })

  it('marks a typed figure, and has no PCB to type for somebody with no tax', () => {
    render(grid([
      makeRow({ statutory_typed: ['epf_ee'] }),
      makeRow({ id: 'none', staff_id: 's-none', staff_name: 'No tax person', tax_mode: 'none' }),
    ]))
    expect(screen.getByLabelText('EPF employee — Finance employee')).toHaveClass('manual')
    expect(screen.getByLabelText('EPF employee — Finance employee')).toHaveAttribute('title', expect.stringContaining('Reset statutory to JADUAL'))
    expect(screen.getByLabelText('SOCSO employee — Finance employee')).not.toHaveClass('manual')
    expect(screen.queryByLabelText('PCB — No tax person')).toBeNull()
    expect(within(personRow('No tax person')).getByTitle('No PCB — their People record sets no tax')).toHaveTextContent('—')
    expect(screen.getByLabelText('EPF employee — No tax person')).toBeEnabled()
  })

  it('keeps the mark on the bare figure once the row is sent', () => {
    render(grid([makeRow({ status: 'submitted', statutory_typed: ['pcb'], pcb: 88 })]))
    expect(screen.queryByLabelText('PCB — Finance employee')).toBeNull()
    const pcb = within(personRow('Finance employee')).getByText('88.00')
    expect(pcb).toHaveClass('manual')
  })

  it('totals the statutory columns in the footer', () => {
    render(grid([
      makeRow({ epf_ee: 330, socso_ee: 15, eis_ee: 6, pcb: 10 }),
      makeRow({ id: 'b', staff_id: 's-b', staff_name: 'Second', epf_ee: 100, socso_ee: 5, eis_ee: 2, pcb: 5 }),
    ]))
    const footer = screen.getByText('Total · 2 people').closest('tr')!
    // Total · Gross · Net · ⋯ · five Earnings · Unpaid · Deduct · SKBBK, then the statutory.
    expect(footer.cells[12]).toHaveTextContent('430.00')
    expect(footer.cells[13]).toHaveTextContent('20.00')
    expect(footer.cells[14]).toHaveTextContent('8.00')
    expect(footer.cells[15]).toHaveTextContent('15.00')
    expect(footer.cells[16]).toHaveTextContent('780.00')
  })
})
