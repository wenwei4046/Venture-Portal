import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AddStaffForm from './AddStaffForm'
import type { WaitingApplicant } from '@/lib/people/waiting-match'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ addStaff: vi.fn() }))
vi.mock('@/lib/documentation/file-letters', () => ({ fileLetters: vi.fn() }))

/**
 * Add Staff remembers the waiting list (2026-11-20): CHEAH SHU HUI was filed
 * here on 9 Nov while still on Fair's waiting list, and only Transfer closes
 * the request — so filing somebody still waiting says to Transfer them.
 */
const shuHui: WaitingApplicant = {
  id: 'rq-4', requestNo: 'RQ-2610-004', name: 'CHEAH SHU HUI', contact: '018-460-2375', subName: 'Fair', position: 1,
}

const nameBox = () => document.getElementById('staff-name')!

function form() {
  return render(
    <AddStaffForm subDepartments={[]} managers={[]} departments={[]} titles={[]} nextCode="HV076" waitingApplicants={[shuHui]} />,
  )
}

describe('Add Staff — somebody still on the waiting list', () => {
  it('says nothing until the name or phone points at an applicant', () => {
    form()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.change(nameBox(), { target: { value: 'LOO WEN WEI' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('names their place on the list and links to Transfer, found by name', () => {
    form()
    fireEvent.change(nameBox(), { target: { value: 'Cheah Shu Hui' } })
    const notices = screen.getAllByRole('alert')
    expect(notices).toHaveLength(2) // above the form and by the button
    expect(notices[0]).toHaveTextContent('CHEAH SHU HUI is #1 on Fair’s waiting list (RQ-2610-004)')
    const links = screen.getAllByRole('link', { name: 'Transfer from waiting list' })
    expect(links[0]).toHaveAttribute('href', '/team/people/new?waiting=rq-4')
  })

  it('finds them by phone too', () => {
    form()
    fireEvent.change(document.getElementById('staff-phone')!, { target: { value: '0184602375' } })
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('RQ-2610-004')
  })
})
