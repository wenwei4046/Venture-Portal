import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@/types'

// Finance's account menu (2026-10-14, the Finance revamp v2 — D13) and the two
// windows it opens: Edit profile (name + phone; the email shows only) and
// Change password (the 2026-10-12 rules), each closing with the design's toast.

const actions = vi.hoisted(() => ({
  loadMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  changeMyPassword: vi.fn(),
}))
vi.mock('@/lib/account/actions', () => actions)
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn(async () => ({})) } }) }))
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
const toast = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/components/hrv/toast', () => toast)

import { AccountMenu, ChangePasswordDialog, EditProfileDialog, SignOutDialog } from './AccountMenu'
import { finAccountMenu, visibleAccountMenu } from './fin-nav'
import type { NavViewer } from './nav-config'

const carrie = { id: 'c', name: 'Ong Mei Shuang', email: 'carrie@x', role: 'finance', permissions: ['treasury', 'meeting_rooms'], personalLogin: true } as unknown as User

beforeEach(() => {
  vi.clearAllMocks()
  actions.loadMyProfile.mockResolvedValue({ name: 'Ong Mei Shuang', email: 'carrie@x', phone: '012-338 4127' })
})

describe('the account menu', () => {
  it('lists Account and Admin, then Sign out; a page row links, a window row opens its window', () => {
    const onWindow = vi.fn()
    const close = vi.fn()
    render(<AccountMenu open close={close} collapsed={false} groups={visibleAccountMenu(finAccountMenu(), carrie as unknown as NavViewer)} onWindow={onWindow} />)
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Meeting Rooms' })).toHaveAttribute('href', '/admin/rooms')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit profile' }))
    expect(close).toHaveBeenCalled()
    expect(onWindow).toHaveBeenCalledWith('profile')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onWindow).toHaveBeenCalledWith('signout')
  })

  it('draws nothing while closed', () => {
    const { container } = render(<AccountMenu open={false} close={vi.fn()} collapsed={false} groups={[]} onWindow={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Edit profile', () => {
  it('opens on the saved name and email at once, the phone once read; the email only shows', async () => {
    render(<EditProfileDialog open onClose={vi.fn()} user={carrie} />)
    expect(screen.getByLabelText('Full name')).toHaveValue('Ong Mei Shuang')
    expect(screen.getByLabelText('Email')).toBeDisabled()
    await waitFor(() => expect(screen.getByLabelText('Phone')).toHaveValue('012-338 4127'))
    expect(screen.getByText('Shown on vouchers you create')).toBeInTheDocument()
  })

  it('saves the name and phone, closes and says so', async () => {
    const onClose = vi.fn()
    actions.updateMyProfile.mockResolvedValue({ ok: true, profile: { name: 'Carrie Ong', email: 'carrie@x', phone: '012-000 0000' } })
    render(<EditProfileDialog open onClose={onClose} user={carrie} />)
    await waitFor(() => expect(screen.getByLabelText('Phone')).toHaveValue('012-338 4127'))
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Carrie Ong' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '012-000 0000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(actions.updateMyProfile).toHaveBeenCalledWith({ name: 'Carrie Ong', phone: '012-000 0000' })
    expect(onClose).toHaveBeenCalled()
    expect(toast.flash).toHaveBeenCalledWith('Profile saved')
  })

  it('shows the refusal and stays open', async () => {
    actions.updateMyProfile.mockResolvedValue({ ok: false, reason: 'This is a shared login, so its profile is not changed here. Edit profile is for a login of your own.' })
    const onClose = vi.fn()
    render(<EditProfileDialog open onClose={onClose} user={carrie} />)
    await waitFor(() => expect(screen.getByLabelText('Phone')).toHaveValue('012-338 4127'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('shared login')
    expect(onClose).not.toHaveBeenCalled()
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
