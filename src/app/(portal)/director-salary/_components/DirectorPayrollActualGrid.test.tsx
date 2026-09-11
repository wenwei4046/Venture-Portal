import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import DirectorPayrollActualGrid, { type DirectorPayrollRowData } from './DirectorPayrollActualGrid'

/**
 * Same navigation as CTCInputGrid: ?period= changes keep this grid mounted,
 * so a selection made in one month used to survive into the next (the
 * delete action is period-scoped, but "Delete 3" over another month's ids is
 * still wrong on screen). The grid remounts per period.
 */
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('../payroll-actions', () => ({
  updateDirectorPayrollRow: vi.fn().mockResolvedValue(undefined),
  deleteDirectorPayrollRows: vi.fn().mockResolvedValue(undefined),
}))

function row(id: string, employee_name: string): DirectorPayrollRowData {
  return {
    id,
    director_id: null,
    director_code: 'D1',
    employee_code: id,
    employee_name,
    dept_name: 'Director',
    basic_salary: 14400,
    statutory_allowance: 0,
    non_statutory_allowance: 0,
    ot_amount: 0,
    commission_amount: 0,
    no_pay_amount: 0,
    deduction_amount: 0,
    skbbk_amount: 0,
    epf_er: 0,
    epf_ee: 0,
    socso_er: 0,
    socso_ee: 0,
    eis_er: 0,
    eis_ee: 0,
    pcb: 0,
    gross: 14400,
    net: 14400,
    source: 'infotech',
  }
}

beforeEach(() => vi.clearAllMocks())

describe('DirectorPayrollActualGrid across periods', () => {
  it('drops the selection when the period changes', () => {
    const { rerender } = render(
      <DirectorPayrollActualGrid
        rows={[row('sep-1', 'Alice'), row('sep-2', 'Bob')]}
        period="2026-09-01"
      />,
    )
    fireEvent.click(screen.getByLabelText('Select Alice'))
    expect(screen.getByText('1 selected')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete 1' })).toBeVisible()

    rerender(
      <DirectorPayrollActualGrid
        rows={[row('aug-1', 'Alice'), row('aug-2', 'Bob')]}
        period="2026-08-01"
      />,
    )
    expect(screen.queryByText('1 selected')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    expect(screen.getByLabelText('Select Alice')).not.toBeChecked()
  })
})
