import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AddStaffForm from './AddStaffForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ addStaff: vi.fn() }))

/**
 * The employee code (2026-09-12) is the database's to hand out — HV + the
 * largest number on the roster + 1, by trigger when the row is saved. The
 * form shows the number and never submits one: a disabled input with no
 * name is exactly that.
 */
describe('Add Staff — employee code', () => {
  it('shows the number the person will get, disabled and unnamed so nothing is submitted', () => {
    const { container } = render(<AddStaffForm subDepartments={[]} managers={[]} departments={[]} titles={[]} nextCode="HV062" />)

    const code = screen.getByLabelText(/Employee code/i) as HTMLInputElement
    expect(code.value).toBe('HV062')
    expect(code.disabled).toBe(true)
    expect(code.hasAttribute('name')).toBe(false)
    expect(container.querySelector('input[name="employee_code"]')).toBeNull()
    expect(screen.getByText('The next number after the highest on the roster.')).toBeInTheDocument()
  })

  it('still says how the code is made when the preview could not be read', () => {
    render(<AddStaffForm subDepartments={[]} managers={[]} departments={[]} titles={[]} nextCode={null} />)

    const code = screen.getByLabelText(/Employee code/i) as HTMLInputElement
    expect(code.value).toBe('HV…')
    expect(code.disabled).toBe(true)
    expect(screen.getByText('HV + the next number after the highest on the roster.')).toBeInTheDocument()
  })
})
