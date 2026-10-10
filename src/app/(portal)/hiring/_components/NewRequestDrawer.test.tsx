import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const { submitHiringRequest, flash } = vi.hoisted(() => ({ submitHiringRequest: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => ({ submitHiringRequest }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import NewRequestDrawer from './NewRequestDrawer'

beforeEach(() => {
  submitHiringRequest.mockReset().mockResolvedValue({ ok: true, id: 'HR-206' })
  flash.mockReset()
})
afterEach(cleanup)

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement

// "+ New request" (the handoff's 640px drawer): Requested by, then Form
// settings' fields in order; Submit to HR names what is still blank.
describe('Hiring › New hiring request', () => {
  it('asks Form settings’ questions in order, the required ones starred', () => {
    render(<NewRequestDrawer board={HIRING_BOARD} open onClose={() => {}} onSubmitted={() => {}} />)
    expect(screen.getByText('New hiring request')).toBeInTheDocument()
    const labels = [...document.querySelectorAll('label')].map(l => l.querySelector('span')?.textContent)
    expect(labels).toEqual([
      'Requested by', 'Position *', 'Department *', 'Headcount *', 'Budget (RM / month) *', 'Expected start *', 'Employment type', 'Reason',
      'Age requirement', 'Gender', 'Race', 'Job description *', 'Special notes',
    ])
    const by = screen.getByText('Requested by').closest('label')!.querySelector('select')!
    expect(by.value).toBe('grace')
    expect(by.options[by.selectedIndex].text).toBe('Grace Lim · HR')
  })

  it('names every blank required answer', () => {
    render(<NewRequestDrawer board={HIRING_BOARD} open onClose={() => {}} onSubmitted={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit to HR' }))
    expect(screen.getByText('Fill in Position, Department, Headcount, Budget (RM / month), Expected start, Job description.')).toBeInTheDocument()
    expect(submitHiringRequest).not.toHaveBeenCalled()
  })

  it('files it as Pending, the range as From–To', async () => {
    const onSubmitted = vi.fn()
    render(<NewRequestDrawer board={HIRING_BOARD} open onClose={() => {}} onSubmitted={onSubmitted} />)
    fireEvent.change(field('Position'), { target: { value: 'Driver' } })
    fireEvent.change(field('Department'), { target: { value: 'HR' } })
    fireEvent.change(field('Headcount'), { target: { value: '2' } })
    fireEvent.change(field('Budget (RM / month) from'), { target: { value: '2000' } })
    fireEvent.change(field('Budget (RM / month) to'), { target: { value: '2400' } })
    fireEvent.change(field('Expected start'), { target: { value: 'Immediately' } })
    fireEvent.change(field('Job description'), { target: { value: 'Deliveries in the Klang Valley.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit to HR' }))
    await waitFor(() =>
      expect(submitHiringRequest).toHaveBeenCalledWith({
        requestedBy: 'grace',
        answers: { position: 'Driver', dept: 'HR', headcount: '2', budget: '2000–2400', start: 'Immediately', jd: 'Deliveries in the Klang Valley.' },
      }),
    )
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('HR-206'))
    expect(flash).toHaveBeenCalledWith('HR-206 submitted to HR')
  })
})
