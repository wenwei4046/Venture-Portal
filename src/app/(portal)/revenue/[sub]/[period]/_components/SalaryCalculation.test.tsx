import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildPayRow } from '@/lib/revenue-pay'
import { payLineTotals, type PayLine } from '@/lib/revenue-pay-lines'
import SalaryCalculation from './SalaryCalculation'

const { savePayLines } = vi.hoisted(() => ({ savePayLines: vi.fn() }))
vi.mock('../../../pay-line-actions', () => ({ savePayLines }))

const STAFF = '6c8c6df1-a77f-4088-bb79-1ececb0a1041'

/** CHEA HUAN's September: full commission, no basic, nothing statutory. */
function source(lines: PayLine[] = []) {
  const totals = payLineTotals(lines)
  return {
    ...buildPayRow({
      staffId: STAFF, employeeName: 'CHEA HUAN', employeeCode: 'HV009', designation: 'Team Leader', employmentType: 'commission_eligible',
      commissionHere: 7_202.52, commissionElsewhere: 0, payrollAdjustment: 0,
      payrollExists: true, payrollStatus: 'draft', payrollCommission: 0, payrollGross: 0, payrollNet: 0,
      input: {
        basicSalary: 0, statutoryAllowance: 0, nonStatutoryAllowance: 0, otAmount: 0, deductionAmount: 0, skbbkAmount: 0,
        daysWorked: 30, daysInMonth: 30, epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0,
        pcb: 0, taxMode: 'pcb', withholdingRate: 0.02,
        payLineEarnings: totals.earnings, payLineDeductions: totals.deductions,
      },
      lines,
    }),
    components: null,
  }
}

const claim: PayLine = { id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'special_claim', description: 'Petrol, Penang fair', amount: 500, version: 1 }
const advance: PayLine = { id: 'aaaaaaaa-0000-4000-8000-000000000002', kind: 'deduction', description: 'Salary advance', amount: 200, version: 2 }

function renderSalary(lines: PayLine[] = [], closedReason: string | null = null) {
  return render(<SalaryCalculation staffName="CHEA HUAN" period="2026-09-01" commission={7_202.52}
    source={source(lines)} payUnavailable={false} closedReason={closedReason} />)
}
const table = () => screen.getByRole('table', { name: 'Current salary calculation' })
const takeHome = () => within(table()).getByText(/^Estimated take-home pay/).closest('tr')!
const pencil = () => screen.getByRole('button', { name: 'Edit CHEA HUAN’s pay lines' })

beforeEach(() => {
  vi.clearAllMocks()
  savePayLines.mockResolvedValue({ earnings: 500, deductions: 0, payrollUpdated: true })
})
afterEach(cleanup)

