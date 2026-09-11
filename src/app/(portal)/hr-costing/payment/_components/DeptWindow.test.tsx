import { useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { groupDepartments, type CyclePerson, type CycleVoucher } from '@/lib/payment-cycle'
import DeptRows from './DeptRows'
import DeptWindow from './DeptWindow'

function person(name: string, net: number, voucher: CycleVoucher | null = null): CyclePerson {
  return {
    row_id: `row-${name}`, staff_id: `staff-${name}`, scope: 'staff', code: null,
    name, dept_id: 'finance', dept_name: 'Finance', bank_name: 'CIMB', bank_account_no: '1234567890',
    gross: net, net, epf_er: 0, epf_ee: 0, socso_er: 0, socso_ee: 0,
    eis_er: 0, eis_ee: 0, pcb: 0, skbbk: 0, prev_net: null, voucher,
  }
}

function voucher(status: CycleVoucher['status']): CycleVoucher {
  return {
    id: `pv-${status}`, no: `HV-PV-${status}`, status, payment_date: '2026-09-05',
    created_at: null, approved_at: null, granularity: 'employee', group_id: 'approval-group',
  }
}

const unpaid = () => [
  person('Amy', 1000.1), person('Ben', 2000.2), person('Cara', 3000.3),
  person('Devi', 4000.4), person('Ezra', 5000.5),
]

function setup(overrides: Partial<ComponentProps<typeof DeptWindow>> = {}) {
  const onSelection = vi.fn()
  const onDate = vi.fn()
  const onAskGenerate = vi.fn()
  const onConfirmGenerate = vi.fn()
  const onCancel = vi.fn()
  const onSaveDates = vi.fn()
  const group = groupDepartments(unpaid())[0]

  function Harness() {
    const [selectedIds, setSelectedIds] = useState<string[] | null>(overrides.selectedIds ?? null)
    const [date, setDate] = useState(overrides.date ?? '2026-09-15')
    const [confirming, setConfirming] = useState(false)
    return (
      <DeptWindow
        group={group}
        period="2026-08-01"
        periodLabel="August 2026"
        prevMonthName="July"
        funded
        busy={null}
        error={null}
        gran="department"
        payoutBank={{ name: 'Alliance Bank', last4: '3210' }}
        onSaveDates={onSaveDates}
        onClose={vi.fn()}
        {...overrides}
        selectedIds={selectedIds}
        onSelection={(ids) => { onSelection(ids); setSelectedIds(ids) }}
        date={date}
        onDate={(value) => { onDate(value); setDate(value) }}
        confirming={confirming}
        onAskGenerate={() => {
          onAskGenerate()
          if ((overrides.gran ?? 'department') === 'department') {
            setSelectedIds((overrides.group ?? group).people.filter((p) => p.net > 0 && !p.voucher).map((p) => p.row_id))
          }
          setConfirming(true)
        }}
        onConfirmGenerate={onConfirmGenerate}
        onCancel={() => { onCancel(); setConfirming(false) }}
      />
    )
  }

  render(<Harness />)
  return { onSelection, onDate, onAskGenerate, onConfirmGenerate, onCancel, onSaveDates }
}

function selectThree() {
  for (const name of ['Amy', 'Cara', 'Ezra']) {
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }))
  }
}

function selectionSummary(text: string) {
  const count = screen.getByText(text)
  expect(count.parentElement).not.toBeNull()
  return count.parentElement!
}

