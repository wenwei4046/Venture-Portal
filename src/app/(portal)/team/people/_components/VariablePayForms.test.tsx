import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AddStaffForm, { type AddStaffDepartment } from './AddStaffForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ addStaff: vi.fn() }))
// The letters filed with the status (2026-10-24) go to the Data center from the browser.
vi.mock('@/lib/documentation/file-letters', () => ({ fileLetters: vi.fn() }))

const departments: AddStaffDepartment[] = [
  { id: 'd-director', name: 'Director', payroll_source: 'imported', segment_key: 'director' },
  { id: 'd-marketing', name: 'Marketing', payroll_source: 'imported', segment_key: 'marketing' },
  { id: 'd-revenue', name: 'Revenue Department', payroll_source: 'commission', segment_key: 'revenue_department' },
]

/**
 * The "Variable pay" tick (2026-09-11): offered in the Director department
 * only, on by default, and while it is on the three pay fields are locked at
 * 0.00 — a director's figure is keyed each month, not filed here.
 */
describe('Add Staff — Variable pay', () => {
  it('offers the tick for the Director department only, on by default, locking the pay fields', () => {
    const { container } = render(<AddStaffForm subDepartments={[]} managers={[]} departments={departments} titles={[]} nextCode={null} />)
    const form = container.querySelector('form')!
    const dept = screen.getByLabelText('Department')

    // Nothing offered until a department is picked.
    expect(screen.queryByRole('checkbox', { name: /Variable pay/ })).toBeNull()

    fireEvent.change(dept, { target: { value: 'd-director' } })
    const tick = screen.getByRole('checkbox', { name: /Variable pay/ })
    expect(tick).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /Fully commission based/ })).toBeNull()
    const basic = screen.getByLabelText(/Basic Salary/)
    expect(basic).toBeDisabled()
    expect(basic).not.toBeRequired()
    expect(basic).toHaveValue(0)
    expect(screen.getByLabelText(/Statutory Allow\./)).toBeDisabled()
    expect(screen.getByLabelText(/Non-Stat\. Allow\./)).toBeDisabled()
    expect(new FormData(form).get('variable_pay')).toBe('on')

    // Unticked for the director who draws a fixed basic: the fields come back
    // and a real basic is asked for again.
    fireEvent.click(tick)
    expect(tick).not.toBeChecked()
    expect(basic).toBeEnabled()
    expect(basic).toBeRequired()
    expect(basic).toHaveValue(null)
    expect(new FormData(form).get('variable_pay')).toBeNull()

    // Another department: the tick goes, and nothing of it rides along.
    fireEvent.change(dept, { target: { value: 'd-marketing' } })
    expect(screen.queryByRole('checkbox', { name: /Variable pay/ })).toBeNull()
    expect(screen.getByLabelText(/Basic Salary/)).toBeEnabled()
    expect(new FormData(form).get('variable_pay')).toBeNull()
  })

  it('switching from the Director department to a commission one swaps the tick, not stacks it', () => {
    render(<AddStaffForm subDepartments={[]} managers={[]} departments={departments} titles={[]} nextCode={null} />)
    const dept = screen.getByLabelText('Department')
    fireEvent.change(dept, { target: { value: 'd-director' } })
    fireEvent.change(dept, { target: { value: 'd-revenue' } })
    expect(screen.queryByRole('checkbox', { name: /Variable pay/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Fully commission based/ })).toBeChecked()
    expect(screen.getByLabelText(/Basic Salary/)).toBeDisabled()
  })
})

