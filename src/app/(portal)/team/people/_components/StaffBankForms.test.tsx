import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AddStaffForm from './AddStaffForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ addStaff: vi.fn() }))

describe('staff bank account forms', () => {
  it('keeps the optional second pair separate from Account 1 on add', () => {
    const { container } = render(<AddStaffForm subDepartments={[]} managers={[]} departments={[]} titles={[]} nextCode={null} />)
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
})
