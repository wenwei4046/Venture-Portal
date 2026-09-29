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
    employerCost: 5171.75,
    rows: [{ companyId: 'hc', pct: 50 }],
    lock: splitLock({
      status: 'draft', revenue: false, completedAt: null, topupOpenedAt: null, topupKind: null, monthClosed: false,
      ...lock,
    }),
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
    expect(actions.saveStaffAllocation).toHaveBeenCalledWith('TAN YONG HONG', '2026-09-01', [{ companyId: 'hc', pct: 60 }])
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