describe('SalaryCalculation · the pay lines on a salesperson’s month', () => {
  it('lists saved lines where they act: an earning above gross pay, a deduction after the tax', () => {
    renderSalary([claim, advance])
    fireEvent.click(screen.getByText('Salary calculation · current preview'))
    const rows = within(table()).getAllByRole('row').map(row => row.textContent ?? '')
    const claimAt = rows.findIndex(text => text.startsWith('Special claim · Petrol, Penang fair'))
    const grossAt = rows.findIndex(text => text.startsWith('Gross pay'))
    const advanceAt = rows.findIndex(text => text.startsWith('Deduction · Salary advance'))
    expect(claimAt).toBeGreaterThan(0)
    expect(claimAt).toBeLessThan(grossAt)
    expect(advanceAt).toBeGreaterThan(rows.findIndex(text => text.startsWith('SKBBK')))
    expect(rows[grossAt]).toContain('RM 7,702.52')
    expect(rows[advanceAt]).toContain('RM (200.00)')
    // 7,202.52 + 500 − 200
    expect(takeHome()).toHaveTextContent('RM 7,502.52')
  })

  it('opens on a blank special claim, recomputes as the amount is typed, and saves the month', async () => {
    renderSalary()
    fireEvent.click(pencil())
    const type = screen.getByRole('combobox', { name: 'Line 1 type' })
    expect(type).toHaveValue('special_claim')
    await waitFor(() => expect(type).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Line 1: enter an amount.')
    expect(savePayLines).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 amount' }), { target: { value: '500' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 description' }), { target: { value: ' Petrol, Penang fair ' } })
    expect(takeHome()).toHaveTextContent('RM 7,702.52')
    expect(takeHome()).toHaveTextContent('not saved yet')

    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    await waitFor(() => expect(savePayLines).toHaveBeenCalledTimes(1))
    expect(savePayLines).toHaveBeenCalledWith({
      staffId: STAFF, period: '2026-09-01', seen: [],
      lines: [{ id: null, kind: 'special_claim', description: 'Petrol, Penang fair', amount: 500 }],
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Pay lines saved — CHEA HUAN’s September 2026 payroll is updated.')
    expect(screen.queryByRole('group', { name: /Pay lines/ })).toBeNull()
    // Until the page's refreshed data arrives, the table keeps what was saved
    // rather than falling back to the lines from before the save.
    expect(within(table()).getByText(/^Special claim · Petrol, Penang fair/)).toBeInTheDocument()
    expect(takeHome()).toHaveTextContent('RM 7,702.52')
  })

  it('hands back to the stored lines once the refreshed data arrives', async () => {
    const view = renderSalary()
    fireEvent.click(pencil())
    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 amount' }), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: 'Edit CHEA HUAN’s pay lines' })).toBeNull()

    view.rerender(<SalaryCalculation staffName="CHEA HUAN" period="2026-09-01" commission={7_202.52}
      source={source([{ ...claim, description: 'As stored' }])} payUnavailable={false} closedReason={null} />)
    await waitFor(() => expect(within(table()).getByText(/^Special claim · As stored/)).toBeInTheDocument())
    expect(pencil()).toBeInTheDocument()
  })

  it('edits the lines already there, hands back what it opened, and can take one away', async () => {
    renderSalary([claim, advance])
    fireEvent.click(pencil())
    expect(screen.getByRole('textbox', { name: 'Line 1 amount' })).toHaveValue('500.00')
    // Nothing changed yet: nothing to save.
    expect(screen.getByRole('button', { name: 'Save lines' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Line 2 type' }), { target: { value: 'incentive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    await waitFor(() => expect(savePayLines).toHaveBeenCalledTimes(1))
    expect(savePayLines.mock.calls[0][0]).toMatchObject({
      seen: [`${claim.id}:1`, `${advance.id}:2`],
      lines: [{ id: advance.id, kind: 'incentive', description: 'Salary advance', amount: 200 }],
    })
  })

  it('adds a second line, and names a line that cannot be saved instead of sending it', () => {
    renderSalary()
    fireEvent.click(pencil())
    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 amount' }), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Line 2 type' }), { target: { value: 'deduction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Line 2: enter an amount.')
    expect(savePayLines).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Line 2 amount' }), { target: { value: '1.005' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Line 2: the amount must be more than 0, to the sen.')
    expect(savePayLines).not.toHaveBeenCalled()
  })

  it('shows the database’s refusal and keeps what was typed', async () => {
    savePayLines.mockRejectedValue(new Error('Pay lines for CHEA HUAN changed since you opened them. Reload and try again'))
    renderSalary()
    fireEvent.click(pencil())
    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 amount' }), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save lines' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed since you opened them')
    expect(screen.getByRole('textbox', { name: 'Line 1 amount' })).toHaveValue('80')
  })

  it('puts the lines back as they were on Cancel or Escape', () => {
    renderSalary([claim])
    fireEvent.click(pencil())
    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 amount' }), { target: { value: '999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(takeHome()).toHaveTextContent('RM 7,702.52')

    fireEvent.click(pencil())
    fireEvent.change(screen.getByRole('textbox', { name: 'Line 1 amount' }), { target: { value: '999' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line 1 amount' }), { key: 'Escape' })
    expect(screen.queryByRole('group', { name: /Pay lines/ })).toBeNull()
    expect(takeHome()).toHaveTextContent('RM 7,702.52')
  })

  it('says why a closed month cannot change instead of opening the editor', () => {
    renderSalary([claim], 'Payroll for Sep 2026 has already been submitted. Reopen payroll before changing commission')
    expect(pencil()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(pencil())
    expect(screen.queryByRole('group', { name: /Pay lines/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Pay lines for September 2026 can no longer change: Payroll for Sep 2026 has already been submitted')
  })

  it('offers no pencil when this session cannot see the person’s pay', () => {
    render(<SalaryCalculation staffName="CHEA HUAN" period="2026-09-01" commission={7_202.52}
      source={undefined} payUnavailable closedReason={null} />)
    expect(screen.queryByRole('button', { name: /pay lines/ })).toBeNull()
  })
})