describe('DeptWindow fixed generation methods', () => {
  it('includes the whole remaining department in one PV without a format toggle or editable checkboxes', () => {
    const people = [...unpaid(), person('Fran', 6000, voucher('paid')), person('Grace', 7000, voucher('pending_approval')), person('Zero', 0)]
    const { onSelection, onConfirmGenerate } = setup({ group: groupDepartments(people)[0], selectedIds: ['row-Amy'] })

    expect(screen.getByRole('heading', { name: 'Generate by Department' })).toBeVisible()
    expect(selectionSummary('5 of 5 selected')).toHaveTextContent('RM 15,001.50 · 1 PV')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'PV granularity' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review PVs' }))

    const confirmation = screen.getByRole('button', { name: 'Yes, generate' }).parentElement!
    expect(confirmation).toHaveTextContent('Generate 1 PV · Finance · 5 staff · RM 15,001.50')
    expect(confirmation).toHaveTextContent('Amy · Ben · Cara · Devi · Ezra')
    for (const name of ['Fran', 'Grace', 'Zero']) expect(confirmation).not.toHaveTextContent(name)
    expect(onSelection).not.toHaveBeenCalled()
    expect(onConfirmGenerate).not.toHaveBeenCalled()
  })

  it('starts manual generation empty and prevents review until someone is selected', () => {
    const { onAskGenerate, onSelection } = setup({ gran: 'employee', selectedIds: [] })
    expect(screen.getByRole('heading', { name: 'Manual generate' })).toBeVisible()
    expect(selectionSummary('0 of 5 selected')).toHaveTextContent('RM 0.00 · 0 PVs')
    expect(screen.getByRole('checkbox', { name: 'Select all remaining employees' })).not.toBeChecked()
    const review = screen.getByRole('button', { name: 'Review PVs' })
    expect(review).toBeDisabled()
    fireEvent.click(review)
    expect(onAskGenerate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Amy' }))
    expect(onSelection).toHaveBeenLastCalledWith(['row-Amy'])
    expect(selectionSummary('1 of 5 selected')).toHaveTextContent('RM 1,000.10 · 1 PV')
    expect(review).toBeEnabled()
  })

  it('reviews exactly three chosen employees as three separate PVs with their amount and date locked', () => {
    const { onSelection, onAskGenerate, onConfirmGenerate, onCancel } = setup({ gran: 'employee', selectedIds: [] })
    selectThree()

    expect(onSelection).toHaveBeenLastCalledWith(['row-Amy', 'row-Cara', 'row-Ezra'])
    expect(selectionSummary('3 of 5 selected')).toHaveTextContent('RM 9,000.90 · 3 PVs')
    for (const name of ['Amy', 'Cara', 'Ezra']) expect(screen.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked()
    for (const name of ['Ben', 'Devi']) expect(screen.getByRole('checkbox', { name: `Select ${name}` })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Review PVs' }))

    expect(onAskGenerate).toHaveBeenCalledTimes(1)
    expect(onConfirmGenerate).not.toHaveBeenCalled()
    const yes = screen.getByRole('button', { name: 'Yes, generate' })
    const confirmation = yes.parentElement!
    expect(confirmation).toHaveTextContent('Generate 3 PVs · Finance · 3 staff · RM 9,000.90')
    expect(confirmation).toHaveTextContent('from Alliance Bank ···3210 on 15 Sep')
    expect(within(confirmation).getByText('Amy · Cara · Ezra')).toBeVisible()
    expect(confirmation).not.toHaveTextContent('Ben')
    expect(confirmation).not.toHaveTextContent('Devi')
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled()
    expect(screen.getByLabelText('Pay date')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Review PVs' })).toBeDisabled()

    fireEvent.click(yes)
    expect(onConfirmGenerate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Yes, generate' })).not.toBeInTheDocument()
    expect(selectionSummary('3 of 5 selected')).toHaveTextContent('RM 9,000.90 · 3 PVs')
    expect(screen.getByLabelText('Pay date')).toBeEnabled()
  })

  it('allows manual select-all and clear without changing to a grouped PV', () => {
    const { onSelection } = setup({ gran: 'employee', selectedIds: [] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all remaining employees' }))
    expect(selectionSummary('5 of 5 selected')).toHaveTextContent('RM 15,001.50 · 5 PVs')
    expect(onSelection).toHaveBeenLastCalledWith(null)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all remaining employees' }))
    expect(selectionSummary('0 of 5 selected')).toHaveTextContent('RM 0.00 · 0 PVs')
    expect(onSelection).toHaveBeenLastCalledWith([])
  })

  it('prevents selecting covered and zero-net people, even when their ids arrive in an old selection', () => {
    const people = [...unpaid(), person('Fran', 6000, voucher('paid')), person('Grace', 7000, voucher('pending_approval')), person('Zero', 0)]
    setup({ group: groupDepartments(people)[0], gran: 'employee', selectedIds: ['row-Amy', 'row-Fran', 'row-Grace', 'row-Zero'] })

    expect(selectionSummary('1 of 5 selected')).toHaveTextContent('RM 1,000.10 · 1 PV')
    for (const name of ['Fran', 'Grace', 'Zero']) {
      const checkbox = screen.getByRole('checkbox', { name: `Select ${name}` })
      expect(checkbox).toBeDisabled()
      expect(checkbox).not.toBeChecked()
    }
    expect(within(screen.getByRole('row', { name: /Fran/ })).getByText('Paid · 5 Sep')).toHaveClass('whitespace-nowrap')
    expect(within(screen.getByRole('row', { name: /Grace/ })).getByText('Awaiting Principal')).toHaveClass('whitespace-nowrap')
    fireEvent.click(screen.getByRole('button', { name: 'Review PVs' }))
    const confirmation = screen.getByRole('button', { name: 'Yes, generate' }).parentElement!
    expect(confirmation).toHaveTextContent('Generate 1 PV · Finance · 1 staff · RM 1,000.10')
    for (const name of ['Fran', 'Grace', 'Zero']) expect(confirmation).not.toHaveTextContent(name)
  })

  it('does not offer review while funding is incomplete', () => {
    const { onAskGenerate } = setup({ funded: false })
    const review = screen.getByRole('button', { name: 'Review PVs' })
    expect(review).toBeDisabled()
    expect(review).toHaveAttribute('title', 'Funding is not complete yet')
    fireEvent.click(review)
    expect(onAskGenerate).not.toHaveBeenCalled()
  })

  it('does not offer review with an invalid date', () => {
    setup({ date: '2026-02-30' })
    expect(screen.getByRole('button', { name: 'Review PVs' })).toBeDisabled()
  })

  it('keeps pending PV date edits available in records mode without offering generation for remaining people', () => {
    const people = [person('Amy', 1000.1), person('Grace', 7000, voucher('pending_approval'))]
    const { onDate, onSaveDates, onConfirmGenerate } = setup({ readOnly: true, group: groupDepartments(people)[0], date: '2026-09-05' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review PVs' })).not.toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save date on 1 PV' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Pay date'), { target: { value: '2026-09-15' } })
    expect(onDate).toHaveBeenLastCalledWith('2026-09-15')
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(onSaveDates).toHaveBeenCalledTimes(1)
    expect(onConfirmGenerate).not.toHaveBeenCalled()
    expect(screen.getByText('All generated PVs · includes paid')).toHaveAttribute('title', expect.stringContaining('saved receiving accounts'))
    expect(screen.getByRole('link', { name: 'Bank file for HV-PV-pending_approval' })).toHaveAttribute('href', '/hr-costing/payroll/2026-08-01/bank-transfer?format=alliance&vouchers=pv-pending_approval')
  })

  it.each([
    { bank_name: null, bank_account_no: null },
    { bank_name: 'Recorded bank', bank_account_no: null },
    { bank_name: null, bank_account_no: '0098765432' },
  ])('marks incomplete historical bank snapshots without offering a profile fix: %j', snapshot => {
    const pv = voucher('paid')
    const legacy = person('Legacy', 1000, pv)
    legacy.components = [{ component: 'net', amount: 1000, voucher: pv, recipient_account: null, ...snapshot }]
    setup({ readOnly: true, group: groupDepartments([legacy])[0] })
    const row = screen.getByRole('row', { name: /Legacy/ })
    expect(within(row).getByText('Bank details not recorded')).toBeVisible()
    expect(within(row).queryByRole('link', { name: /fix|Complete receiving account/ })).not.toBeInTheDocument()
    expect(row.querySelector('.bank')).not.toHaveClass('bad')
    expect(row).not.toHaveTextContent('CIMB')
    expect(row).not.toHaveTextContent('Account 1')
  })
})

describe('DeptWindow salary bank files', () => {
  it('offers separate downloads for paid Basic and remaining Commission PVs', () => {
    const employee = person('Amy', 8556.15)
    employee.components = [
      { component: 'basic', amount: 4302.7, voucher: { ...voucher('paid'), id: 'basic-pv', no: 'BASIC' }, recipient_account: 'account_1', bank_name: 'CIMB', bank_account_no: '1234567890' },
      { component: 'commission', amount: 4253.45, voucher: { ...voucher('pending_approval'), id: 'commission-pv', no: 'COMMISSION' }, recipient_account: 'account_2', bank_name: 'Maybank', bank_account_no: '9876543210' },
    ]
    setup({ readOnly: true, group: groupDepartments([employee])[0] })
    expect(screen.getByRole('link', { name: 'Bank file for BASIC' })).toHaveAttribute('href', expect.stringContaining('vouchers=basic-pv'))
    expect(screen.getByRole('link', { name: 'Bank file for COMMISSION' })).toHaveAttribute('href', expect.stringContaining('vouchers=commission-pv'))
    expect(screen.getByText('All generated PVs · includes paid')).toBeVisible()
  })
})

describe('DeptRows salary statement', () => {
  it('opens the two fixed generation methods from a department row without generating a voucher', () => {
    const groups = groupDepartments(unpaid())
    const onGenerate = vi.fn()
    const onOpen = vi.fn()
    render(<DeptRows period="2026-08-01" groups={groups} prevMonthName="July" today="2026-09-11" dates={{ staff: '2026-09-15', directors: '2026-09-15' }} fundedFor={() => true} busy={null} onGenerate={onGenerate} onOpen={onOpen} payoutBank={null} />)
    const table = screen.getByRole('table', { name: 'Salary vouchers by department' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Department', 'People', 'Net salary · RM', 'Status', 'vs July', 'PV records'])
    fireEvent.click(screen.getByRole('button', { name: 'Generate by Department' }))
    expect(onGenerate).toHaveBeenLastCalledWith(groups[0], 'department')
    fireEvent.click(screen.getByRole('button', { name: 'Manual generate' }))
    expect(onGenerate).toHaveBeenLastCalledWith(groups[0], 'employee')
    fireEvent.click(screen.getByRole('button', { name: 'View employees' }))
    expect(onOpen).toHaveBeenLastCalledWith('finance')
    expect(screen.queryByRole('group', { name: 'PV granularity' })).not.toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /Total 5 15,001.50/ })).toBeVisible()
  })

  it('shows paid records without regeneration controls', () => {
    const groups = groupDepartments([person('Amy', 1000.1, voucher('paid'))])
    const onOpen = vi.fn()
    render(<DeptRows period="2026-08-01" groups={groups} prevMonthName="July" today="2026-09-11" dates={{ staff: '2026-09-15', directors: '2026-09-15' }} fundedFor={() => true} busy={null} onGenerate={vi.fn()} onOpen={onOpen} payoutBank={null} />)
    expect(screen.getByText('Paid · 5 Sep')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Generate by Department' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manual generate' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1 PV · View' }))
    expect(onOpen).toHaveBeenLastCalledWith('finance')
  })
})
