import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rowActions, rowStatusView, type LifecycleRow } from '@/lib/payroll-lifecycle'
import PayrollRowMenu from './PayrollRowMenu'
import type { PayrollRowData } from './PayrollGrid'

const actions = vi.hoisted(() => ({
  cancelPayrollResubmit: vi.fn(), completePayrollRows: vi.fn(), resubmitPayrollRow: vi.fn(), unlockPayrollRows: vi.fn(),
}))
vi.mock('../actions', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

function row(extra: Partial<PayrollRowData> = {}): PayrollRowData {
  return {
    id: 'row-1', staff_id: 'staff-1', staff_name: 'CHEW WEE HO', dept_name: 'Finance', status: 'submitted',
    source: 'carried_forward', scope: 'staff', origin: 'staff', completed_at: '2027-12-01T02:00:00Z',
    topup_opened_at: null, topup_kind: null, batch_nos: [1], submitted_ctc: 7910,
    basic_salary: 7000, statutory_allowance: 0, non_statutory_allowance: 0, ot_hours: 0, ot_amount: 0,
    commission_amount: 0, unpaid_leave_days: 0, deduction_amount: 0, skbbk_amount: 0,
    prorata_days_worked: 31, prorata_days_in_month: 31, epf_er: 910, epf_ee: 770, socso_er: 0, socso_ee: 0,
    eis_er: 0, eis_ee: 0, pcb: 0, withholding_tax: 0, gross: 7000, net: 6230, commission_is_derived: false,
    commission_statement_href: null,
    ...extra,
  } as PayrollRowData
}

function life(r: PayrollRowData): LifecycleRow {
  return {
    id: r.id, scope: r.scope, origin: r.origin, status: r.status as LifecycleRow['status'], name: r.staff_name,
    dept: r.dept_name, ctc: 7910, submittedCtc: r.submitted_ctc, batchNos: r.batch_nos, completedAt: r.completed_at,
    topupOpenedAt: r.topup_opened_at, topupKind: null,
  }
}

function open(r = row()) {
  const onDone = vi.fn()
  render(<PayrollRowMenu row={r} period="2027-12-01" anchor={{ left: 10, top: 10, bottom: 30 }} byRightClick
    actions={rowActions(life(r), false)} status={rowStatusView(life(r))} onClose={vi.fn()} onDone={onDone} />)
  return { onDone }
}

beforeEach(() => {
  actions.resubmitPayrollRow.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PayrollRowMenu — Resubmit and Second payroll', () => {
  // User 2026-09-27: 我可以按 resubmit 或者是 second payroll … 以后要 track 的话，
  // 就容易 track 回：哪一些是写错要 resubmit，哪一些是属于 second payroll.
  it('offers both to somebody already sent, each saying what it is for', () => {
    open()
    expect(screen.getByRole('menuitem', { name: /^Resubmit…/ })).toHaveTextContent('A correction to what was sent')
    expect(screen.getByRole('menuitem', { name: /^Second payroll…/ })).toHaveTextContent('A planned second payment for December 2027 (e.g. the 15th)')
  })

  it('opens a second payroll as a second payroll, after asking', async () => {
    const { onDone } = open()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Second payroll…/ }))
    const confirm = screen.getByRole('dialog', { name: 'Second payroll CHEW WEE HO' })
    expect(confirm).toHaveTextContent('A second payroll for CHEW WEE HO?')
    expect(confirm).toHaveTextContent('recorded as a second payroll, not a correction')
    expect(actions.resubmitPayrollRow).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Second payroll' }))
    await waitFor(() => expect(actions.resubmitPayrollRow).toHaveBeenCalledWith('2027-12-01', 'staff', 'row-1', 'second_payroll'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('CHEW WEE HO unlocked for a second payroll — amounts can only go up'))
  })

  it('opens a resubmit as a resubmit', async () => {
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Resubmit…/ }))
    expect(screen.getByRole('dialog', { name: 'Resubmit CHEW WEE HO' })).toHaveTextContent('A correction')
    fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }))
    await waitFor(() => expect(actions.resubmitPayrollRow).toHaveBeenCalledWith('2027-12-01', 'staff', 'row-1', 'resubmit'))
  })

  it('offers neither to somebody paid before batches existed', () => {
    open(row({ status: 'paid', batch_nos: [] }))
    expect(screen.queryByRole('menuitem', { name: /^Second payroll…/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Resubmit · Second payroll/ })).toBeDisabled()
  })
})
