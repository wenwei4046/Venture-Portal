import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@/types'

// Finance's account menu (2026-10-14, the Finance revamp v2 — D13) and the
// windows it opens: Change password (the 2026-10-12 rules), closing with the
// design's toast; Sign out; Request to change email. No Edit profile
// (2026-10-17 — one's record changes through Me › Profile, which HR approves).

const actions = vi.hoisted(() => ({
  changeMyPassword: vi.fn(),
  loadMyEmailChange: vi.fn(),
  requestEmailChange: vi.fn(),
  withdrawEmailChange: vi.fn(),
}))
vi.mock('@/lib/account/actions', () => actions)
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn(async () => ({})) } }) }))
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
const toast = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/components/hrv/toast', () => toast)

import { AccountMenu, ChangePasswordDialog, RequestEmailDialog, SignOutDialog } from './AccountMenu'
import { finAccountMenu, visibleAccountMenu } from './fin-nav'
import type { NavViewer } from './nav-config'

const carrie = { id: 'c', name: 'Ong Mei Shuang', email: 'carrie@x', role: 'finance', permissions: ['treasury', 'meeting_rooms'], personalLogin: true } as unknown as User

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the account menu', () => {
  it('lists Account and Admin, then Sign out; a page row links, a window row opens its window — no Edit profile', () => {
    const onWindow = vi.fn()
    const close = vi.fn()
    render(<AccountMenu open close={close} collapsed={false} groups={visibleAccountMenu(finAccountMenu(), carrie as unknown as NavViewer)} onWindow={onWindow} />)
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Meeting Rooms' })).toHaveAttribute('href', '/admin/rooms')
    expect(screen.queryByRole('menuitem', { name: 'Edit profile' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change password' }))
    expect(close).toHaveBeenCalled()
    expect(onWindow).toHaveBeenCalledWith('password')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onWindow).toHaveBeenCalledWith('signout')
  })

  it('draws nothing while closed', () => {
    const { container } = render(<AccountMenu open={false} close={vi.fn()} collapsed={false} groups={[]} onWindow={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Change password', () => {
  it('says the real rule (6 characters) and waits until the two new ones match', async () => {
    render(<ChangePasswordDialog open onClose={vi.fn()} />)
    expect(screen.getByText('At least 6 characters')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-one' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-one-1' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-one-2' } })
    expect(screen.getByText('The two new passwords don’t match.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    })
    expect(actions.changeMyPassword).not.toHaveBeenCalled()
  })

  it('changes it, closes and says so', async () => {
    actions.changeMyPassword.mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    render(<ChangePasswordDialog open onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-one' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-one-1' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-one-1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    })
    expect(actions.changeMyPassword).toHaveBeenCalledWith({ current: 'old-one', next: 'new-one-1', confirm: 'new-one-1' })
    expect(onClose).toHaveBeenCalled()
    expect(toast.flash).toHaveBeenCalledWith('Password changed')
  })
})

describe('Sign out', () => {
  it('asks first, then signs this device out and goes to the sign-in', async () => {
    render(<SignOutDialog open onClose={vi.fn()} />)
    expect(screen.getByText('You will need to sign in again to open the Finance view.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    })
    expect(router.push).toHaveBeenCalledWith('/login')
  })
})

// Request to change email (2026-10-16): the Finance app's Profile opens it — the email they sign in with, their latest
// request, the new one; HR approves it.
describe('Request to change email', () => {
  const waiting = { id: 'r1', ref: 'PF-2610-009', status: 'pending', to: 'carrie.new@mail.com', from: 'carrie@x.my', at: null, decidedAt: null, note: null }

  it('reads the sign-in email, sends the new one, and shows it waiting — with Withdraw', async () => {
    actions.loadMyEmailChange.mockResolvedValue({ email: 'carrie@x.my', latest: null })
    actions.requestEmailChange.mockResolvedValue({ ok: true, mine: { email: 'carrie@x.my', latest: waiting } })
    actions.withdrawEmailChange.mockResolvedValue({ ok: true, mine: { email: 'carrie@x.my', latest: { ...waiting, status: 'cancelled' } } })
    render(<RequestEmailDialog open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('You sign in with')).toHaveValue('carrie@x.my'))
    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'carrie.new@mail.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to HR' }))
    })
    expect(actions.requestEmailChange).toHaveBeenCalledWith('carrie.new@mail.com')
    expect(screen.getByText('Waiting for HR')).toBeInTheDocument()
    expect(screen.getByText('New email · carrie.new@mail.com')).toBeInTheDocument()
    expect(screen.getByText('PF-2610-009')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    })
    expect(actions.withdrawEmailChange).toHaveBeenCalledWith('r1')
    expect(screen.getByLabelText('New email')).toBeInTheDocument()
  })

  it('says the refusal, and keeps the form', async () => {
    actions.loadMyEmailChange.mockResolvedValue({ email: 'carrie@x.my', latest: null })
    actions.requestEmailChange.mockResolvedValue({ ok: false, reason: 'That email already belongs to another login.' })
    render(<RequestEmailDialog open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('You sign in with')).toHaveValue('carrie@x.my'))
    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'hr@venture.my' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to HR' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('That email already belongs to another login.')
    expect(screen.getByLabelText('New email')).toHaveValue('hr@venture.my')
  })
})
