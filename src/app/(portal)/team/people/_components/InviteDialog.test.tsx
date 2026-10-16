import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// Invite user, as the handoff draws it (2026-10-10): the email, the role their
// title's template gives — and, opened from the head, who. Since 2026-10-16 two
// ways in (the user): Send invite link, or Set password, hidden behind an eye.

const mocks = vi.hoisted(() => ({ inviteUser: vi.fn(), reinviteUser: vi.fn() }))
vi.mock('../invite-actions', () => ({ inviteUser: mocks.inviteUser, reinviteUser: mocks.reinviteUser }))

import InviteDialog, { type InviteCandidate, type PendingInvite } from './InviteDialog'

const ONG = '5f0c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'
const KAI = '7a1c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'
const candidates: InviteCandidate[] = [
  { staffId: ONG, name: 'ONG SIEW LAN', code: 'HV011', department: 'Finance', title: 'SENIOR ACCOUNT EXECUTIVE', levelRank: 4, templateId: 'maker', reportsTo: null },
  { staffId: 'x-1', name: 'NO TEMPLATE', code: 'HV069', department: 'Finance', title: 'ACCOUNTS EXECUTIVE', levelRank: 3, templateId: null, reportsTo: null },
]
const pending: PendingInvite[] = [{ staffId: KAI, name: 'LOKE KAI YEE', email: 'kaiyee@houzs.my', templateId: 'maker' }]
const templates = [{
  id: 'maker', key: 'fin_maker', name: 'Finance · Maker', description: null, baseRole: 'finance', version: 1, sensitive: [],
  grants: {}, tabs: null,
}]
const LINK = 'https://venture-portal-chi.vercel.app/welcome?token_hash=abc123abc123abc123&type=invite'

const open = (initialStaffId: string | null) => {
  const handlers = { onClose: vi.fn(), onCreated: vi.fn() }
  render(<InviteDialog candidates={candidates} pending={pending} templates={templates} initialStaffId={initialStaffId} {...handlers} />)
  return handlers
}
const dialog = () => screen.getByRole('dialog')
const choose = (label: 'Send invite link' | 'Set password') => fireEvent.click(screen.getByRole('tab', { name: label }))
const typeEmail = (value: string) => fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value } })
const press = async (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })))
const passwordBox = () => screen.getByLabelText(/Password · set it, or generate one/) as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inviteUser.mockResolvedValue({ ok: true, mode: 'link', name: 'ONG SIEW LAN', email: 'siew@houzs.com', emailed: true })
})
afterEach(cleanup)

