import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  contributionTotals, cycleHeadline, cycleTotals, groupDepartments, milestones,
  normaliseCycle, payVariances, statutoryRows, type HeadlineInput,
} from '@/lib/payment-cycle'
import PaymentBoard, { type BoardProps } from './PaymentBoard'

const actions = vi.hoisted(() => ({ create: vi.fn(), statutory: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
vi.mock('../actions', () => ({ createPayrollDisbursement: actions.create, generateStatutorySelection: actions.statutory, setPayrollPvDate: vi.fn() }))

function boardProps(includeHr = false): BoardProps {
  const cycle = normaliseCycle({
    period: '2026-08-01', run: { id: 'run', status: 'paid', total_amount: 15001.5 },
    funding: { staff: { id: 'funding', status: 'completed', amount: 15001.5, pv_date: '2026-09-10' } },
    people: [['Amy', 1000.1], ['Ben', 2000.2], ['Cara', 3000.3], ['Devi', 4000.4], ['Ezra', 5000.5], ...(includeHr ? [['Faye', 500]] : [])].map(([name, net]) => ({
      row_id: `row-${name}`, staff_id: `staff-${name}`, name, net, gross: net, prev_net: 900,
      dept_id: name === 'Faye' ? 'hr' : 'finance', dept_name: name === 'Faye' ? 'HR' : 'Finance', bank_name: 'CIMB', bank_account_no: '1234567890',
      socso_er: 20, socso_ee: 10, eis_er: 2, eis_ee: 2,
    })),
  })
  const groups = groupDepartments(cycle.people), rows = statutoryRows(cycle, groups), totals = cycleTotals(cycle, rows)
  const input: HeadlineInput = { cycle, groups, rows, phase: 'funded', staffFunded: true, directorsFunded: false, today: '2026-09-12', plannedStaffDate: '2026-09-15', plannedDirectorDate: '2026-09-15' }
  return {
    period: cycle.period, periodLabel: 'August 2026', periodRange: '1–31 Aug 2026', prevMonthName: 'July',
    groups, rows, totals, band: contributionTotals(cycle.people), headline: cycleHeadline(input), statutoryCoverage: [],
    milestones: milestones(input), variances: payVariances(cycle.people), phase: 'funded',
    staffFunded: true, directorsFunded: false, payoutBank: { name: 'Alliance Bank', last4: '3210' },
    today: input.today, defaultDate: input.plannedStaffDate, fundingSlot: null,
    facts: { ctc: totals.ctc, fundedAmount: totals.ctc, fundedAll: true, fundedDate: '2026-09-10', fundingPvs: ['funding-pv'],
      fundingWord: '', poolBalance: totals.ctc, staffNet: totals.staffNet, staffCount: totals.staffCount,
      staffDate: '2026-09-15', staffPaid: false, dirNet: 0, dirCount: 0, dirDate: null, dirPaid: false,
      dirFunded: false, statutory: totals.statutory, statDue: '2026-09-15', poolAfterSalary: 0, statDone: false, statPaidDate: null },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.create.mockResolvedValue({ count: 3, people: 3, total: 9000.9 })
  actions.statutory.mockResolvedValue({ count: 6, people: 3, total: 102 })
})

// 2026-10-13 — the user: "预设按部门，例外才一人一张": a PV per person names that
// person and their pay to whoever reads the PVs.
describe('generating by department is the way', () => {
  it('Generate by Department is the row’s main button, Manual generate a quiet one — on Salary and on Statutory', () => {
    render(<PaymentBoard {...boardProps()} />)
    for (const panel of ['payment-salary-panel', 'payment-statutory-panel']) {
      const scope = within(document.getElementById(panel) as HTMLElement)
      expect(scope.getAllByRole('button', { name: 'Generate by Department', hidden: true })[0]).toHaveClass('pay-btn', 'pri')
      const manual = scope.getAllByRole('button', { name: 'Manual generate', hidden: true })[0]
      expect(manual).toHaveClass('pay-btn', 'text')
      expect(manual).not.toHaveClass('pri')
    }
  })
})

describe('Payment statement tabs and confirmation', () => {
  it('reviews separate net basic and commission with independent, frozen receiving accounts', async () => {
    const props = boardProps()
    const person = { ...props.groups[0].people[0], source: 'commission', payout_split_version: 2,
      gross: 9253.45, net: 8556.15, bank_name_2: 'Maybank', bank_account_no_2: '0098765432',
      components: [
        { component: 'basic' as const, amount: 4302.70, voucher: null, recipient_account: null, bank_name: null, bank_account_no: null },
        { component: 'commission' as const, amount: 4253.45, voucher: null, recipient_account: null, bank_name: null, bank_account_no: null },
      ] }
    props.groups = groupDepartments([person])
    const { rerender } = render(<PaymentBoard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    const dialog = screen.getByRole('dialog')
    for (const part of ['Net basic', 'Commission']) fireEvent.click(within(dialog).getByRole('checkbox', { name: `Select Amy — ${part}` }))
    fireEvent.change(within(dialog).getByLabelText('Amy — Commission bank account'), { target: { value: 'account_2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review PVs' }))
    const confirmation = within(dialog).getByRole('button', { name: 'Yes, generate' }).parentElement!
    expect(confirmation).toHaveTextContent('2 PVs')
    expect(confirmation).toHaveTextContent('Net basic · RM 4,302.70 → Account 1 · CIMB ···7890')
    expect(confirmation).toHaveTextContent('Commission · RM 4,253.45 → Account 2 · Maybank ···5432')
    expect(within(dialog).getByLabelText('Amy — Commission bank account')).toBeDisabled()
    rerender(<PaymentBoard {...props} groups={groupDepartments([{ ...person, bank_account_no_2: '1111111111' }])} />)
    expect(confirmation).toHaveTextContent('Maybank ···5432')
    expect(actions.create).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, generate' }))
    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith('2026-08-01', 'staff', '2026-09-15', 'employee', 'finance', ['row-Amy'], [
      { payroll_row_id: 'row-Amy', component: 'basic', account: 'account_1', expected_amount: 4302.70, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Amy', component: 'commission', account: 'account_2', expected_amount: 4253.45, expected_bank_name: 'Maybank', expected_bank_account_no: '0098765432' },
    ]))
  })

  it('allows the remaining commission after net basic is paid without regenerating basic', async () => {
    const props = boardProps()
    props.groups = groupDepartments([{ ...props.groups[0].people[0], source: 'commission', payout_split_version: 2,
      net: 8556.15, components: [
        { component: 'basic', amount: 4302.70, voucher: { id: 'basic-pv', no: 'PV-BASIC', status: 'paid', payment_date: '2026-09-05', created_at: null, approved_at: null, granularity: 'employee', group_id: null }, recipient_account: 'account_1', bank_name: 'CIMB', bank_account_no: '1234567890' },
        { component: 'commission', amount: 4253.45, voucher: null, recipient_account: null, bank_name: null, bank_account_no: null },
      ] }])
    render(<PaymentBoard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('checkbox', { name: 'Select Amy — Net basic' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Amy — Commission' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review PVs' }))
    expect(within(dialog).getByRole('button', { name: 'Yes, generate' }).parentElement).toHaveTextContent('1 PV')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, generate' }))
    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith('2026-08-01', 'staff', '2026-09-15', 'employee', 'finance', ['row-Amy'], [
      { payroll_row_id: 'row-Amy', component: 'commission', account: 'account_1', expected_amount: 4253.45, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
    ]))
  })

  it('keeps reporting visible and shows changes only in Salary', () => {
    render(<PaymentBoard {...boardProps()} />)
    // A tab's name carries its row-count badge ("Salary 1"), like every sheet tab.
    expect(screen.getByRole('tab', { name: /^Salary/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Changes from July' })).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    expect(screen.getByText('Total payroll cost')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Changes from July' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Statutory PVs' })).toBeVisible()
    fireEvent.keyDown(screen.getByRole('tab', { name: /^Statutory/ }), { key: 'ArrowLeft' })
    expect(screen.getByRole('heading', { name: 'Changes from July' })).toBeVisible()
    expect(actions.create).not.toHaveBeenCalled()
    expect(actions.statutory).not.toHaveBeenCalled()
  })

  it('reviews only the selected salary employees and invokes one PV per person', async () => {
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Review PVs' })).toBeDisabled()
    for (const name of ['Amy', 'Cara', 'Ezra']) fireEvent.click(within(dialog).getByRole('checkbox', { name: `Select ${name}` }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review PVs' }))
    const confirm = within(dialog).getByRole('button', { name: 'Yes, generate' })
    expect(confirm.parentElement).toHaveTextContent('3 PVs')
    expect(confirm.parentElement).toHaveTextContent('RM 9,000.90')
    expect(confirm.parentElement).toHaveTextContent('Amy · Cara · Ezra')
    expect(within(dialog).getByLabelText('Pay date')).toBeDisabled()
    expect(within(dialog).getByRole('checkbox', { name: 'Select Ben' })).toBeDisabled()
    expect(actions.create).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith('2026-08-01', 'staff', '2026-09-15', 'employee', 'finance', ['row-Amy', 'row-Cara', 'row-Ezra'], [
      { payroll_row_id: 'row-Amy', component: 'net', account: 'account_1', expected_amount: 1000.1, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Cara', component: 'net', account: 'account_1', expected_amount: 3000.3, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Ezra', component: 'net', account: 'account_1', expected_amount: 5000.5, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
    ]))
  })

  it('department generation reviews everyone and ignores a saved manual subset', async () => {
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Select Amy' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate by Department' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review PVs' }))
    const confirm = within(dialog).getByRole('button', { name: 'Yes, generate' })
    expect(confirm.parentElement).toHaveTextContent('1 PV')
    expect(confirm.parentElement).toHaveTextContent('RM 15,001.50')
    fireEvent.click(confirm)
    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith('2026-08-01', 'staff', '2026-09-15', 'department', 'finance', ['row-Amy', 'row-Ben', 'row-Cara', 'row-Devi', 'row-Ezra'], [
      { payroll_row_id: 'row-Amy', component: 'net', account: 'account_1', expected_amount: 1000.1, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Ben', component: 'net', account: 'account_1', expected_amount: 2000.2, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Cara', component: 'net', account: 'account_1', expected_amount: 3000.3, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Devi', component: 'net', account: 'account_1', expected_amount: 4000.4, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
      { payroll_row_id: 'row-Ezra', component: 'net', account: 'account_1', expected_amount: 5000.5, expected_bank_name: 'CIMB', expected_bank_account_no: '1234567890' },
    ]))
  })

  it('retains statutory choices by department and payment date when returning from review', async () => {
    render(<PaymentBoard {...boardProps(true)} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    const panel = screen.getByRole('dialog', { name: 'PERKESO Manual generate' })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(within(panel).getByRole('button', { name: 'Review PVs →' })).toBeDisabled()
    for (const name of ['Amy', 'Cara', 'Ezra']) fireEvent.click(within(panel).getByRole('checkbox', { name: `Select ${name}` }))
    fireEvent.change(within(panel).getByLabelText('Payment date'), { target: { value: '2026-09-16' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'HR 1 remaining' }))
    expect(within(panel).getByRole('checkbox', { name: 'Select Faye' })).not.toBeChecked()
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Select Faye' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Finance 5 remaining' }))
    expect(within(panel).getByRole('checkbox', { name: 'Select Cara' })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: 'Select Ben' })).not.toBeChecked()
    expect(within(panel).getByLabelText('Payment date')).toHaveValue('2026-09-16')
    fireEvent.click(within(panel).getByRole('button', { name: 'Review PVs →' }))
    expect(within(panel).getByRole('heading', { name: 'Review 6 PVs' })).toBeVisible()
    expect(panel).toHaveTextContent('RM 102.00')
    expect(within(panel).queryByText('Faye')).not.toBeInTheDocument()
    expect(actions.statutory).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Back to selection' }))
    expect(within(panel).getByRole('checkbox', { name: 'Select Amy' })).toBeChecked()
    expect(within(panel).getByLabelText('Payment date')).toHaveValue('2026-09-16')
    fireEvent.click(within(panel).getByRole('button', { name: 'HR 1 remaining' }))
    expect(within(panel).getByRole('checkbox', { name: 'Select Faye' })).toBeChecked()
    fireEvent.click(within(panel).getByRole('button', { name: 'Finance 5 remaining' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Review PVs →' }))
    expect(actions.statutory).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm generation' }))
    await waitFor(() => expect(actions.statutory).toHaveBeenCalledExactlyOnceWith('2026-08-01', ['SOCSO', 'EIS'], 'staff', 'employee', 'finance', ['row-Amy', 'row-Cara', 'row-Ezra'], '2026-09-16', { total: 102, voucherCount: 6 }))
  })

  it.each(['Close', 'Escape', 'backdrop'] as const)('dismisses the statutory window with %s and returns focus without generating', (method) => {
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    const trigger = screen.getByRole('button', { name: 'Manual generate' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'PERKESO Manual generate' })
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Amy' }))
    if (method === 'Close') fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    else if (method === 'Escape') fireEvent(dialog, new Event('cancel', { cancelable: true }))
    else fireEvent.click(dialog, { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(actions.statutory).not.toHaveBeenCalled()
    expect(actions.create).not.toHaveBeenCalled()
  })

  it('keeps the statutory review open during generation and prevents another submission', async () => {
    let finish!: (result: { count: number; people: number; total: number }) => void
    actions.statutory.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    const dialog = screen.getByRole('dialog', { name: 'PERKESO Manual generate' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Amy' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review PVs →' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm generation' }))
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Back to selection' })).toBeDisabled()
    const generating = within(dialog).getByRole('button', { name: 'Generating…' })
    expect(generating).toBeDisabled()
    fireEvent.click(generating)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    fireEvent.click(dialog, { clientX: -1, clientY: -1 })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog).toBeVisible()
    expect(actions.statutory).toHaveBeenCalledExactlyOnceWith('2026-08-01', ['SOCSO', 'EIS'], 'staff', 'employee', 'finance', ['row-Amy'], undefined, { total: 34, voucherCount: 2 })
    finish({ count: 2, people: 1, total: 34 })
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('2 PVs generated'))
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(actions.refresh).toHaveBeenCalledOnce()
  })

  it('leaves failed statutory generation reviewable and does not claim success', async () => {
    actions.statutory.mockRejectedValue(new Error('Selection changed. Refresh and review again.'))
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate by Department' }))
    const panel = screen.getByRole('dialog', { name: 'PERKESO Generate by Department' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Review PVs →' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm generation' }))
    await waitFor(() => expect(within(panel).getByRole('alert')).toHaveTextContent('Selection changed'))
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Back to selection' })).toBeEnabled()
  })
})
