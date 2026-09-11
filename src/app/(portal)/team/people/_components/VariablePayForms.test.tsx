import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AddStaffForm, { type AddStaffDepartment } from './AddStaffForm'
import EditStaffForm, { type StaffRow } from './EditStaffForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ addStaff: vi.fn(), updateStaff: vi.fn() }))

const departments: AddStaffDepartment[] = [
  { id: 'd-director', name: 'Director', payroll_source: 'imported', segment_key: 'director' },
  { id: 'd-marketing', name: 'Marketing', payroll_source: 'imported', segment_key: 'marketing' },
  { id: 'd-revenue', name: 'Revenue Department', payroll_source: 'commission', segment_key: 'revenue_department' },
]

const director: StaffRow = {
  id: 'staff', employee_name: 'Loo Wen Wei', designation: 'CHIEF EXECUTIVE OFFICER', department_id: 'd-director',
  department_name: 'Director', commission_dept: false, director_dept: true, title_id: null,
  basic_salary: 0, allowances: 0, non_statutory_allowance: 0, employee_code: 'WW',
  hire_date: null, resignation_date: null, epf_category: 'A', socso_category: 'first',
  is_epf_exempt: false, pcb_category: 'KA1', children_count: 0, employment_type: 'variable',
  bank_name: null, bank_account_no: null, bank_name_2: null, bank_account_no_2: null,
  nric: null, contact_number: null, email: null, address: null,
  emergency_contact_name: null, emergency_contact_phone: null, emergency_contact_relationship: null,
}

/**
 * The "Variable pay" tick (2026-09-11): offered in the Director department
 * only, on by default, and while it is on the three pay fields are locked at
 * 0.00 — a director's figure is keyed each month, not filed here.
 */
describe('Add Staff — Variable pay', () => {
  it('offers the tick for the Director department only, on by default, locking the pay fields', () => {
    const { container } = render(<AddStaffForm departments={departments} titles={[]} nextCode={null} />)
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
    render(<AddStaffForm departments={departments} titles={[]} nextCode={null} />)
    const dept = screen.getByLabelText('Department')
    fireEvent.change(dept, { target: { value: 'd-director' } })
    fireEvent.change(dept, { target: { value: 'd-revenue' } })
    expect(screen.queryByRole('checkbox', { name: /Variable pay/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Fully commission based/ })).toBeChecked()
    expect(screen.getByLabelText(/Basic Salary/)).toBeDisabled()
  })
})

describe('Edit Staff — Variable pay', () => {
  it('shows the tick on for a variable-pay director, hides the pay fields and keeps the statutory categories', () => {
    const { container } = render(<EditStaffForm staff={director} titles={[]} />)
    const tick = screen.getByRole('checkbox', { name: /Variable pay/ })
    expect(tick).toBeChecked()
    // The tick stands in for the Employment Type select.
    expect(container.querySelector('select[name="employment_type"]')).toBeNull()
    expect(container.querySelector('input[name="basic_salary"]')).toBeNull()
    expect(container.querySelector('input[name="allowances"]')).toBeNull()
    // Unlike fully commission based, statutory still applies to what is keyed.
    expect(container.querySelector('select[name="epf_category"]')).not.toBeNull()
    expect(container.querySelector('select[name="pcb_category"]')).not.toBeNull()
    expect(new FormData(container.querySelector('form')!).get('variable_pay')).toBe('on')

    // Untick: the pay fields come back, basic required.
    fireEvent.click(tick)
    const basic = container.querySelector<HTMLInputElement>('input[name="basic_salary"]')
    expect(basic).not.toBeNull()
    expect(basic).toBeRequired()
    expect(new FormData(container.querySelector('form')!).get('variable_pay')).toBeNull()
  })

  it('offers no tick outside the Director department', () => {
    const { container } = render(
      <EditStaffForm staff={{ ...director, director_dept: false, employment_type: 'salaried' }} titles={[]} />,
    )
    expect(screen.queryByRole('checkbox', { name: /Variable pay/ })).toBeNull()
    expect(container.querySelector('select[name="employment_type"]')).not.toBeNull()
    expect(container.querySelector('input[name="basic_salary"]')).not.toBeNull()
  })
})