describe('Invite user', () => {
  it('opened from a person: theirs, their title’s template as the role, and the two ways in — the link first', () => {
    open(ONG)
    expect(screen.getByRole('heading', { name: 'Invite ONG SIEW LAN' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Person')).toBeNull()
    expect(dialog()).toHaveTextContent('Finance · Maker')
    expect(screen.getByRole('tab', { name: 'Send invite link' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByLabelText(/Password · set it/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send invite link' })).toBeInTheDocument()
  })

  it('Set password: one is made for them, hidden until the eye is pressed, and Regenerate makes another', () => {
    open(ONG)
    choose('Set password')
    const password = passwordBox()
    expect(password.type).toBe('password')
    expect(password.value).toMatch(/^Hv-[A-Za-z0-9]{7}$/)
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password.type).toBe('password')
    const before = password.value
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(password.value).not.toBe(before)
  })

  it('says what is wrong only once the button is pressed', async () => {
    open(ONG)
    choose('Set password')
    expect(dialog()).not.toHaveTextContent('Enter a valid email')
    await press('Create login')
    expect(dialog()).toHaveTextContent('Enter a valid email')
    expect(mocks.inviteUser).not.toHaveBeenCalled()
    typeEmail('siew@houzs.com')
    fireEvent.change(passwordBox(), { target: { value: 'abc' } })
    expect(dialog()).toHaveTextContent('Password needs 6+ characters')
  })

  it('Set password creates the login with no cells of its own, and hands back the password as a secret to pass on', async () => {
    mocks.inviteUser.mockResolvedValue({ ok: true, mode: 'password', name: 'ONG SIEW LAN', email: 'siew@houzs.com' })
    const { onCreated } = open(ONG)
    choose('Set password')
    typeEmail('siew@houzs.com')
    fireEvent.change(passwordBox(), { target: { value: 'Hv-abcdefg' } })
    await press('Create login')
    expect(mocks.inviteUser).toHaveBeenCalledWith({ staffId: ONG, email: 'siew@houzs.com', mode: 'password', password: 'Hv-abcdefg', cells: [] })
    expect(onCreated).toHaveBeenCalledWith({ text: 'ONG SIEW LAN can sign in with siew@houzs.com and the password', secret: 'Hv-abcdefg' })
  })

  it('Send invite link sends no password, and says where the link went', async () => {
    const { onCreated } = open(ONG)
    typeEmail('siew@houzs.com')
    await press('Send invite link')
    expect(mocks.inviteUser).toHaveBeenCalledWith({ staffId: ONG, email: 'siew@houzs.com', mode: 'link', password: undefined, cells: [] })
    expect(onCreated).toHaveBeenCalledWith({ text: 'Invite link sent to siew@houzs.com' })
  })

  it('when Supabase would not email it, keeps the link on screen with why, to copy; Done closes', async () => {
    mocks.inviteUser.mockResolvedValue({
      ok: true, mode: 'link', name: 'ONG SIEW LAN', email: 'siew@houzs.com', emailed: false, link: LINK,
      why: 'Supabase can only email the team’s own addresses until an email service is connected.',
    })
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { onCreated } = open(ONG)
    typeEmail('siew@houzs.com')
    await press('Send invite link')
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('until an email service is connected')
    expect(screen.getByDisplayValue(LINK)).toHaveAttribute('readonly')
    await press('Copy link')
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onCreated).toHaveBeenCalledWith({ text: 'Invite link made for ONG SIEW LAN (siew@houzs.com)' })
  })

  it('shows the server’s refusal and stays open', async () => {
    mocks.inviteUser.mockResolvedValue({ ok: false, reason: 'That email already has an account.' })
    const { onCreated } = open(ONG)
    typeEmail('siew@houzs.com')
    await press('Send invite link')
    expect(screen.getByRole('alert')).toHaveTextContent('That email already has an account.')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('opened from the head: asks who first, by department', async () => {
    open(null)
    expect(screen.getByRole('heading', { name: 'Invite user' })).toBeInTheDocument()
    typeEmail('x@houzs.com')
    await press('Send invite link')
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

describe('Invite again — a link never used', () => {
  it('names them, shows the login’s email as it is, and sends a new link', async () => {
    mocks.reinviteUser.mockResolvedValue({ ok: true, mode: 'link', name: 'LOKE KAI YEE', email: 'kaiyee@houzs.my', emailed: true })
    const { onCreated } = open(KAI)
    expect(screen.getByRole('heading', { name: 'Invite LOKE KAI YEE again' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('name@example.com')).toBeNull()
    expect(dialog()).toHaveTextContent('kaiyee@houzs.my')
    await press('Send invite link')
    expect(mocks.reinviteUser).toHaveBeenCalledWith({ staffId: KAI, mode: 'link', password: undefined })
    expect(mocks.inviteUser).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith({ text: 'Invite link sent to kaiyee@houzs.my' })
  })

  it('or sets the password now', async () => {
    mocks.reinviteUser.mockResolvedValue({ ok: true, mode: 'password', name: 'LOKE KAI YEE', email: 'kaiyee@houzs.my' })
    const { onCreated } = open(KAI)
    choose('Set password')
    fireEvent.change(passwordBox(), { target: { value: 'Hv-zzzzzzz' } })
    await press('Set password')
    expect(mocks.reinviteUser).toHaveBeenCalledWith({ staffId: KAI, mode: 'password', password: 'Hv-zzzzzzz' })
    expect(onCreated).toHaveBeenCalledWith({ text: 'LOKE KAI YEE can sign in with kaiyee@houzs.my and the password', secret: 'Hv-zzzzzzz' })
  })
})
