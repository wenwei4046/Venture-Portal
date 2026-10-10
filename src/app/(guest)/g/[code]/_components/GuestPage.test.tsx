import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuestData, GuestTaken } from '@/lib/guest/model'

const { guestDay, guestBook, guestCancel } = vi.hoisted(() => ({ guestDay: vi.fn(), guestBook: vi.fn(), guestCancel: vi.fn() }))
vi.mock('@/lib/guest/actions', () => ({ guestDay, guestBook, guestCancel }))

import GuestPage from './GuestPage'

// The guest link's page (2026-10-11): HQ's meetings are never a guest's to
// change (the user: "can set hq de 不给 guest edit 就好"); a meeting booked
// through the link is any guest's, who gives a name for the trail.

const data: GuestData = {
  on: true,
  booking: true,
  hiring: false,
  days: 14,
  today: '2026-10-10',
  rooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8, location: 'Level 3', facilities: '' }],
  allRooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8, location: 'Level 3', facilities: '' }],
  subs: [{ id: '11111111-1111-4111-8111-111111111111', code: 'HIN', name: 'HOUZS Interior', departments: ['Project'] }],
}
const taken: GuestTaken[] = [
  { id: 'hq1', ref: null, room: 'r1', day: '2026-10-10', from: 540, to: 600, title: 'Fair weekly sync', guest: false, code: '', company: null, subsidiary: null,
    department: 'Revenue Department', subDepartment: null, by: 'Chea Huan', pax: 6 },
  { id: '22222222-2222-4222-8222-222222222222', ref: 'BK-G302', room: 'r1', day: '2026-10-10', from: 1020, to: 1080, title: 'Showroom kickoff', guest: true,
    code: 'HIN', company: 'HOUZS Interior', subsidiary: '11111111-1111-4111-8111-111111111111', department: 'Project', subDepartment: null, by: 'Wong Mei Yee', pax: 5 },
]

beforeEach(() => {
  guestDay.mockReset().mockResolvedValue({ ok: true, taken })
  guestBook.mockReset()
  guestCancel.mockReset().mockResolvedValue({ ok: true, title: 'Showroom kickoff' })
})
afterEach(cleanup)

describe('the guest page', () => {
  it('reads closed for a link that is off, and offers nothing', () => {
    render(<GuestPage code="hv-ABCDEFGH" initial={{ on: false }} initialTaken={[]} />)
    expect(screen.getByText('This link is closed')).toBeTruthy()
    expect(screen.queryByText('Book a meeting room')).toBeNull()
  })

  it('shows an HQ meeting without Cancel or Edit', async () => {
    render(<GuestPage code="hv-ABCDEFGH" initial={data} initialTaken={taken} />)
    fireEvent.click(screen.getByText('Meeting room schedule'))
    fireEvent.click(await screen.findByText('Fair weekly sync'))
    const win = within(screen.getByRole('dialog'))
    expect(win.getByText('HOUZS Venture')).toBeTruthy()
    expect(win.getByText('RV · Revenue')).toBeTruthy()
    expect(screen.queryByText('Cancel meeting')).toBeNull()
    expect(screen.queryByText('Edit')).toBeNull()
  })

  it('lets a guest cancel a guest-link meeting, asking their name first', async () => {
    render(<GuestPage code="hv-ABCDEFGH" initial={data} initialTaken={taken} />)
    fireEvent.click(screen.getByText('Meeting room schedule'))
    fireEvent.click(await screen.findByText('Showroom kickoff'))
    fireEvent.click(screen.getByText('Cancel meeting'))
    expect(screen.getByText('Cancel “Showroom kickoff”?')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Cancel meeting').at(-1)!)
    expect(screen.getByText('Type your name first.')).toBeTruthy()
    expect(guestCancel).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Siti' } })
    fireEvent.click(screen.getAllByText('Cancel meeting').at(-1)!)
    await waitFor(() => expect(guestCancel).toHaveBeenCalledWith('hv-ABCDEFGH', '22222222-2222-4222-8222-222222222222', 'Siti'))
  })

  it('says what is missing before it books, in the page’s words', async () => {
    render(<GuestPage code="hv-ABCDEFGH" initial={data} initialTaken={taken} />)
    fireEvent.click(screen.getByText('Book a meeting room'))
    fireEvent.click(await screen.findByText('Book room'))
    expect(screen.getByRole('alert').textContent).toBe('Add company, department, your name, a time slot, a meeting title.')
    expect(guestBook).not.toHaveBeenCalled()
  })
})
