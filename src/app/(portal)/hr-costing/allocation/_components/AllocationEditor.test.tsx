import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitLock, type SplitLockInput } from '@/lib/staff-allocation'
import AllocationEditor, { type StaffAllocationData } from './AllocationEditor'

const actions = vi.hoisted(() => ({ saveStaffAllocation: vi.fn() }))
vi.mock('../actions', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const companies = [
  { id: 'hc', name: 'HOUZS Century', short_code: 'HC' },
  { id: 'car', name: 'Carres', short_code: 'CAR' },
]

function person(name: string, lock: Partial<SplitLockInput>): StaffAllocationData {
  return {
    staffId: name,
    name,
    dept: 'IT',
    departmentId: 'd-it',
    employerCost: 5171.75,
    rows: [{ companyId: 'hc', pct: 50 }],
    moves: [],
    lock: splitLock({
      status: 'draft', revenue: false, completedAt: null, topupOpenedAt: null, topupKind: null, monthClosed: false,
      ...lock,
    }),
    centralized: false,
  }
}

function card(name: string): HTMLElement {
  const el = screen.getByText(name).closest('.rounded-card')
  if (!(el instanceof HTMLElement)) throw new Error(`no card for ${name}`)
  return el
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AllocationEditor — the split follows the payroll row', () => {
  // User 2026-09-30: payroll 那边一 complete，这边就不能再 edit.
  it('keeps a draft editable and freezes somebody Completed', () => {
    render(
      <AllocationEditor
        period="2026-09-01"
        companies={companies}
        readOnly={false}
        staff={[
          person('CHEW WEE HO', {}),
          person('TAN YONG HONG', { status: 'completed', completedAt: '2026-09-30T02:00:00Z' }),
        ]}
      />,
    )

    const draft = within(card('CHEW WEE HO'))
    expect(draft.getByText('Draft')).toBeInTheDocument()
    expect(draft.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(draft.getByRole('button', { name: '+ Company' })).toBeInTheDocument()
    expect(draft.getByRole('combobox')).toBeEnabled()

    const done = within(card('TAN YONG HONG'))
    expect(done.getByText('Completed 30 Sep')).toBeInTheDocument()
    expect(done.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(done.queryByRole('button', { name: '+ Company' })).toBeNull()
    expect(done.queryByRole('button', { name: 'Remove row' })).toBeNull()
    expect(done.getByRole('combobox')).toBeDisabled()
    expect(done.getByRole('spinbutton')).toBeDisabled()
    expect(done.getByText('Locked with their pay · Unlock them on HR › Payroll to change it')).toBeInTheDocument()
    // The split it left with still shows, with what it bills.
    expect(done.getByRole('spinbutton')).toHaveValue(50)
  })

  it('says where to go for somebody with Finance, and for a closed month', () => {
    render(
      <AllocationEditor
        period="2026-09-01"
        companies={companies}
        readOnly={false}
        staff={[
          person('LOW CHENG AN', { status: 'submitted' }),
          person('NUR AIN', { monthClosed: true }),
        ]}
      />,
    )
    expect(within(card('LOW CHENG AN')).getByText('With Finance')).toBeInTheDocument()
    expect(within(card('LOW CHENG AN')).getByText('Locked with their pay · Resubmit them on HR › Payroll to change it')).toBeInTheDocument()
    expect(within(card('NUR AIN')).getByText('Payroll for this month is closed for good')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('says why when a page opened before the Complete tries to save, and refreshes', async () => {
    const reason =
      "TAN YONG HONG's September 2026 pay is Completed — its billing split is locked with it. Unlock them on HR › Payroll to change it"
    actions.saveStaffAllocation.mockResolvedValue({ ok: false, reason })
    render(
      <AllocationEditor period="2026-09-01" companies={companies} readOnly={false} staff={[person('TAN YONG HONG', {})]} />,
    )
    const c = within(card('TAN YONG HONG'))
    fireEvent.change(c.getByRole('spinbutton'), { target: { value: '60' } })
    fireEvent.click(c.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(c.getByText(reason)).toBeInTheDocument())
    expect(actions.saveStaffAllocation).toHaveBeenCalledWith('TAN YONG HONG', '2026-09-01', [{ companyId: 'hc', pct: 60 }], [])
    expect(refresh).toHaveBeenCalled()
    expect(c.queryByText('Saved.')).toBeNull()
  })

  // Found in the 2026-09-30 E2E: after Copy from last month the page said
  // "1 of 55 staff allocated" while the copied person's card stayed empty —
  // the form was seeded once and never followed a refresh.
  it('shows a split that arrives with a refresh, unless the card is being edited', () => {
    const empty = { ...person('TAN YONG HONG', {}), rows: [] }
    const copied = { ...empty, rows: [{ companyId: 'hc', pct: 50 }, { companyId: 'car', pct: 25 }] }
    const editing = { ...person('CHEW WEE HO', {}), rows: [] }
    const { rerender } = render(
      <AllocationEditor period="2026-09-01" companies={companies} readOnly={false} staff={[empty, editing]} />,
    )
    // CHEW is mid-edit when the refresh lands.
    fireEvent.click(within(card('CHEW WEE HO')).getByRole('button', { name: '+ Company' }))
    fireEvent.change(within(card('CHEW WEE HO')).getByRole('spinbutton'), { target: { value: '15' } })

    rerender(
      <AllocationEditor
        period="2026-09-01"
        companies={companies}
        readOnly={false}
        staff={[copied, { ...editing, rows: [{ companyId: 'car', pct: 80 }] }]}
      />,
    )
    expect(within(card('TAN YONG HONG')).getAllByRole('spinbutton').map((i) => (i as HTMLInputElement).value)).toEqual(['50', '25'])
    expect(within(card('CHEW WEE HO')).getAllByRole('spinbutton').map((i) => (i as HTMLInputElement).value)).toEqual(['15'])
  })

  // 2026-09-30: a centralized department bills by invoice. Somebody of theirs
  // is only listed while a split is left over from before — it can be
  // cleared, never edited.
  it('offers only to clear a split left over in a centralized department', async () => {
    actions.saveStaffAllocation.mockResolvedValue({ ok: true })
    render(
      <AllocationEditor
        period="2026-09-01"
        companies={companies}
        readOnly={false}
        staff={[{ ...person('WONG JOEY', {}), dept: 'Marketing', centralized: true }]}
      />,
    )
    const c = within(card('WONG JOEY'))
    expect(c.getByText('Marketing is centralized — billed by invoice, not split. This split is left from before.')).toBeInTheDocument()
    expect(c.getByRole('combobox')).toBeDisabled()
    expect(c.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(c.queryByRole('button', { name: '+ Company' })).toBeNull()
    fireEvent.click(c.getByRole('button', { name: 'Clear split' }))
    await waitFor(() => expect(actions.saveStaffAllocation).toHaveBeenCalledWith('WONG JOEY', '2026-09-01', []))
  })

  it('opens again while a Resubmit has the row back in draft', () => {
    render(
      <AllocationEditor
        period="2026-09-01"
        companies={companies}
        readOnly={false}
        staff={[person('SITI AISYAH', { topupOpenedAt: '2026-10-02T02:00:00Z', topupKind: 'resubmit' })]}
      />,
    )
    const c = within(card('SITI AISYAH'))
    expect(c.getByText('Resubmit · editing')).toBeInTheDocument()
    expect(c.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

// Payroll cost moved to another department (2026-11-03, method B — the user: "我说的意思是example 从director office
// split 薪水去hr, 也要开一张bill"): + Department beside + Company; HV is what companies and departments leave.
describe('AllocationEditor — part of the cost to another department', () => {
  const departments = [
    { id: 'd-do', name: 'Director Office', costModel: 'cost_center' as const, isInternal: false, segmentKey: 'director_office' },
    { id: 'd-hr', name: 'HR', costModel: 'cost_center' as const, isInternal: false, segmentKey: 'hr' },
    { id: 'd-fin', name: 'Finance', costModel: 'cost_center' as const, isInternal: false, segmentKey: 'finance' },
    { id: 'd-mkt', name: 'Marketing', costModel: 'centralized' as const, isInternal: false, segmentKey: 'marketing' },
    { id: 'd-vo', name: 'Venture Office', costModel: 'cost_center' as const, isInternal: true, segmentKey: null },
    { id: 'd-lead', name: 'Lead Department', costModel: 'cost_center' as const, isInternal: false, segmentKey: null },
  ]
  const vivian = (over: Partial<StaffAllocationData> = {}, lock: Partial<SplitLockInput> = {}): StaffAllocationData => ({
    ...person('VIVIAN', lock),
    dept: 'Director Office',
    departmentId: 'd-do',
    employerCost: 6000,
    rows: [{ companyId: 'hc', pct: 25 }, { companyId: 'car', pct: 25 }],
    ...over,
  })
  const draw = (staff: StaffAllocationData[]) =>
    render(<AllocationEditor period="2026-11-01" companies={companies} departments={departments} readOnly={false} staff={staff} />)

  it('+ Department adds a row whose box shows only after Fixed RM or % is picked', () => {
    draw([vivian()])
    const c = within(card('VIVIAN'))
    fireEvent.click(c.getByRole('button', { name: '+ Department' }))
    const line = within(c.getByRole('group', { name: 'Department line' }))
    expect(line.queryByRole('spinbutton')).toBeNull()
    expect(line.getByText('Pick Fixed RM or %')).toBeInTheDocument()
    fireEvent.click(line.getByRole('button', { name: 'Fixed RM' }))
    expect(line.getByRole('button', { name: 'Fixed RM' })).toHaveAttribute('aria-pressed', 'true')
    expect(line.getByRole('spinbutton', { name: 'Amount (RM)' })).toBeInTheDocument()
    fireEvent.click(line.getByRole('button', { name: '%' }))
    expect(line.getByRole('spinbutton', { name: 'Percentage' })).toBeInTheDocument()
  })

  it('the department list leaves out the person’s own department, Venture Office and pool-less departments', () => {
    draw([vivian()])
    const c = within(card('VIVIAN'))
    fireEvent.click(c.getByRole('button', { name: '+ Department' }))
    const select = within(c.getByRole('group', { name: 'Department line' })).getByRole('combobox')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Department…', 'HR', 'Finance', 'Marketing'])
  })

  it('HV reads 0.00% for Vivian 25/25 + RM 3,000', async () => {
    actions.saveStaffAllocation.mockResolvedValue({ ok: true })
    draw([vivian({ moves: [{ departmentId: 'd-hr', kind: 'amount', value: 3000 }] })])
    const c = within(card('VIVIAN'))
    const hv = within(c.getByRole('group', { name: 'HV — HOUZS Venture' }))
    expect(hv.getByText('0.00')).toBeInTheDocument()
    expect(hv.getByText('RM 0.00')).toBeInTheDocument()
    expect(within(c.getByRole('group', { name: 'Department line' })).getByText('= 50.00% of the cost')).toBeInTheDocument()
    expect(c.getByText(/To departments/)).toHaveTextContent('To departments RM 3,000.00')
    // Made 40%: HV keeps 10%.
    const line = within(c.getByRole('group', { name: 'Department line' }))
    fireEvent.click(line.getByRole('button', { name: '%' }))
    fireEvent.change(line.getByRole('spinbutton', { name: 'Percentage' }), { target: { value: '40' } })
    expect(hv.getByText('10.00')).toBeInTheDocument()
    expect(hv.getByText('RM 600.00')).toBeInTheDocument()
    fireEvent.click(c.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(actions.saveStaffAllocation).toHaveBeenCalledWith('VIVIAN', '2026-11-01', [{ companyId: 'hc', pct: 25 }, { companyId: 'car', pct: 25 }], [
        { departmentId: 'd-hr', kind: 'pct', value: 40 },
      ]),
    )
  })

  it('a centralized person shows + Department only; leftover “Stays in Marketing”', () => {
    draw([
      vivian(),
      { ...person('AMIRUL', {}), dept: 'Marketing', departmentId: 'd-mkt', centralized: true, employerCost: 4000, rows: [], moves: [{ departmentId: 'd-fin', kind: 'pct', value: 25 }] },
    ])
    expect(screen.getByText('Marketing · 1 person')).toBeInTheDocument()
    const c = within(card('AMIRUL'))
    expect(c.queryByRole('button', { name: '+ Company' })).toBeNull()
    expect(c.getByRole('button', { name: '+ Department' })).toBeInTheDocument()
    const stays = within(c.getByRole('group', { name: 'Stays in Marketing' }))
    expect(stays.getByText('75.00')).toBeInTheDocument()
    expect(stays.getByText('RM 3,000.00')).toBeInTheDocument()
  })

  it('a submitted person’s lines are locked with the split’s words; after Resubmit they open', () => {
    const moves = [{ departmentId: 'd-hr', kind: 'amount' as const, value: 3000 }]
    const { unmount } = draw([vivian({ moves }, { status: 'submitted' })])
    const c = within(card('VIVIAN'))
    expect(c.getByText('Locked with their pay · Resubmit them on HR › Payroll to change it')).toBeInTheDocument()
    expect(c.queryByRole('button', { name: '+ Department' })).toBeNull()
    const line = within(c.getByRole('group', { name: 'Department line' }))
    expect(line.getByRole('combobox')).toBeDisabled()
    expect(line.getByRole('spinbutton', { name: 'Amount (RM)' })).toBeDisabled()
    expect(line.queryByRole('button', { name: 'Remove line' })).toBeNull()
    unmount()

    draw([vivian({ moves }, { topupOpenedAt: '2026-11-20T02:00:00Z', topupKind: 'resubmit' })])
    const open = within(card('VIVIAN'))
    expect(open.getByRole('button', { name: '+ Department' })).toBeInTheDocument()
    expect(within(open.getByRole('group', { name: 'Department line' })).getByRole('spinbutton', { name: 'Amount (RM)' })).toBeEnabled()
  })
})
