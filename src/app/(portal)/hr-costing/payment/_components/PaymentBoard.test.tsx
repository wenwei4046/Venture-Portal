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

function boardProps(): BoardProps {
  const cycle = normaliseCycle({
    period: '2026-08-01', run: { id: 'run', status: 'paid', total_amount: 15001.5 },
    funding: { staff: { id: 'funding', status: 'completed', amount: 15001.5, pv_date: '2026-09-10' } },
    people: [['Amy', 1000.1], ['Ben', 2000.2], ['Cara', 3000.3], ['Devi', 4000.4], ['Ezra', 5000.5]].map(([name, net]) => ({
      row_id: `row-${name}`, staff_id: `staff-${name}`, name, net, gross: net, prev_net: 900,
      dept_id: 'finance', dept_name: 'Finance', bank_name: 'CIMB', bank_account_no: '1234567890',
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

describe('Payment statement tabs and confirmation', () => {
  it('keeps reporting visible and shows changes only in Salary', () => {
    render(<PaymentBoard {...boardProps()} />)
    expect(screen.getByRole('tab', { name: 'Salary' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Changes from July' })).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Statutory' }))
    expect(screen.getByText('Total payroll cost')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Changes from July' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Statutory PVs' })).toBeVisible()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Statutory' }), { key: 'ArrowLeft' })
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
    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith('2026-08-01', 'staff', '2026-09-15', 'employee', 'finance', ['row-Amy', 'row-Cara', 'row-Ezra']))
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
    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith('2026-08-01', 'staff', '2026-09-15', 'department', 'finance', ['row-Amy', 'row-Ben', 'row-Cara', 'row-Devi', 'row-Ezra']))
  })

  it('retains manual statutory choices across tabs and confirms both schemes atomically', async () => {
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Statutory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    let panel = screen.getByRole('region', { name: 'PERKESO Manual generate' })
    for (const name of ['Amy', 'Cara', 'Ezra']) fireEvent.click(within(panel).getByRole('checkbox', { name: `Select ${name}` }))
    fireEvent.change(within(panel).getByLabelText('Payment date'), { target: { value: '2026-09-16' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Salary' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Statutory' }))
    panel = screen.getByRole('region', { name: 'PERKESO Manual generate' })
    expect(within(panel).getByRole('checkbox', { name: 'Select Cara' })).toBeChecked()
    fireEvent.click(within(panel).getByRole('button', { name: 'Review PVs →' }))
    expect(within(panel).getByRole('heading', { name: 'Review 6 PVs' })).toBeVisible()
    expect(panel).toHaveTextContent('RM 102.00')
    expect(actions.statutory).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm generation' }))
    await waitFor(() => expect(actions.statutory).toHaveBeenCalledExactlyOnceWith('2026-08-01', ['SOCSO', 'EIS'], 'staff', 'employee', 'finance', ['row-Amy', 'row-Cara', 'row-Ezra'], '2026-09-16', { total: 102, voucherCount: 6 }))
  })

  it('leaves failed statutory generation reviewable and does not claim success', async () => {
    actions.statutory.mockRejectedValue(new Error('Selection changed. Refresh and review again.'))
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Statutory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate by Department' }))
    const panel = screen.getByRole('region', { name: 'PERKESO Generate by Department' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Review PVs →' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm generation' }))
    await waitFor(() => expect(within(panel).getByRole('alert')).toHaveTextContent('Selection changed'))
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Back to selection' })).toBeEnabled()
  })
})
