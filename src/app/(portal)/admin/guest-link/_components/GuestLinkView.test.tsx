import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuestLinkAdmin } from '@/lib/guest/read'

const actions = vi.hoisted(() => ({
  newGuestCode: vi.fn(), removeGuestSubsidiary: vi.fn(), renameGuestDepartment: vi.fn(), saveGuestSubsidiary: vi.fn(), setGuestLink: vi.fn(),
  setGuestRoom: vi.fn(),
}))
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/lib/guest/admin-actions', () => actions)
vi.mock('@/components/hrv/toast', () => ({ flash }))
vi.mock('../../rooms/_components/BookDrawer', () => ({ BookDrawer: () => null }))
vi.mock('../../rooms/_components/BookingDrawer', () => ({ BookingDrawer: () => null }))

import GuestLinkView from './GuestLinkView'

// Admin › Guest Link (2026-10-12, the user: "change name, and move together"): a department chip renames in place, and
// the Talent Bank's people in it go with the new name — taken off and added again, they would not.
const CAR = '11111111-1111-4111-8111-111111111111'
const LINK: GuestLinkAdmin = {
  on: true, code: 'hv-ABCDEFGH', booking: true, hiring: true, days: 14, today: '2026-10-12', canEdit: true, rooms: [],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres', departments: ['Marketing', 'Operation'] }], bookings: [], hires: 0,
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset()
  actions.renameGuestDepartment.mockResolvedValue({ ok: true, sub: { id: CAR, code: 'CAR', name: 'Carres', departments: ['Marketing', 'Operations'] } })
  flash.mockReset()
})
afterEach(cleanup)

describe('Admin › Guest Link › a department’s name', () => {
  it('renames in place: Enter keeps it, the chip shows the new name', async () => {
    render(<GuestLinkView initial={LINK} origin="https://erp.example" />)
    fireEvent.click(screen.getByRole('button', { name: 'Operation' }))
    const field = screen.getByLabelText('Rename Operation')
    expect(field).toHaveValue('Operation')
    fireEvent.change(field, { target: { value: 'Operations ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)
    await waitFor(() => expect(actions.renameGuestDepartment).toHaveBeenCalledWith(CAR, 'Operation', 'Operations'))
    expect(actions.renameGuestDepartment).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Operations' })).toBeInTheDocument()
    expect(flash).toHaveBeenCalledWith('Operation is now Operations — the Talent Bank’s people in it went with it')
    expect(actions.saveGuestSubsidiary).not.toHaveBeenCalled()
  })

  it('Esc, an unchanged name or a blank one keeps it as it was', () => {
    render(<GuestLinkView initial={LINK} origin="https://erp.example" />)
    fireEvent.click(screen.getByRole('button', { name: 'Marketing' }))
    fireEvent.change(screen.getByLabelText('Rename Marketing'), { target: { value: 'Brand' } })
    fireEvent.keyDown(screen.getByLabelText('Rename Marketing'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Marketing' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Marketing' }))
    fireEvent.blur(screen.getByLabelText('Rename Marketing'))
    fireEvent.click(screen.getByRole('button', { name: 'Marketing' }))
    fireEvent.change(screen.getByLabelText('Rename Marketing'), { target: { value: '  ' } })
    fireEvent.blur(screen.getByLabelText('Rename Marketing'))
    expect(actions.renameGuestDepartment).not.toHaveBeenCalled()
  })

  it('a refusal is said, and the name stays', async () => {
    actions.renameGuestDepartment.mockResolvedValue({ ok: false, reason: 'Marketing is on the list already.' })
    render(<GuestLinkView initial={LINK} origin="https://erp.example" />)
    fireEvent.click(screen.getByRole('button', { name: 'Operation' }))
    fireEvent.change(screen.getByLabelText('Rename Operation'), { target: { value: 'marketing' } })
    fireEvent.blur(screen.getByLabelText('Rename Operation'))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Marketing is on the list already.'))
    expect(screen.getByRole('button', { name: 'Operation' })).toBeInTheDocument()
  })

  it('without Guest link · Edit a name is only read', () => {
    render(<GuestLinkView initial={{ ...LINK, canEdit: false }} origin="https://erp.example" />)
    expect(screen.queryByRole('button', { name: 'Operation' })).toBeNull()
    expect(screen.getByText('Operation')).toBeInTheDocument()
  })
})
