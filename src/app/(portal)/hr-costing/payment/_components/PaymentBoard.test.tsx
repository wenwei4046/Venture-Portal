import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  contributionTotals, cycleHeadline, cycleTotals, groupDepartments, milestones,
  normaliseCycle, payVariances, statutoryRows, type HeadlineInput,
} from '@/lib/payment-cycle'
import PaymentBoard, { type BoardProps } from './PaymentBoard'

const actions = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
vi.mock('../actions', () => ({
  createPayrollDisbursement: actions.create,
  generateStatutoryDirectorTopup: vi.fn(),
  generateStatutoryScheme: vi.fn(),
  setPayrollPvDate: vi.fn(),
}))

function boardProps(): BoardProps {
  const cycle = normaliseCycle({
    period: '2026-08-01',
    run: { id: 'run', status: 'paid', total_amount: 15001.5 },
    funding: { staff: { id: 'funding', status: 'completed', amount: 15001.5, pv_date: '2026-09-10' } },
    people: [
      ['Amy', 1000.1], ['Ben', 2000.2], ['Cara', 3000.3], ['Devi', 4000.4], ['Ezra', 5000.5],
    ].map(([name, net]) => ({
      row_id: `row-${name}`, staff_id: `staff-${name}`, name, net, gross: net,
      dept_id: 'finance', dept_name: 'Finance', bank_name: 'CIMB', bank_account_no: '1234567890',
    })),
  })
  const groups = groupDepartments(cycle.people)
  const rows = statutoryRows(cycle, groups)
  const totals = cycleTotals(cycle, rows)
  const input: HeadlineInput = {
    cycle, groups, rows, phase: 'funded', staffFunded: true, directorsFunded: false,
    today: '2026-09-12', plannedStaffDate: '2026-09-15', plannedDirectorDate: '2026-09-15',
  }
  return {
    period: cycle.period, periodLabel: 'August 2026', periodRange: '1–31 Aug 2026', prevMonthName: 'July',
    groups, rows, totals, band: contributionTotals(cycle.people), headline: cycleHeadline(input),
    milestones: milestones(input), variances: payVariances(cycle.people), phase: 'funded',
    staffFunded: true, directorsFunded: false, payoutBank: { name: 'Alliance Bank', last4: '3210' },
    today: input.today, defaultDate: input.plannedStaffDate, fundingSlot: null,
    facts: {
      ctc: totals.ctc, fundedAll: true, fundedDate: '2026-09-10', fundingPvs: ['funding-pv'],
      fundingWord: '', poolBalance: totals.ctc, staffNet: totals.staffNet, staffCount: totals.staffCount,
      staffDate: '2026-09-15', staffPaid: false, dirNet: 0, dirCount: 0, dirDate: null,
      dirPaid: false, dirFunded: false, statutory: 0, statDue: '2026-09-15', poolAfterSalary: 0,
      statDone: false, statPaidDate: null,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.create.mockResolvedValue({ group_id: 'new-group', scope: 'staff', count: 1, people: 3, total: 9000.9 })
})

describe('PaymentBoard confirmation boundary', () => {
  it('replaces a whole-department list confirmation with a fresh confirmation for the saved subset', async () => {
    render(<PaymentBoard {...boardProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select people ›' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose employees' }))
    for (const name of ['Amy', 'Cara', 'Ezra']) {
      fireEvent.click(within(dialog).getByRole('checkbox', { name: `Select ${name}` }))
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    // The list intentionally generates the whole department, even when the window has a saved subset.
    fireEvent.click(screen.getByRole('button', { name: 'Generate 1 PV' }))
    expect(screen.getByRole('button', { name: 'Yes, generate' }).parentElement).toHaveTextContent('RM 15,001.50')
    fireEvent.click(screen.getByRole('button', { name: 'Select people ›' }))

    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('3 of 5 selected')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Yes, generate' })).not.toBeInTheDocument()
    expect(actions.create).not.toHaveBeenCalled()

    // Only a new confirmation of those three people may invoke the six-argument action.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 PV · 3 people' }))
    const yes = within(dialog).getByRole('button', { name: 'Yes, generate' })
    expect(yes.parentElement).toHaveTextContent('RM 9,000.90')
    expect(yes.parentElement).toHaveTextContent('Amy · Cara · Ezra')

    // Background defaults can change, but the review and submission must retain the confirmed snapshot.
    fireEvent.click(screen.getByRole('button', { name: 'Employee', exact: true }))
    fireEvent.change(screen.getByLabelText('Staff pay date'), { target: { value: '2026-09-22' } })
    expect(screen.getByRole('button', { name: 'Employee', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Staff pay date')).toHaveValue('2026-09-22')
    expect(within(dialog).getByRole('button', { name: 'One grouped PV' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'One PV per employee' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByLabelText('Pay date')).toHaveValue('2026-09-15')
    expect(within(dialog).getByText('3 of 5 selected')).toBeVisible()
    expect(yes.parentElement).toHaveTextContent('Generate 1 PV')
    expect(yes.parentElement).toHaveTextContent('3 staff')
    expect(yes.parentElement).toHaveTextContent('RM 9,000.90')
    expect(yes.parentElement).toHaveTextContent('Amy · Cara · Ezra')
    expect(yes.parentElement).toHaveTextContent('on 15 Sep')
    fireEvent.click(yes)

    await waitFor(() => expect(actions.create).toHaveBeenCalledExactlyOnceWith(
      '2026-08-01', 'staff', '2026-09-15', 'department', 'finance', ['row-Amy', 'row-Cara', 'row-Ezra'],
    ))
    await waitFor(() => expect(actions.refresh).toHaveBeenCalledTimes(1))
  })
})
