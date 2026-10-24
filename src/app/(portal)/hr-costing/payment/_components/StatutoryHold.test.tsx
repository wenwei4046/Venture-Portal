import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  contributionTotals, cycleHeadline, cycleTotals, groupDepartments, milestones,
  normaliseCycle, payVariances, statutoryRows, type HeadlineInput,
} from '@/lib/payment-cycle'
import { statutorySelection } from '@/lib/statutory-selection'
import PaymentBoard, { type BoardProps } from './PaymentBoard'

const actions = vi.hoisted(() => ({ statutory: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
vi.mock('../actions', () => ({ createPayrollDisbursement: vi.fn(), generateStatutorySelection: actions.statutory, setPayrollPvDate: vi.fn() }))

// 2026-10-24 — HR: "kris and peter PCB I updated amount Kris - RM647.90 Peter -
// RM1429.15 … In Payment Statutory page still showing Kris PCB amount - RM
// 1821.90". September's batch #3 sent both with PCB 1,821.90; HR unlocked them
// for a Resubmit and put the PCB right. Until the resubmit is sent, the page
// must not offer the old figure — Generate by Department would have paid LHDN
// RM 1,566.75 too much.
function september(withMei: boolean) {
  const person = (name: string, pcb: number, resubmitOpen = false) => ({
    row_id: `row-${name}`, staff_id: `staff-${name}`, name, code: `HV-${name}`, scope: 'staff',
    dept_id: 'revenue', dept_name: 'Revenue Department', bank_name: 'CIMB', bank_account_no: '1234567890',
    gross: 30000, net: 25000, pcb, resubmit_open: resubmitOpen,
  })
  return normaliseCycle({
    period: '2026-09-01', run: { id: 'run', status: 'approved', total_amount: 100000 },
    funding: { staff: { id: 'funding', status: 'completed', amount: 100000, pv_date: '2026-10-15' } },
    people: [person('KRIS', 1821.9, true), person('LUCAS', 930), person('PETER', 1821.9, true), ...(withMei ? [person('MEI', 100)] : [])],
    statutory_vouchers: [{ id: 'pv-lhdn', no: 'HV-PV-1', payee: 'LHDN', status: 'paid', amount: 930, payment_date: '2026-10-15', description: 'PCB — Sep 2026 payroll (Revenue Department · 1 people)' }],
    statutory_coverage: [{ row_id: 'row-LUCAS', scope: 'staff', scheme: 'PCB', voucher_id: 'pv-lhdn', amount: 930 }],
  })
}

function boardProps(withMei: boolean): BoardProps {
  const cycle = september(withMei)
  const groups = groupDepartments(cycle.people), rows = statutoryRows(cycle, groups), totals = cycleTotals(cycle, rows)
  const input: HeadlineInput = { cycle, groups, rows, phase: 'funded', staffFunded: true, directorsFunded: false, today: '2026-10-24', plannedStaffDate: '2026-10-24', plannedDirectorDate: '2026-10-24' }
  return {
    period: cycle.period, periodLabel: 'September 2026', periodRange: '1–30 Sep 2026', prevMonthName: 'August',
    groups, rows, totals, band: contributionTotals(cycle.people), headline: cycleHeadline(input), statutoryCoverage: cycle.statutory_coverage,
    milestones: milestones(input), variances: payVariances(cycle.people), phase: 'funded',
    staffFunded: true, directorsFunded: false, payoutBank: { name: 'Alliance Bank', last4: '3210' },
    today: input.today, defaultDate: input.plannedStaffDate, fundingSlot: null,
    facts: { ctc: totals.ctc, fundedAmount: totals.ctc, fundedAll: true, fundedDate: '2026-10-15', fundingPvs: [],
      fundingWord: '', poolBalance: totals.ctc, staffNet: totals.staffNet, staffCount: totals.staffCount,
      staffDate: '2026-10-15', staffPaid: false, dirNet: 0, dirCount: 0, dirDate: null, dirPaid: false,
      dirFunded: false, statutory: totals.statutory, statDue: '2026-10-15', poolAfterSalary: 0, statDone: false, statPaidDate: null },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.statutory.mockResolvedValue({ count: 1, people: 1, total: 100 })
})

describe('a resubmit still open waits (the figures)', () => {
  it('reads resubmit_open, and an older server’s answer as not open', () => {
    expect(september(false).people.map(p => [p.name, p.resubmit_open])).toEqual([['KRIS', true], ['LUCAS', false], ['PETER', true]])
    expect(normaliseCycle({ people: [{ row_id: 'x', name: 'X' }] }).people[0].resubmit_open).toBe(false)
  })

  it('says the month waits for the resubmit, not for a PV, once their salary is paid', () => {
    const headline = (withMei: boolean) => {
      const cycle = september(withMei)
      cycle.people.forEach(p => { p.voucher = { id: `pv-${p.name}`, no: null, status: 'paid', payment_date: '2026-10-15', created_at: null, approved_at: null, granularity: 'department', group_id: 'g' } })
      const groups = groupDepartments(cycle.people)
      return cycleHeadline({ cycle, groups, rows: statutoryRows(cycle, groups), phase: 'funded', staffFunded: true, directorsFunded: false, today: '2026-10-24', plannedStaffDate: '2026-10-24', plannedDirectorDate: '2026-10-24' })
    }
    expect(headline(false)).toMatchObject({
      word: 'Waiting for a resubmit',
      detail: '1 statutory PVs paid · 2 people wait for a resubmit on Payroll.',
      action: { kind: 'payroll', label: 'Open Payroll →', href: '/hr-costing/payroll/2026-09-01' },
    })
    expect(headline(true)).toMatchObject({ word: 'Statutory partly paid', action: { kind: 'generate-statutory' } })
  })

  it('leaves KRIS and PETER out of a PV, and counts what they owe as waiting', () => {
    const cycle = september(true)
    const selection = statutorySelection(cycle.people, ['PCB'], cycle.statutory_coverage ?? [], null, 'department')
    expect(selection.rowIds).toEqual(['row-MEI'])
    expect(selection.total).toBe(100)
    const lhdn = statutoryRows(cycle, groupDepartments(cycle.people)).find(r => r.scheme === 'PCB')!
    expect(lhdn).toMatchObject({ remainingAmount: 3743.8, heldAmount: 3643.8, heldRowIds: ['row-KRIS', 'row-PETER'], stage: 'partial' })
  })
})

describe('a resubmit still open waits (HR › Payment › Statutory)', () => {
  it('names them in the LHDN row and generates only the others', async () => {
    render(<PaymentBoard {...boardProps(true)} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    const row = screen.getByRole('button', { name: /^LHDN$/ }).closest('tr')!
    expect(within(row).getByText('2 waiting for a resubmit')).toBeInTheDocument()
    expect(within(row).getByText('100.00 to generate')).toBeInTheDocument()

    fireEvent.click(within(row).getByRole('button', { name: 'Generate by Department' }))
    const dialog = screen.getByRole('dialog', { name: 'LHDN Generate by Department' })
    expect(within(dialog).getByRole('button', { name: /Revenue Department/ })).toHaveTextContent('1 remaining')
    const line = (name: string) => within(dialog).getByText(name).closest('tr')!
    for (const name of ['KRIS', 'PETER']) {
      expect(within(line(name)).getByText('—')).toBeInTheDocument()
      expect(within(line(name)).getByText('Resubmit open')).toHaveAttribute('title', `Send ${name}'s resubmit on HR › Payroll first`)
    }
    expect(within(line('LUCAS')).getByText('Already covered')).toBeInTheDocument()
    expect(within(line('MEI')).getByText('To generate')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Review PVs →' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm generation' }))
    expect(actions.statutory).toHaveBeenCalledExactlyOnceWith('2026-09-01', ['PCB'], 'staff', 'department', 'revenue', ['row-MEI'], undefined, { total: 100, voucherCount: 1 })
  })

  it('offers nothing to generate when only they remain', () => {
    render(<PaymentBoard {...boardProps(false)} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Statutory/ }))
    const row = screen.getByRole('button', { name: /^LHDN$/ }).closest('tr')!
    expect(within(row).getByText('2 waiting for a resubmit')).toBeInTheDocument()
    expect(within(row).queryByText(/to generate/)).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Generate by Department' })).not.toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'View details ↗' }))
    const win = screen.getByRole('dialog')
    expect(within(win).getByText('2 waiting for a resubmit')).toBeInTheDocument()
    expect(within(win).queryByRole('button', { name: 'Generate by Department' })).not.toBeInTheDocument()
  })
})
