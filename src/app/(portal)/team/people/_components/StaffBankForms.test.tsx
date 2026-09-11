import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AddStaffForm from './AddStaffForm'
import EditStaffForm, { type StaffRow } from './EditStaffForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ addStaff: vi.fn(), updateStaff: vi.fn() }))

const staff: StaffRow = {
  id: 'staff', employee_name: 'Test Staff', designation: null, department_id: 'revenue',
  department_name: 'Revenue', commission_dept: true, director_dept: false, title_id: null,
  basic_salary: 0, allowances: 0, non_statutory_allowance: 0, employee_code: 'TEST',
  hire_date: null, resignation_date: null, epf_category: 'A', socso_category: 'first',
  is_epf_exempt: false, pcb_category: 'KA1', children_count: 0, employment_type: 'commission_eligible',
  bank_name: 'Maybank', bank_account_no: '0012345678', bank_name_2: 'CIMB', bank_account_no_2: '0098765432',
  nric: null, contact_number: null, email: null, address: null,
  emergency_contact_name: null, emergency_contact_phone: null, emergency_contact_relationship: null,
}

describe('staff bank account forms', () => {
  it('keeps the optional second pair separate from Account 1 on add', () => {
    const { container } = render(<AddStaffForm departments={[]} titles={[]} nextCode={null} />)
    fireEvent.change(screen.getByLabelText('Account 1 bank'), { target: { value: 'Maybank' } })
    fireEvent.change(screen.getByLabelText(/Account 1 number/), { target: { value: '0012345678' } })
    const form = container.querySelector('form')!
    expect(new FormData(form).get('bank_name_2')).toBe('')
    expect(new FormData(form).get('bank_account_no_2')).toBe('')
    fireEvent.change(screen.getByLabelText('Account 2 bank'), { target: { value: 'CIMB' } })
    fireEvent.change(screen.getByLabelText(/Account 2 number/), { target: { value: '0098765432' } })
    const data = new FormData(form)
    expect(data.get('bank_name')).toBe('Maybank')
    expect(data.get('bank_account_no')).toBe('0012345678')
    expect(data.get('bank_name_2')).toBe('CIMB')
    expect(data.get('bank_account_no_2')).toBe('0098765432')
  })

  it('loads both accounts and explicitly submits an Account 2 removal without changing Account 1', () => {
    const { container } = render(<EditStaffForm staff={staff} titles={[]} />)
    expect(screen.getByLabelText(/Account 1 bank/)).toHaveValue('Maybank')
    expect(screen.getByLabelText('Account 2 bank')).toHaveValue('CIMB')
    expect(screen.getByLabelText(/Account 2 number/)).toHaveValue('0098765432')
    fireEvent.change(screen.getByLabelText('Account 2 bank'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Account 2 number/), { target: { value: '' } })
    const data = new FormData(container.querySelector('form')!)
    expect(data.get('bank_name')).toBe('Maybank')
    expect(data.get('bank_account_no')).toBe('0012345678')
    expect(data.get('bank_name_2')).toBe('')
    expect(data.get('bank_account_no_2')).toBe('')
  })
})
