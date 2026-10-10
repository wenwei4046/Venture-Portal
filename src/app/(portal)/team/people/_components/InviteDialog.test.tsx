import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// Invite user, as the handoff draws it (2026-10-10): the email, a password set
// or generated, the role their title's template gives — and, opened from the
// head, who.

const mocks = vi.hoisted(() => ({ inviteUser: vi.fn() }))
vi.mock('../invite-actions', () => ({ inviteUser: mocks.inviteUser }))

import InviteDialog, { type InviteCandidate } from './InviteDialog'

const ONG = '5f0c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'
const candidates: InviteCandidate[] = [
  { staffId: ONG, name: 'ONG SIEW LAN', code: 'HV011', department: 'Finance', title: 'SENIOR ACCOUNT EXECUTIVE', levelRank: 4, templateId: 'maker', reportsTo: null },
  { staffId: 'x-1', name: 'NO TEMPLATE', code: 'HV069', department: 'Finance', title: 'ACCOUNTS EXECUTIVE', levelRank: 3, templateId: null, reportsTo: null },
]
const templates = [{
  id: 'maker', key: 'fin_maker', name: 'Finance · Maker', description: null, baseRole: 'finance', version: 1, sensitive: [],
  grants: {}, tabs: null,
}]

const open = (initialStaffId: string | null) => {
  const handlers = { onClose: vi.fn(), onCreated: vi.fn() }
  render(<InviteDialog candidates={candidates} templates={templates} initialStaffId={initialStaffId} {...handlers} />)
  return handlers
}
const dialog = () => screen.getByRole('dialog')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inviteUser.mockResolvedValue({ ok: true, name: 'ONG SIEW LAN', email: 'siew@houzs.com' })
})
afterEach(cleanup)

describe('Invite user', () => {
  it('opened from a person: theirs, with a password already made and their title’s template as the role', () => {
    open(ONG)
    expect(screen.getByRole('heading', { name: 'Invite ONG SIEW LAN' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Person')).toBeNull()
    expect(dialog()).toHaveTextContent('Finance · Maker')
    const password = screen.getByLabelText(/Password · set it, or generate one/) as HTMLInputElement
    expect(password.value).toMatch(/^Hv-[A-Za-z0-9]{7}$/)
    const before = password.value
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(password.value).not.toBe(before)
  })

  it('says what is wrong only once Send invite is pressed', async () => {
    open(ONG)
    expect(dialog()).not.toHaveTextContent('Enter a valid email')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invite' })))
    expect(dialog()).toHaveTextContent('Enter a valid email')
    expect(mocks.inviteUser).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'siew@houzs.com' } })
    fireEvent.change(screen.getByLabelText(/Password · set it, or generate one/), { target: { value: 'abc' } })
    expect(dialog()).toHaveTextContent('Password needs 6+ characters')
  })

  it('sends the login with no cells of its own, and hands back the password to pass on', async () => {
    const { onCreated } = open(ONG)
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'siew@houzs.com' } })
    fireEvent.change(screen.getByLabelText(/Password · set it, or generate one/), { target: { value: 'Hv-abcdefg' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invite' })))
    expect(mocks.inviteUser).toHaveBeenCalledWith({ staffId: ONG, email: 'siew@houzs.com', password: 'Hv-abcdefg', cells: [] })
    expect(onCreated).toHaveBeenCalledWith('Invite sent to siew@houzs.com — ONG SIEW LAN signs in with the temporary password Hv-abcdefg, then sets their own.')
  })

  it('shows the server’s refusal and stays open', async () => {
    mocks.inviteUser.mockResolvedValue({ ok: false, reason: 'That email already has an account.' })
    const { onCreated } = open(ONG)
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'siew@houzs.com' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invite' })))
    expect(screen.getByRole('alert')).toHaveTextContent('That email already has an account.')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('opened from the head: asks who first, by department', async () => {
    open(null)
    expect(screen.getByRole('heading', { name: 'Invite user' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'x@houzs.com' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invite' })))
    expect(dialog()).toHaveTextContent('Pick somebody from the roster')
    expect(mocks.inviteUser).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'x-1' } })
    expect(screen.getByRole('heading', { name: 'Invite NO TEMPLATE' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('No template on their title yet')
  })

  it('Cancel and Escape close it', () => {
    const { onClose } = open(ONG)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
