import { useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { groupDepartments, type CyclePerson, type CycleVoucher, type Granularity } from '@/lib/payment-cycle'
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
  const onGran = vi.fn()
  const onAskGenerate = vi.fn()
  const onConfirmGenerate = vi.fn()
  const onCancel = vi.fn()
  const onClose = vi.fn()
  const group = groupDepartments(unpaid())[0]

  function Harness() {
    const [selectedIds, setSelectedIds] = useState<string[] | null>(overrides.selectedIds ?? null)
    const [gran, setGran] = useState<Granularity>(overrides.gran ?? 'department')
    const [confirming, setConfirming] = useState(false)
    return (
      <DeptWindow
        group={group}
        period="2026-08-01"
        periodLabel="August 2026"
        prevMonthName="July"
        date="2026-09-15"
        onDate={vi.fn()}
        funded
        busy={null}
        error={null}
        payoutBank={{ name: 'Alliance Bank', last4: '3210' }}
        onSaveDates={vi.fn()}
        onClose={onClose}
        {...overrides}
        selectedIds={selectedIds}
        onSelection={(ids) => { onSelection(ids); setSelectedIds(ids) }}
        gran={gran}
        onGran={(next) => { onGran(next); setGran(next) }}
        confirming={confirming}
        onAskGenerate={() => { onAskGenerate(); setConfirming(true) }}
        onConfirmGenerate={onConfirmGenerate}
        onCancel={() => { onCancel(); setConfirming(false) }}
      />
    )
  }

  render(<Harness />)
  return { onSelection, onGran, onAskGenerate, onConfirmGenerate, onCancel }
}

function selectThree() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose employees' }))
  for (const name of ['Amy', 'Cara', 'Ezra']) {
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }))
  }
}

function selectionSummary(text: string) {
  const count = screen.getByText(text)
  expect(count.parentElement).not.toBeNull()
  return count.parentElement!
}

describe('DeptWindow employee selection', () => {
  it('starts with the whole department and updates the selected amount when someone is unticked', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Whole department (5)' })).toHaveAttribute('aria-pressed', 'true')
    expect(selectionSummary('5 of 5 selected')).toHaveTextContent('RM 15,001.50 · 1 PV')
    expect(screen.getByRole('button', { name: 'Generate 1 PV · 5 people' })).toBeEnabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ben' }))

    expect(screen.getByRole('checkbox', { name: 'Select Ben' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Choose employees' })).toHaveAttribute('aria-pressed', 'true')
    expect(selectionSummary('4 of 5 selected')).toHaveTextContent('RM 13,001.30 · 1 PV')
    expect(screen.getByRole('button', { name: 'Generate 1 PV · 4 people' })).toBeEnabled()
  })

  it('keeps choosing nobody empty and prevents generation until a person is selected', () => {
    const { onAskGenerate, onSelection } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Choose employees' }))

    expect(onSelection).toHaveBeenLastCalledWith([])
    expect(selectionSummary('0 of 5 selected')).toHaveTextContent('RM 0.00 · 0 PVs')
    expect(screen.getByRole('checkbox', { name: 'Select all remaining employees' })).not.toBeChecked()
    const generate = screen.getByRole('button', { name: 'Generate 0 PVs · 0 people' })
    expect(generate).toBeDisabled()
    fireEvent.click(generate)
    expect(onAskGenerate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Amy' }))
    expect(screen.getByRole('button', { name: 'Generate 1 PV · 1 people' })).toBeEnabled()
  })

  it('keeps the chosen three people and their exact total when changing PV format', () => {
    const { onSelection, onGran } = setup()
    selectThree()

    expect(onSelection).toHaveBeenLastCalledWith(['row-Amy', 'row-Cara', 'row-Ezra'])
    expect(selectionSummary('3 of 5 selected')).toHaveTextContent('RM 9,000.90 · 1 PV')
    for (const name of ['Amy', 'Cara', 'Ezra']) expect(screen.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked()
    for (const name of ['Ben', 'Devi']) expect(screen.getByRole('checkbox', { name: `Select ${name}` })).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'One PV per employee' }))
    expect(onGran).toHaveBeenLastCalledWith('employee')
    expect(selectionSummary('3 of 5 selected')).toHaveTextContent('RM 9,000.90 · 3 PVs')
    expect(screen.getByRole('button', { name: 'Generate 3 PVs · 3 people' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'One grouped PV' }))
    expect(screen.getByRole('button', { name: 'Generate 1 PV · 3 people' })).toBeEnabled()
    expect(selectionSummary('3 of 5 selected')).toHaveTextContent('RM 9,000.90 · 1 PV')
  })

  it('lets the all-remaining checkbox clear and restore the payable selection', () => {
    const { onSelection } = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all remaining employees' }))
    expect(selectionSummary('0 of 5 selected')).toHaveTextContent('RM 0.00')
    expect(onSelection).toHaveBeenLastCalledWith([])

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all remaining employees' }))
    expect(selectionSummary('5 of 5 selected')).toHaveTextContent('RM 15,001.50')
    expect(onSelection).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('button', { name: 'Whole department (5)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('excludes existing vouchers and zero-net rows while retaining readable payment status', () => {
    const people = [...unpaid(), person('Fran', 6000, voucher('paid')), person('Grace', 7000, voucher('pending_approval')), person('Zero', 0)]
    setup({ group: groupDepartments(people)[0] })

    expect(screen.getByRole('button', { name: 'All remaining (5)' })).toHaveAttribute('aria-pressed', 'true')
    expect(selectionSummary('5 of 5 selected')).toHaveTextContent('RM 15,001.50 · 1 PV')
    for (const name of ['Fran', 'Grace', 'Zero']) {
      const checkbox = screen.getByRole('checkbox', { name: `Select ${name}` })
      expect(checkbox).toBeDisabled()
      expect(checkbox).not.toBeChecked()
    }
    const paidRow = screen.getByRole('row', { name: /Fran/ })
    expect(within(paidRow).getByText('paid · 5 Sep')).toBeVisible()
    expect(within(screen.getByRole('row', { name: /Grace/ })).getByText('awaiting Principal')).toBeVisible()
  })

  it('confirms only the chosen names, exact amount, pay date and grouped voucher before invoking generation', () => {
    const { onAskGenerate, onConfirmGenerate, onCancel } = setup()
    selectThree()
    fireEvent.click(screen.getByRole('button', { name: 'Generate 1 PV · 3 people' }))

    expect(onAskGenerate).toHaveBeenCalledTimes(1)
    expect(onConfirmGenerate).not.toHaveBeenCalled()
    const yes = screen.getByRole('button', { name: 'Yes, generate' })
    const confirmation = yes.parentElement!
    expect(confirmation).toHaveTextContent('Generate 1 PV · Finance · 3 staff · RM 9,000.90')
    expect(confirmation).toHaveTextContent('from Alliance Bank ···3210 on 15 Sep')
    expect(within(confirmation).getByText('Amy · Cara · Ezra')).toBeVisible()
    expect(confirmation).not.toHaveTextContent('Ben')
    expect(confirmation).not.toHaveTextContent('Devi')
    expect(screen.getByRole('checkbox', { name: 'Select Amy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'One PV per employee' })).toBeDisabled()

    fireEvent.click(yes)
    expect(onConfirmGenerate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Yes, generate' })).not.toBeInTheDocument()
    expect(selectionSummary('3 of 5 selected')).toHaveTextContent('RM 9,000.90 · 1 PV')
  })
})
