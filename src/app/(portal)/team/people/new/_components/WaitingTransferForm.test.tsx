import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WaitingTransferFacts } from '@/lib/commission/waiting-transfer'

// Transfer from the waiting list (2026-10-10, the HR revamp): the applicant's
// name and phone carried over, the joining title and direct manager picked,
// NRIC and the bank account required — Add to company files them.

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))
const transferFromWaitingList = vi.hoisted(() => vi.fn())
vi.mock('../../waiting-transfer-actions', () => ({ transferFromWaitingList }))

import WaitingTransferForm from './WaitingTransferForm'

const FACTS: WaitingTransferFacts = {
  requestId: '33333333-3333-4333-8333-333333333333', requestNo: 'RQ-2610-001', status: 'waiting', newPerson: 'Amelia Tan',
  contact: '012-345 6789', start: '2026-10-20', subDepartmentId: 'fair', subDepartment: 'Fair', departmentId: 'rev',
  submittedById: 'chea', submittedBy: 'CHEA HUAN', capacity: 30, occupied: 28, held: 0, seatFree: true,
}
const TITLES = [{ id: 'rs', name: 'Revenue Specialist' }, { id: 'srs', name: 'Senior Revenue Specialist' }, { id: 'tl', name: 'Team Leader' }]
const MANAGERS = [{ id: 'anthony', name: 'ANTHONY', submittedIt: false }, { id: 'chea', name: 'CHEA HUAN', submittedIt: true }]

function show(blocked: string | null = null) {
  return render(<WaitingTransferForm facts={FACTS} subSlug="fair" titles={TITLES} managers={MANAGERS} today="2026-10-10" blocked={blocked} />)
}
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement

beforeEach(() => {
  push.mockReset()
  flash.mockReset()
  transferFromWaitingList.mockReset()
})
afterEach(cleanup)

describe('WaitingTransferForm', () => {
  it('starts from the applicant: the banner, their name and phone, the lowest title, the member who sent it', () => {
    show()
    expect(screen.getByText('Transfer from waiting list · RQ-2610-001 · submitted by CHEA HUAN · joins Revenue · Fair only')).toBeInTheDocument()
    expect(screen.getByText('Revenue · Fair')).toBeInTheDocument()
    expect(field(/^Full name/).value).toBe('Amelia Tan')
    expect(field(/^Phone/).value).toBe('012-345 6789')
    expect(screen.getAllByText('from the waiting list')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Revenue Specialist' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'CHEA HUAN · submitted it' })).toHaveAttribute('aria-pressed', 'true')
    expect(field(/^Hire date/).value).toBe('2026-10-20')
    expect(screen.getByRole('link', { name: 'Back to waiting list' })).toHaveAttribute('href', '/revenue/fair/hierarchy?tab=waiting')
  })

  it('asks for NRIC and the bank account before anything is sent', async () => {
    show()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to company' }))
    })
    expect(transferFromWaitingList).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Fill in NRIC and the bank account to add Amelia Tan.')
    expect(screen.getAllByText('Required')).toHaveLength(3)
    expect(field(/^NRIC/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('files them, then says so on People', async () => {
    transferFromWaitingList.mockResolvedValue({ ok: true, staffId: 'new', code: 'HV070' })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Senior Revenue Specialist' }))
    fireEvent.click(screen.getByRole('button', { name: 'ANTHONY' }))
    // Probation, Permanent or Part time (2026-10-23) — a probation with its period, its end shown.
    expect(screen.queryByRole('group', { name: 'Probation period' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Probation' }))
    expect(within(screen.getByRole('group', { name: 'Probation period' })).getByRole('button', { name: '3 months' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '6 months' }))
    expect(screen.getByText('ends 19 Apr 2027')).toBeInTheDocument()
    fireEvent.change(field(/^NRIC/), { target: { value: '900101-14-5678' } })
    fireEvent.change(field(/^Account 1 bank/), { target: { value: 'Maybank' } })
    fireEvent.change(field(/^Account 1 number/), { target: { value: '1234567890' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to company' }))
    })
    expect(transferFromWaitingList).toHaveBeenCalledWith(expect.objectContaining({
      requestId: FACTS.requestId, name: 'Amelia Tan', titleId: 'srs', reportsTo: 'anthony', hireDate: '2026-10-20',
      employmentStatus: 'probation', probationMonths: 6,
      nric: '900101-14-5678', bankName: 'Maybank', bankAccountNo: '1234567890', contact: '012-345 6789',
    }))
    expect(flash).toHaveBeenCalledWith('Amelia Tan is now an employee in Fair · HV070')
    expect(push).toHaveBeenCalledWith('/team/people')
  })

  it('shows the database’s refusal and stays', async () => {
    transferFromWaitingList.mockResolvedValue({ ok: false, reason: 'Fair is full — 28 of 28 places are taken. Raise the limit on Rules › Capacity first.' })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Permanent' }))
    fireEvent.change(field(/^NRIC/), { target: { value: '900101145678' } })
    fireEvent.change(field(/^Account 1 bank/), { target: { value: 'Maybank' } })
    fireEvent.change(field(/^Account 1 number/), { target: { value: '1234567890' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to company' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Fair is full')
    expect(push).not.toHaveBeenCalled()
  })

  it('asks the employment status before anything is sent', async () => {
    show()
    fireEvent.change(field(/^NRIC/), { target: { value: '900101145678' } })
    fireEvent.change(field(/^Account 1 bank/), { target: { value: 'Maybank' } })
    fireEvent.change(field(/^Account 1 number/), { target: { value: '1234567890' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to company' }))
    })
    expect(transferFromWaitingList).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Pick the employment status — Probation, Permanent or Part time.')
  })

  it('cannot be sent at all while it is blocked', () => {
    show('Fair is full — 28 of 28 places are taken. Raise the limit on Rules › Capacity first.')
    expect(screen.getByRole('button', { name: 'Add to company' })).toBeDisabled()
    expect(within(document.body).getByRole('alert')).toHaveTextContent('Fair is full')
  })
})
