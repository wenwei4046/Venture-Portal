import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// Disable / enable a login (2026-11-05 — the user: People › Deactivate left the person able to sign in, "这个需要";
// mig 20261105010000): off after a second press, on at once; a full-access login shows why, with no step.

const mocks = vi.hoisted(() => ({ set: vi.fn(), refresh: vi.fn() }))
vi.mock('../login-actions', () => ({ setLoginEnabled: mocks.set }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import LoginSwitch from './LoginSwitch'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.set.mockResolvedValue({ ok: true })
})

describe('LoginSwitch', () => {
  it('disables a login only after a second press, then refreshes the page', async () => {
    render(<LoginSwitch userId="u1" enabled held={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disable login' }))
    expect(mocks.set).not.toHaveBeenCalled()
    expect(screen.getByText(/cannot sign in until it is enabled again/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm — disable login' }))
    })
    expect(mocks.set).toHaveBeenCalledWith('u1', false)
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('enables a disabled login at once', async () => {
    render(<LoginSwitch userId="u1" enabled={false} held={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enable login' }))
    })
    expect(mocks.set).toHaveBeenCalledWith('u1', true)
  })

  it('says the database’s refusal in words', async () => {
    mocks.set.mockResolvedValue({ ok: false, reason: 'This is the last active Principal login — it cannot be turned off' })
    render(<LoginSwitch userId="u1" enabled held={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disable login' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm — disable login' }))
    })
    expect(screen.getByText('This is the last active Principal login — it cannot be turned off')).toBeInTheDocument()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('a full-access login, for HR: the button stays shut and says why', () => {
    render(<LoginSwitch userId="u1" enabled held="A full-access login: only whoever manages permissions turns it off or on." />)
    const b = screen.getByRole('button', { name: 'Disable login' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('title', 'A full-access login: only whoever manages permissions turns it off or on.')
  })
})
